# MindRound 开发规范

## 注释规范

**目标**: 注释率 > 30%

### JSDoc 模板

```typescript
/**
 * [简要描述]
 * [详细描述]
 * @description [功能描述]
 * @see [相关链接]
 * @example [使用示例]
 */
class ClassName {
  /** [成员描述] */
  member: type;

  /**
   * [方法描述]
   * @param [参数名] - [参数描述]
   * @returns [返回值描述]
   */
  method(param: Type): ReturnType {
    // 实现
  }
}
```

### 注释位置
- 所有导出类和接口必须有 JSDoc
- 公共方法必须有 JSDoc
- 复杂业务逻辑需要行内注释说明

---

## 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 类名 | PascalCase | ChatService, MessageBubble |
| 接口名 | PascalCase + I 前缀 | IChatRepository, IMemoryService |
| 方法名 | camelCase | sendMessage, getMessages |
| 变量名 | camelCase | currentChat, personaList |
| 常量 | UPPER_SNAKE_CASE | MAX_TIME_WINDOW, DEFAULT_MODEL |
| 文件名 | camelCase | chatService.ts, messageBubble.tsx |
| 测试文件 | xxx.test.ts | chatService.test.ts |

---

## 设计模式

| 模式 | 使用场景 | 当前实现 |
|------|----------|----------|
| Repository | 数据访问抽象 | FileChatRepository |
| Adapter | 平台差异隔离 | TauriAdapter |
| Factory | 对象创建（可选） | PlatformAdapterFactory |
| Strategy | 可替换算法（预留） | MemoryTriggerStrategy |
| Observer | 事件通知（预留） | onChange 回调 |

---

## 不过度设计原则

1. **YAGNI**: 不实现未来才需要的功能
2. **KISS**: 保持实现简单直接
3. **先实现再抽象**: 等到有 2+ 个相似实现再抽象接口
4. **MVP 优先**: 所有扩展点用 `// 未来扩展` 标注，先用简单实现

---

## TDD 开发流程

### Red-Green-Refactor 循环

```
┌─────────────────────────────────────────────────────────────┐
│  1. Write Failing Test (Red)                                │
│     - 编写一个描述期望行为的测试                              │
│     - 运行测试，确认失败                                      │
├─────────────────────────────────────────────────────────────┤
│  2. Write Minimum Code (Green)                              │
│     - 编写最少量代码使测试通过                                │
│     - 不追求完美，只求通过                                    │
├─────────────────────────────────────────────────────────────┤
│  3. Refactor (Blue)                                         │
│     - 重构代码提升质量                                       │
│     - 保持测试通过                                            │
│     - 检查注释率和命名规范                                    │
└─────────────────────────────────────────────────────────────┘
```

### 测试优先级

1. Domain 实体测试 - 最核心，优先覆盖
2. Repository 接口测试 - 数据访问契约保证
3. Service 业务逻辑测试 - 核心业务规则
4. 组件测试 - UI 交互
5. 集成测试 - 端到端流程

---

## 验证方法

| 命令 | 作用 |
|------|------|
| `npm run test` | 运行所有单元测试 |
| `npm run type-check` | TypeScript 类型检查 |
| `npm run lint` | ESLint 代码风格检查 |
| `npm run coverage` | 计算测试覆盖率 |
| `npm run tauri dev` | Tauri 开发模式 |

---

## 关键文件清单

### P0 - 核心文件

| 层级 | 文件路径 |
|------|----------|
| Domain | src/core/domain/Message.ts |
| Domain | src/core/domain/Chat.ts |
| Domain | src/core/domain/Persona.ts |
| Repository | src/core/repositories/IChatRepository.ts |
| Infrastructure | src/core/infrastructure/platforms/MockAdapter.ts |
| Infrastructure | src/core/infrastructure/repositories/FileChatRepository.ts |
| Service | src/core/services/ChatService.ts |
| Service | src/core/services/ContextBuilderService.ts |

### P1 - 重要文件

| 层级 | 文件路径 |
|------|----------|
| UI | src/ui/stores/chatStore.ts |
| UI | src/ui/components/MessageBubble.tsx |
