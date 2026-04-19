# Skill 协议（MindRound）

> 本文档说明 MindRound 中"作者人格"如何按 Anthropic Agent Skills 协议组织，
> 以及单聊 / 圆桌运行时如何按"渐进披露（progressive disclosure）"加载 Skill。
>
> 参考资料：
> - [Anthropic：Claude API skill](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/claude-api-skill)
> - [ModelScope：Agent Skills 技术协议与开源实现](https://www.modelscope.cn/learn/2558)

---

## 1. 一个 Skill = 一个文件夹

每个人格就是一个独立 Skill，对应 `personae/<skill-id>/` 下的一个目录：

```
personae/
└── <skill-id>/
    ├── SKILL.md                   # 必需。frontmatter + 正文（激活规则、协议）
    ├── README.md                  # 可选。给人看的说明
    ├── LICENSE                    # 可选。资源原始许可
    ├── avatar.png                 # 可选。头像（运行时用）
    ├── references/                # 可选。Level 3 研究材料
    │   └── research/
    │       ├── 01-writings.md
    │       ├── 02-conversations.md
    │       └── ...
    └── examples/                  # 可选。Level 3 示例对话/输出
        └── demo-conversation.md
```

`<skill-id>` 即目录名（推荐 `xxx-skill` / `xxx-perspective-skill`），也是
`list_skills` 工具与 `read_skill_resource` 工具看到的 ID。

---

## 2. 三层加载（Progressive Disclosure）

| 层级 | 内容 | 何时进入上下文 |
|---|---|---|
| **Level 1** Discovery Card | `SKILL.md` frontmatter 的 `name` + `displayName` + `description` + `tags` | 圆桌中所有"在场其他人"的元信息常驻 system；可被 `list_skills` 工具枚举 |
| **Level 2** Skill Body | `SKILL.md` 正文（frontmatter 之后的全部 markdown） | **仅当前激活 Skill** 注入 system；其他人不注入正文 |
| **Level 3** Resources | `references/**` 与 `examples/**` 下任意 `.md` / `.txt` / `.json` / `.yaml` 文件 | 永不预注入；模型按需通过 `list_skill_resources` 与 `read_skill_resource` 工具拉取 |

设计目标：

- **降低污染**：圆桌里别人的长文档（动辄数千字）不会冲淡当前发言人的身份。
- **可扩展**：Skill 可以挂大量研究材料 / 示例，但运行时上下文依然轻量。
- **安全**：Level 3 读取被 `assertSafeSkillResourcePath` 限制在 `references/**` 与 `examples/**`，无法越界读取宿主文件。

---

## 3. SKILL.md frontmatter 字段

```yaml
---
name: paul-graham-perspective       # 必需。Skill 的程序化名称（kebab-case）
displayName: Paul Graham            # 推荐。人类可读名称；展示用
description: |                       # 必需。讨论 / 触发该 Skill 的情境
  Paul Graham 的思维框架与表达方式 ...
  当用户提到「用 PG 的视角」「Paul Graham 会怎么看」时使用。
tags: [创业, 写作, 投资]             # 可选。便于过滤 / 聚类
---
```

约束：

- `description` 应该既描述"是什么"，也描述"何时用"。这是 Anthropic 协议的核心建议——它直接被模型用来决定是否激活该 Skill。
- 内容应保持 30–500 字之间。过长会降低 discovery card 的可读性。
- `name` 与目录名 `<skill-id>` 不必完全一致，但建议保持一致以减少心智负担。

---

## 4. 激活语义（MindRound 的选择）

MindRound 采用 **Explicit Binding**：

- **单聊**：用户在通讯录中选定 persona 时即"绑定"该 Skill；运行时 system 注入 Level 2 正文。
- **圆桌**：`ChatService` 按 `personaIds` 顺序逐位发言；每跳显式激活当前发言人的 Skill。模型不可在一次回合内"切换"自己扮演的角色，避免身份漂移。

下面是单跳 system prompt 的标准结构：

### 单聊

```
[SKILL ACTIVE]
id: <skill-id>
name: <displayName>
description: <一行摘要>

<SKILL.md 正文>

[MEMORY]   # 若长期记忆非空
<memory.md 内容>

# 当前日期：YYYY-MM-DD ...
```

### 圆桌每跳

```
[SKILL ACTIVE]
id: <current skill-id>
name: <displayName>
description: <一行摘要>

<当前发言人 SKILL.md 正文>

[OTHERS PRESENT]
- <other-id-1> (<其名字>): <其 description 一行>
- <other-id-2> (<其名字>): <其 description 一行>
（如需引述/反驳他人，可用 list_skill_resources / read_skill_resource
读取其 references / examples；不得冒充其身份发言。）

[ROUNDTABLE SCENE]
你现在身处一个名为「圆桌会谈」的多人群聊中。
你正在扮演：<displayName>。
你的听众既包括提出问题的[观众]，也包括其他几位正在旁听你发言的人格：<其他人名字>。
...

# 当前日期：YYYY-MM-DD ...
```

收尾还会在 `messages` 末尾追加一条 user 角色的 `finalInstruction`，硬约束当前发言人优先回答[观众]问题。详见
[`buildFinalInstruction`](../src/core/services/ContextBuilderService.ts)。

---

## 5. Skill 工具三件套

注册位置：[`src/core/agent/tools/skillResources.ts`](../src/core/agent/tools/skillResources.ts)。
模型在普通对话中可像调用 `web_search` 一样调用它们。

| 工具名 | 入参 | 用途 |
|---|---|---|
| `list_skills` | `{ tag?: string }` | 返回所有 Skill 的 discovery card（id / name / description / tags） |
| `list_skill_resources` | `{ skill_id: string }` | 返回该 Skill 的 Level 3 资源相对路径列表 |
| `read_skill_resource` | `{ skill_id: string, path: string }` | 读取一个 Level 3 资源文件正文；`path` 必须以 `references/` 或 `examples/` 开头 |

权限：三个工具均为 `read-any`（仓储层路径校验已经把它们限制在数据目录内 `personae/<id>/{references,examples}/**`），不会触发权限弹框。

典型用法：

- 模型扮演 Paul Graham 时被问到 Steve Jobs 的设计哲学 → 调用
  `list_skill_resources({ skill_id: "steve-jobs-skill" })` 找到相关 reference，
  再 `read_skill_resource({ skill_id: "steve-jobs-skill", path: "references/research/03-expression-dna.md" })` 拉正文，
  最后用 PG 的口吻引用。
- 模型不确定圆桌里谁更适合回答某个问题 → 调用 `list_skills()` 重新看每个人的 description，给出更精准的引用对象。

---

## 6. 编写 Skill 的最佳实践

1. **SKILL.md 应该薄而强**：保留身份卡、激活规则、回答工作流、退出角色规则；
   把"心智模型 / 表达 DNA / 时间线"等深度研究材料移到 `references/research/`。
2. **在 SKILL.md 末尾给出资源索引**：列出 `references/research/01..06` 的标题与触发条件，
   让模型知道"何时应该 read_skill_resource"。
3. **examples 提供正向示范**：1–3 段示例对话，展示该 Skill 在最典型场景下的输出风格。
4. **frontmatter 的 description 要包含触发关键词**：例如"当用户说『用 PG 的视角』时使用"，
   有助于将来引入"自动激活"模式。
5. **大文件请拆分**：单个 Level 3 资源建议 < 64KB；`read_skill_resource` 复用底层
   `read_file` 的 256KB 上限自动截断。

参考样板：[`paul-graham-skill/SKILL.md`](../src-tauri/bundle-data/personae/paul-graham-skill/SKILL.md)。

---

## 7. 兼容性

- 旧版"胖 SKILL.md"（把研究材料全部内联到正文）依然可以工作：
  运行时只是把全部正文塞进 `[SKILL ACTIVE]` 块，不享受 Level 3 渐进披露的好处。
- `references/**` 与 `examples/**` 是可选的；不存在时 `list_skill_resources` 返回空列表。
- 现有的 `personae-index.json` 缓存机制不变；新增 Level 3 资源不会影响列表性能。
