//! Agent 工具：文件读写 + 搜索。所有命令都走 `sandbox` 校验；
//! TS 侧 PermissionService 在拿到用户 confirm 后，才将 `allow_outside_sandbox` 置 true。
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;

/// 读取上限（字节），防止把超大文件全量吐给模型
const READ_MAX_BYTES: u64 = 256 * 1024;

/// 二进制 hex 预览的最大字节
const BINARY_PREVIEW_BYTES: usize = 4 * 1024;

/// Windows 保留目录（小写匹配）
const RESERVED_DIRS: &[&str] = &[
    "windows",
    "program files",
    "program files (x86)",
    "programdata",
    "windowsapps",
    "$recycle.bin",
    "system volume information",
];

#[derive(Debug, Deserialize)]
pub struct SandboxCtx {
    /// 用户已授权访问 sandbox 外（一次性/本会话）
    #[serde(default)]
    pub allow_outside_sandbox: bool,
    /// 已授权的 sandbox 根列表（appData + 用户工作目录）
    #[serde(default)]
    pub sandbox_roots: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct ReadFileArgs {
    pub path: String,
    #[serde(flatten)]
    pub ctx: SandboxCtx,
}

#[derive(Debug, Serialize)]
pub struct ReadFileResult {
    pub path: String,
    pub content: String,
    pub truncated: bool,
    pub is_binary: bool,
    pub size: u64,
}

#[tauri::command]
pub async fn agent_read_file(args: ReadFileArgs) -> Result<ReadFileResult, String> {
    let path = resolve_and_validate(&args.path, &args.ctx, /*must_exist=*/ true)?;
    let meta = fs::metadata(&path).map_err(|e| format!("stat: {}", e))?;
    if meta.is_dir() {
        return Err(format!("路径是目录：{}", path.display()));
    }

    let size = meta.len();
    let read_len = size.min(READ_MAX_BYTES) as usize;

    let mut buf = vec![0u8; read_len];
    let mut f = fs::File::open(&path).map_err(|e| format!("open: {}", e))?;
    f.read_exact(&mut buf).ok(); // 短读也接受

    let is_binary = looks_binary(&buf);
    let content = if is_binary {
        let preview = &buf[..buf.len().min(BINARY_PREVIEW_BYTES)];
        format!(
            "[二进制文件，hex 预览前 {} / {} 字节]\n{}",
            preview.len(),
            size,
            hex_encode(preview)
        )
    } else {
        String::from_utf8_lossy(&buf).to_string()
    };

    Ok(ReadFileResult {
        path: path.to_string_lossy().to_string(),
        content,
        truncated: size > READ_MAX_BYTES,
        is_binary,
        size,
    })
}

#[derive(Debug, Deserialize)]
pub struct WriteFileArgs {
    pub path: String,
    pub content: String,
    #[serde(flatten)]
    pub ctx: SandboxCtx,
}

#[tauri::command]
pub async fn agent_write_file(args: WriteFileArgs) -> Result<u64, String> {
    let path = resolve_and_validate(&args.path, &args.ctx, /*must_exist=*/ false)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir parent: {}", e))?;
    }
    let bytes = args.content.as_bytes();
    let mut f = fs::File::create(&path).map_err(|e| format!("create: {}", e))?;
    f.write_all(bytes).map_err(|e| format!("write: {}", e))?;
    Ok(bytes.len() as u64)
}

#[derive(Debug, Deserialize)]
pub struct UpdateFileArgs {
    pub path: String,
    pub old_string: String,
    pub new_string: String,
    #[serde(default)]
    pub replace_all: bool,
    #[serde(flatten)]
    pub ctx: SandboxCtx,
}

#[derive(Debug, Serialize)]
pub struct UpdateFileResult {
    pub replacements: usize,
}

#[tauri::command]
pub async fn agent_update_file(args: UpdateFileArgs) -> Result<UpdateFileResult, String> {
    if args.old_string.is_empty() {
        return Err("old_string 不可为空".to_string());
    }
    if args.old_string == args.new_string {
        return Err("old_string 与 new_string 相同".to_string());
    }

    let path = resolve_and_validate(&args.path, &args.ctx, /*must_exist=*/ true)?;
    let original = fs::read_to_string(&path).map_err(|e| format!("read: {}", e))?;

    let occurrences = count_occurrences(&original, &args.old_string);
    if occurrences == 0 {
        return Err("old_string 未在文件中找到".to_string());
    }
    if occurrences > 1 && !args.replace_all {
        return Err(format!(
            "old_string 在文件中出现 {} 次，请提供更长的上下文或设置 replace_all=true",
            occurrences
        ));
    }

    let updated = if args.replace_all {
        original.replace(&args.old_string, &args.new_string)
    } else {
        original.replacen(&args.old_string, &args.new_string, 1)
    };

    fs::write(&path, updated).map_err(|e| format!("write: {}", e))?;
    Ok(UpdateFileResult {
        replacements: if args.replace_all { occurrences } else { 1 },
    })
}

#[derive(Debug, Deserialize)]
pub struct SearchFileArgs {
    pub pattern: String,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub glob: Option<String>,
    #[serde(default)]
    pub max_results: Option<usize>,
    #[serde(flatten)]
    pub ctx: SandboxCtx,
}

#[derive(Debug, Serialize)]
pub struct SearchHit {
    pub path: String,
    pub line: u32,
    pub preview: String,
}

#[tauri::command]
pub async fn agent_search_file(args: SearchFileArgs) -> Result<Vec<SearchHit>, String> {
    let base_raw = args.path.unwrap_or_else(|| ".".to_string());
    let base = resolve_and_validate(&base_raw, &args.ctx, /*must_exist=*/ true)?;
    let max_results = args.max_results.unwrap_or(50).clamp(1, 500);

    let re = regex::Regex::new(&args.pattern).map_err(|e| format!("invalid regex: {}", e))?;
    let glob_matcher = args
        .glob
        .as_deref()
        .filter(|g| !g.is_empty())
        .map(|g| {
            let mut b = ignore::overrides::OverrideBuilder::new(&base);
            b.add(g).map_err(|e| format!("bad glob: {}", e))?;
            b.build().map_err(|e| format!("build glob: {}", e))
        })
        .transpose()?;

    let mut walker = ignore::WalkBuilder::new(&base);
    walker.hidden(false).follow_links(false);
    if let Some(m) = glob_matcher {
        walker.overrides(m);
    }
    let walker = walker.build();

    let mut hits = Vec::new();
    for entry in walker.flatten() {
        if hits.len() >= max_results {
            break;
        }
        let p = entry.path();
        if !p.is_file() {
            continue;
        }
        // 跳过很大的文件，避免卡死
        if let Ok(meta) = p.metadata() {
            if meta.len() > 2 * 1024 * 1024 {
                continue;
            }
        }
        let Ok(content) = fs::read_to_string(p) else {
            continue;
        };
        for (idx, line) in content.lines().enumerate() {
            if hits.len() >= max_results {
                break;
            }
            if re.is_match(line) {
                hits.push(SearchHit {
                    path: p.to_string_lossy().to_string(),
                    line: (idx + 1) as u32,
                    preview: line.chars().take(240).collect(),
                });
            }
        }
    }
    Ok(hits)
}

// ===================== 路径校验 =====================

/// 返回 canonical 化后的绝对路径，并做 sandbox / 保留目录 / 路径穿越校验
pub fn resolve_and_validate(
    input: &str,
    ctx: &SandboxCtx,
    must_exist: bool,
) -> Result<PathBuf, String> {
    let raw = PathBuf::from(input.trim());
    if raw.as_os_str().is_empty() {
        return Err("path 为空".to_string());
    }

    let abs = if must_exist {
        raw.canonicalize()
            .map_err(|e| format!("canonicalize {}: {}", raw.display(), e))?
    } else {
        let parent = raw
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .map(|p| {
                p.canonicalize()
                    .map_err(|e| format!("canonicalize parent {}: {}", p.display(), e))
            })
            .transpose()?;
        match parent {
            Some(p) => p.join(
                raw.file_name()
                    .ok_or_else(|| "缺少 file_name".to_string())?,
            ),
            None => raw.clone(),
        }
    };

    let abs_str = strip_unc_prefix(&abs.to_string_lossy());

    if is_reserved_dir(&abs_str) {
        return Err(format!("拒绝访问系统保留目录：{}", abs_str));
    }

    if ctx.allow_outside_sandbox {
        return Ok(abs);
    }

    if ctx.sandbox_roots.is_empty() {
        return Err("sandbox 根为空，请先在设置中添加工作目录或确认访问".to_string());
    }
    for root in &ctx.sandbox_roots {
        let canon_root = PathBuf::from(root)
            .canonicalize()
            .unwrap_or_else(|_| PathBuf::from(root));
        let root_str = strip_unc_prefix(&canon_root.to_string_lossy());
        if is_subpath(&abs_str, &root_str) {
            return Ok(abs);
        }
    }
    Err(format!(
        "路径不在 sandbox 内：{}（请用户确认或添加工作目录）",
        abs_str
    ))
}

fn strip_unc_prefix(s: &str) -> String {
    let s = s.trim_start_matches(r"\\?\");
    let s = s.trim_start_matches(r"\\.\");
    s.to_string()
}

fn is_subpath(child: &str, root: &str) -> bool {
    let c = child.to_ascii_lowercase().replace('\\', "/");
    let r = root.trim_end_matches(['/', '\\']).to_ascii_lowercase().replace('\\', "/");
    if c == r {
        return true;
    }
    c.starts_with(&format!("{}/", r))
}

fn is_reserved_dir(abs_str: &str) -> bool {
    let s = abs_str.to_ascii_lowercase().replace('\\', "/");
    // 去掉盘符 `c:/` 之类
    let tail = if s.len() >= 3 && s.as_bytes()[1] == b':' {
        &s[2..]
    } else {
        s.as_str()
    };
    let trimmed = tail.trim_start_matches('/');
    for r in RESERVED_DIRS {
        if trimmed == *r || trimmed.starts_with(&format!("{}/", r)) {
            return true;
        }
    }
    false
}

fn looks_binary(buf: &[u8]) -> bool {
    if buf.is_empty() {
        return false;
    }
    let sample = &buf[..buf.len().min(4096)];
    let null_bytes = sample.iter().filter(|b| **b == 0).count();
    let high = sample
        .iter()
        .filter(|b| **b < 9 || (**b >= 14 && **b < 32))
        .count();
    null_bytes > 0 || (high as f64 / sample.len() as f64) > 0.05
}

fn count_occurrences(s: &str, pat: &str) -> usize {
    if pat.is_empty() {
        return 0;
    }
    let mut n = 0;
    let mut idx = 0;
    while let Some(pos) = s[idx..].find(pat) {
        n += 1;
        idx += pos + pat.len();
    }
    n
}

fn hex_encode(b: &[u8]) -> String {
    let mut out = String::with_capacity(b.len() * 3);
    for (i, byte) in b.iter().enumerate() {
        if i > 0 && i % 16 == 0 {
            out.push('\n');
        } else if i > 0 {
            out.push(' ');
        }
        out.push_str(&format!("{:02x}", byte));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx_with_roots(roots: Vec<&str>) -> SandboxCtx {
        SandboxCtx {
            allow_outside_sandbox: false,
            sandbox_roots: roots.into_iter().map(String::from).collect(),
        }
    }

    #[test]
    fn is_subpath_accepts_child() {
        assert!(is_subpath("/tmp/app/foo/bar.txt", "/tmp/app"));
        assert!(is_subpath("/tmp/app", "/tmp/app"));
        // Windows 风格
        assert!(is_subpath("c:/users/x/work/a.md", "c:/users/x/work"));
    }

    #[test]
    fn is_subpath_rejects_sibling() {
        assert!(!is_subpath("/tmp/apptest/foo", "/tmp/app"));
        assert!(!is_subpath("/tmp/other/foo", "/tmp/app"));
    }

    #[test]
    fn reserved_dir_matches_windows_paths() {
        assert!(is_reserved_dir(r"C:\Windows\System32"));
        assert!(is_reserved_dir(r"C:\Program Files\App"));
        assert!(is_reserved_dir(r"C:\ProgramData\Foo"));
        assert!(!is_reserved_dir(r"C:\Users\me\Documents"));
    }

    #[test]
    fn count_occurrences_basic() {
        assert_eq!(count_occurrences("abc abc abc", "abc"), 3);
        assert_eq!(count_occurrences("aaa", "aa"), 1);
        assert_eq!(count_occurrences("hello", "z"), 0);
    }

    #[test]
    fn reject_outside_sandbox() {
        let tmp = std::env::temp_dir();
        let sub = tmp.join("mr_test_outside");
        std::fs::create_dir_all(&sub).unwrap();
        let f = sub.join("a.txt");
        std::fs::write(&f, "hi").unwrap();

        // sandbox 根只包含一个不相关目录
        let other = tmp.join("mr_other");
        std::fs::create_dir_all(&other).unwrap();
        let ctx = ctx_with_roots(vec![other.to_str().unwrap()]);
        let err = resolve_and_validate(f.to_str().unwrap(), &ctx, true).unwrap_err();
        assert!(err.contains("sandbox"));
    }

    #[test]
    fn accept_inside_sandbox() {
        let tmp = std::env::temp_dir();
        let root = tmp.join("mr_test_sandbox");
        std::fs::create_dir_all(&root).unwrap();
        let f = root.join("a.txt");
        std::fs::write(&f, "hi").unwrap();

        let ctx = ctx_with_roots(vec![root.to_str().unwrap()]);
        let p = resolve_and_validate(f.to_str().unwrap(), &ctx, true).unwrap();
        assert!(p.ends_with("a.txt"));
    }

    #[test]
    fn allow_outside_sandbox_bypasses_root_check() {
        let tmp = std::env::temp_dir();
        let f = tmp.join("mr_test_any.txt");
        std::fs::write(&f, "x").unwrap();
        let ctx = SandboxCtx {
            allow_outside_sandbox: true,
            sandbox_roots: vec![],
        };
        resolve_and_validate(f.to_str().unwrap(), &ctx, true).unwrap();
    }
}
