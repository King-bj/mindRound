//! Agent 工具：execute_command。带超时 + stdout/stderr 截断 + 危险命令粗过滤。
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::time::timeout;

/// 默认命令执行超时
const DEFAULT_TIMEOUT_MS: u64 = 30_000;
/// 单流输出截断
const MAX_STREAM_BYTES: usize = 8 * 1024;

/// 绝不允许执行的关键词（粗过滤，UI 弹框仍是主防线）
const HARD_DENY_KEYWORDS: &[&str] = &[
    "format c:",
    "format d:",
    "rm -rf /",
    "rm -rf c:",
    "del /f /q c:\\",
    "shutdown /",
    "reg delete hkey",
    ":(){ :|:& };:",
    "mkfs.",
];

#[derive(Debug, Deserialize)]
pub struct ExecArgs {
    pub command: String,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct ExecResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub timed_out: bool,
    pub truncated_stdout: bool,
    pub truncated_stderr: bool,
}

#[tauri::command]
pub async fn agent_execute_command(args: ExecArgs) -> Result<ExecResult, String> {
    if args.command.trim().is_empty() {
        return Err("command 为空".to_string());
    }
    hard_deny_check(&args.command)?;

    let timeout_ms = args.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS).clamp(500, 300_000);

    let mut cmd = build_platform_command(&args.command);
    if let Some(cwd) = args.cwd.as_deref().filter(|c| !c.trim().is_empty()) {
        cmd.current_dir(cwd);
    }
    cmd.stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);

    let mut child = cmd.spawn().map_err(|e| format!("spawn: {}", e))?;

    let stdout = child.stdout.take().ok_or("无法捕获 stdout")?;
    let stderr = child.stderr.take().ok_or("无法捕获 stderr")?;

    let dur = Duration::from_millis(timeout_ms);

    let wait_fut = async move {
        let status = child.wait().await?;
        let mut out_buf = Vec::new();
        let mut err_buf = Vec::new();
        let (_, _) = tokio::join!(
            read_to_limit(stdout, &mut out_buf, MAX_STREAM_BYTES),
            read_to_limit(stderr, &mut err_buf, MAX_STREAM_BYTES),
        );
        Ok::<(std::process::ExitStatus, Vec<u8>, Vec<u8>), std::io::Error>((status, out_buf, err_buf))
    };

    match timeout(dur, wait_fut).await {
        Ok(Ok((status, out, err))) => {
            let out_truncated = out.len() >= MAX_STREAM_BYTES;
            let err_truncated = err.len() >= MAX_STREAM_BYTES;
            Ok(ExecResult {
                stdout: String::from_utf8_lossy(&out).to_string(),
                stderr: String::from_utf8_lossy(&err).to_string(),
                exit_code: status.code(),
                timed_out: false,
                truncated_stdout: out_truncated,
                truncated_stderr: err_truncated,
            })
        }
        Ok(Err(e)) => Err(format!("wait: {}", e)),
        Err(_) => Ok(ExecResult {
            stdout: String::new(),
            stderr: format!("[超时 {}ms 已终止]", timeout_ms),
            exit_code: None,
            timed_out: true,
            truncated_stdout: false,
            truncated_stderr: false,
        }),
    }
}

fn hard_deny_check(command: &str) -> Result<(), String> {
    let lower = command.to_ascii_lowercase();
    for kw in HARD_DENY_KEYWORDS {
        if lower.contains(kw) {
            return Err(format!("命令包含禁止关键词：{}", kw));
        }
    }
    Ok(())
}

fn build_platform_command(command: &str) -> Command {
    #[cfg(target_os = "windows")]
    {
        let mut c = Command::new("powershell.exe");
        c.arg("-NoProfile")
            .arg("-NonInteractive")
            .arg("-Command")
            .arg(command);
        c
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut c = Command::new("sh");
        c.arg("-c").arg(command);
        c
    }
}

async fn read_to_limit<R: AsyncReadExt + Unpin>(
    mut reader: R,
    buf: &mut Vec<u8>,
    limit: usize,
) -> std::io::Result<()> {
    let mut tmp = [0u8; 4096];
    while buf.len() < limit {
        let n = reader.read(&mut tmp).await?;
        if n == 0 {
            break;
        }
        let remaining = limit - buf.len();
        let take = n.min(remaining);
        buf.extend_from_slice(&tmp[..take]);
        if n >= remaining {
            break;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hard_deny_catches_format_c() {
        assert!(hard_deny_check("format C: /Q").is_err());
        assert!(hard_deny_check("echo hi").is_ok());
    }

    #[tokio::test]
    async fn timeout_kills_long_command() {
        // Windows 使用 powershell，非 Windows 使用 sh
        let cmd = if cfg!(target_os = "windows") {
            "Start-Sleep -Seconds 5".to_string()
        } else {
            "sleep 5".to_string()
        };
        let r = agent_execute_command(ExecArgs {
            command: cmd,
            cwd: None,
            timeout_ms: Some(500),
        })
        .await
        .unwrap();
        assert!(r.timed_out);
    }

    #[tokio::test]
    async fn capture_stdout() {
        let cmd = if cfg!(target_os = "windows") {
            "Write-Output 'hello-mr'".to_string()
        } else {
            "echo hello-mr".to_string()
        };
        let r = agent_execute_command(ExecArgs {
            command: cmd,
            cwd: None,
            timeout_ms: Some(10_000),
        })
        .await
        .unwrap();
        assert!(!r.timed_out);
        assert!(r.stdout.contains("hello-mr"));
    }
}
