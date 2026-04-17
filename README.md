# MindRound 观思集

跨平台深度阅读与对话应用。用户与「作者人格」对话，支持单聊与群聊（圆桌）。当前版本在「纯对话」之上接入了 **Agent 循环**：模型可调用联网与本地工具，人物卡（Persona）的 `SKILL.md` 作为系统提示注入。

## 核心能力

- **单聊 / 群聊**：群聊按 `personaIds` 顺序圆桌发言；群聊上下文会映射他人发言并**不共享**工具轨迹，避免噪声。
- **Agent**：OpenAI 兼容 API，`tools` + 流式 SSE；多轮直到 `finish_reason !== tool_calls` 或达到迭代上限。
- **工具**：联网（`web_search` / `web_fetch`）与本地（`read_file` / `write_file` / `update_file` / `search_file` / `execute_command`）均在 **Tauri Rust 命令**中执行，前端通过 `invoke` 调用。
- **权限**：读沙箱内可静默；读沙箱外、一切写与执行需用户确认（可「仅此次」或「本会话允许」）。
- **缓存**：可缓存工具按 chat 持久化到 `chats/<id>/tool_cache.json`，减少重复搜索/读取。
- **长上下文**：对历史中的 tool 结果做折叠占位，并可在 user 边界裁切消息条数。

## 技术结构（分层）

| 层级 | 职责 |
|------|------|
| **UI** | 页面、气泡（含 `toolCalls` / `role=tool` 折叠展示）、权限确认弹框、设置中的搜索引擎与工作目录 |
| **ChatService** | 用户消息入库 → 调用 `Agent.run()` → 流式/落库消息回调 UI；记忆摘要时过滤 tool 并弱化 `toolCalls` |
| **Agent** | 组装 `messages` + `tools` → SSE 解析 → 工具执行（缓存 → 权限 → `invoke`）→ 回喂模型 |
| **HttpApiRepository** | OpenAI 兼容 `chat` 流：`text_delta` / `tool_call_delta` / `done` |
| **ToolRegistry** | 内置 7 个工具的 schema 与 `ITool.run` |
| **PermissionService** | 按工具权限类与用户决策生成是否允许及是否绕过沙箱 |
| **ToolResultCache** | 按工具名 + 规范化参数哈希缓存结果 |
| **ContextTrimmer** | 折叠较早的 tool 内容、按 user 边界截断 |
| **Tauri commands** | `agent_*`：搜索、抓取（含 SSRF 校验）、文件、执行命令（超时与硬拒绝规则） |

数据与持久化仍走既有 **Repository + 文件型存储**（聊天目录、消息 JSON、记忆 Markdown 等）。

## 近期变更摘要（Agent 化）

- 消息模型对齐 OpenAI 线格式：`assistant.toolCalls`、`role: 'tool'` 与 `toolCallId` / `name` / `cached`。
- 前端 `HttpApiRepository` 支持流式 tool_calls；`Agent` 实现多轮 tool 循环。
- 新增 `src/core/agent/`：`types`、`Agent`、`PermissionService`、`ToolResultCache`、`ContextTrimmer`、`tools/*`、`invoke`。
- `src-tauri` 增加 `search` / `fetch` / `fs` / `exec` 等命令及单元测试（DDG 解析、SSRF、沙箱、exec 超时等）。
- 设置页：搜索引擎（DDG / Tavily / Serper）与额外工作沙箱目录；`App` 装配 Agent、缓存与权限弹框（含移动端全屏分支）。
- Windows 打包：`tauri.conf.json` 中 `bundle.targets` 为 **nsis**，identifier 为 `com.mindround`。

## 项目结构（关键路径）

```
mindRound/
├── src/
│   ├── core/
│   │   ├── agent/                 # Agent 循环、权限、缓存、裁剪、工具注册与实现
│   │   ├── domain/                # Chat、MessageDTO（含 tool 相关字段）
│   │   ├── repositories/          # IApiRepository、IConfigRepository 等
│   │   ├── services/              # ChatService、ContextBuilderService、MemoryService …
│   │   └── infrastructure/        # HttpApiRepository、FileChatRepository、平台适配器
│   ├── ui/
│   │   ├── pages/                 # ChatPage、SettingsPage、SessionsPage …
│   │   ├── components/            # MessageBubble、PermissionConfirmDialog …
│   │   └── stores/                # Zustand
│   └── App.tsx                    # Agent / Permission / ChatService 装配入口
├── src-tauri/
│   ├── src/commands/              # agent_web_search、agent_web_fetch、agent_*_file、agent_execute_command …
│   └── tauri.conf.json            # 打包：当前 Windows 目标为 nsis
└── docs/                          # 设计文档
```

## 配置说明（与应用相关）

- **API**：Base URL、API Key、Model（设置页「API 配置」）。
- **Agent 搜索**：`searchProvider`（`ddg` | `tavily` | `serper`）与可选 `searchApiKey`（非 DDG 时需要）。
- **工作沙箱**：`sandboxFolders` 为额外根目录；应用数据目录始终作为沙箱根之一（读沙箱内读文件通常不需弹窗）。

配置持久化由 `FileConfigRepository` 等负责，具体字段见 `src/core/repositories/IConfigRepository.ts`。

## Windows 打包产物

执行 `npm run tauri build` 后（需本机 Rust / NSIS 依赖由 Tauri CLI 拉取或已就绪）：

- **安装包（NSIS）**：`src-tauri/target/release/bundle/nsis/MindRound_<version>_x64-setup.exe`
- **可直接运行的 exe**：`src-tauri/target/release/app.exe`（便携分发可把该文件与 Tauri 运行时依赖一并考虑；安装包方式更省事）

## 开发命令

```bash
npm run dev          # 前端 Vite 开发
npm run build        # tsc -b + vite 生产构建（Tauri beforeBuildCommand 同源）
npm run test         # Vitest（可加 --run 做单次执行）
npm run type-check   # 类型检查
npm run lint         # ESLint
npm run coverage     # 测试覆盖率
npm run tauri dev    # Tauri 开发
npm run tauri build # Tauri 生产打包（当前 Windows 为 NSIS）
```

Rust 侧单元测试：

```bash
cd src-tauri && cargo test
```

## 项目状态

**阶段**：开发中（MVP 演进中，已具备 Agent + 工具链与 Windows NSIS 打包路径）。

## 开发规范

详见 [CLAUDE.md](./CLAUDE.md)

## 文档

- [详细设计](./docs/详细设计.md)
- [MVP功能清单](./docs/MVP功能清单.md)
- [开发测试计划](./docs/开发测试计划.md)
