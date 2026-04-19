# MindRound 观思集

> 和你读过的书的作者聊天。本地运行，使用自己的 API Key，数据留在本机。

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D6)](#下载与安装)
[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri%202-24C8DB)](https://tauri.app)
[![Release](https://img.shields.io/badge/release-v0.1.0-brightgreen)](https://github.com/King-bj/mindRound/releases)

**MindRound**（观书见意，集思论道）是一个把"作者人格"本地化的桌面应用。你可以和一位作者单独聊天，也可以把多位作者拉到一个"圆桌"里就同一个话题轮流发言。模型调用 OpenAI 兼容 API，数据与人物卡都只在本机。

---

## 能做什么

- **单聊**：和一位作者人格一对一对话。每张人物卡就是一个带 `SKILL.md` 的文件夹。
- **群聊 / 圆桌**：把多位作者放进同一个会话，按顺序轮流发言，上下文互不污染工具轨迹。
- **Agent 工具**：模型可以调用联网搜索、网页抓取、本地文件读写、执行命令；所有写操作与越界读取都需要你授权。
- **本地优先**：人物卡、聊天记录、长期记忆 `memory.md` 全部是本机文件，随时可备份、可导出。
- **使用自己的 Key**：OpenAI 兼容的 Base URL + API Key + Model 三项填好即可，支持主流兼容服务。

---

## 下载与安装

### Windows（推荐）

1. 到 [Releases](https://github.com/King-bj/mindRound/releases) 下载 `MindRound_0.1.0_x64-setup.exe`。
2. 双击安装，首次启动会在 `%APPDATA%/MindRound` 创建数据目录。

### 从源码运行

```bash
git clone https://github.com/King-bj/mindRound.git
cd mindRound
npm install
npm run tauri dev       # 开发模式
npm run tauri build     # 本地打包（生成 NSIS 安装包与可执行文件）
```

环境要求：Node 18+、Rust 工具链（Tauri CLI 会在首次打包时拉取 NSIS 依赖）。

---

## 一分钟上手

```
1. 打开「设置」→ 填入 Base URL / API Key / Model → 保存
2. 准备一张人物卡：随便一个文件夹，里面放一份 SKILL.md（可再加 avatar.png）
3. 把这个文件夹复制到 数据目录/personae/ 下
4. 回到「通讯录」→ 点「刷新」→ 作者出现 → 点开就能聊
5. 想开圆桌：在「会话」点 [+]，勾 2 位以上作者，给群起个名字
```

最小的一张 `SKILL.md` 示例：

```markdown
---
name: 乔布斯
description: 苹果联合创始人
---

你是一位产品设计师，崇尚简约和专注……
```

---

## 数据目录

应用所有数据都在一个你可见的文件夹下，默认：

```
%APPDATA%/MindRound/
├── personae/              # 作者库，每个子目录是一张人物卡
│   └── <name>/
│       ├── SKILL.md       # 必需，整文件作为该作者的 system prompt
│       └── avatar.png     # 可选
├── chats/                 # 所有会话
│   └── <uuid>/
│       ├── meta.json      # 会话元数据
│       ├── messages.json  # 消息历史
│       ├── memory.md      # 长期记忆（按策略自动更新）
│       └── tool_cache.json  # 可缓存工具的结果（Agent 模式）
└── settings.json          # API 与工作沙箱等配置
```

需要换位置，在「设置 → 数据目录」指定即可。

---

## 配置要点

| 设置 | 说明 |
|---|---|
| **API** | Base URL、API Key、Model。任何 OpenAI 兼容服务都可以。 |
| **搜索引擎** | `ddg`（默认，免 Key）/ `tavily` / `serper`，后两者需要各自的 API Key。 |
| **工作沙箱** | `sandboxFolders`：允许 Agent 免确认读取的额外根目录。应用数据目录本身始终在沙箱内。 |
| **权限粒度** | 读沙箱内静默；读越界、写、执行命令都会弹出确认，可选"仅此次"或"本会话允许"。 |

---

## 上下文规则（为什么回答质量稳定）

每次请求模型，发出的上下文按固定顺序拼装：

1. **系统消息**：当前发言作者的 `SKILL.md` 全文。
2. **长期记忆**：该会话的 `memory.md`（空闲时自动摘要历史）。
3. **近期窗口**：距请求时刻往前 **30 分钟**内的消息。

群聊中每一跳对应"当前发言的那位作者"，其他作者的消息作为对话文本传入，但**不共享工具调用轨迹**——这样不会有 A 的联网结果影响 B 的判断。

---

## 技术栈

- **前端**：React 19 + Vite + Tailwind CSS + Zustand
- **桌面壳**：Tauri 2（Rust）
- **打包**：Windows NSIS
- **API 协议**：OpenAI 兼容的 `chat.completions` + SSE 流 + `tools` 字段
- **存储**：文件系统（JSON + Markdown），无数据库

---

## 路线图

| 阶段 | 做什么 |
|---|---|
| **MVP（当前 v0.1.0）** | 单聊 / 圆桌 / Agent 工具 / 权限确认 / Windows 安装包 |
| **生产部署** | 首次引导、人物卡 GitHub 导入、导出对话、Android 版本 |
| **优化** | 自动更新、主题切换、备份恢复、人物市场 |

---

## 反馈与贡献

- Issue 与 PR：欢迎提到 [GitHub Issues](https://github.com/King-bj/mindRound/issues)。
- 开发规范：见 [CLAUDE.md](./CLAUDE.md)。
- 详细设计与 MVP 拆解：
  - [docs/plan.md](./docs/plan.md)
  - [docs/MVP功能清单.md](./docs/MVP功能清单.md)
  - [docs/详细设计.md](./docs/详细设计.md)
  - [docs/开发测试计划.md](./docs/开发测试计划.md)

作者：[植木自生](https://docs.jinla.fun) · 博文：[从 0 到 1 做一个「和作者聊天」的桌面应用](https://docs.jinla.fun/articles/mindRound-from-zero-to-one)

---

## 致谢

- [Tauri](https://tauri.app) 让跨平台桌面应用变得轻量可控。
- OpenAI 兼容协议让自带 Key 的应用能接入绝大多数模型服务。
- 人物卡灵感来自社区里 [distilled-persona-hall](https://github.com/BiscuitCoder/distilled-persona-hall)  。
- 蒸馏灵感来自于[女娲] (https://github.com/alchaincyf/nuwa-skill)

---

## 许可

本项目以 [Apache License 2.0](./LICENSE) 开源。人物卡目录下的 `LICENSE` 文件保留各自的原始许可。
