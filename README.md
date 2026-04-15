# MindRound 观思集

跨平台深度阅读与对话应用。用户与「作者人格」对话，支持单聊与群聊（圆桌）。

## 项目状态

**阶段**: 开发中 (MVP 阶段)

## 技术栈

- **前端**: React + TypeScript + Vite
- **桌面**: Tauri 2.0 (Rust)
- **样式**: Tailwind CSS
- **状态管理**: Zustand
- **测试**: Vitest
- **代码规范**: ESLint + Prettier

## 项目结构

```
mindround/
├── src/
│   ├── core/
│   │   ├── domain/           # 实体定义
│   │   ├── repositories/     # 接口定义
│   │   ├── services/         # 业务服务
│   │   └── infrastructure/   # 平台实现
│   ├── ui/
│   │   ├── pages/            # 页面
│   │   ├── components/       # 组件
│   │   ├── stores/           # 状态管理
│   │   └── hooks/            # 自定义 Hooks
│   └── bridges/              # 平台桥接
├── src-tauri/                # Tauri 后端
└── docs/                     # 设计文档
```

## 开发命令

```bash
npm run dev          # 开发模式
npm run build        # 构建
npm run test         # 运行测试
npm run type-check   # 类型检查
npm run lint         # 代码检查
npm run coverage     # 测试覆盖率
npm run tauri dev    # Tauri 开发模式
npm run tauri build  # Tauri 构建
```

## 开发规范

详见 [CLAUDE.md](./CLAUDE.md)

## 文档

- [详细设计](./docs/详细设计.md)
- [MVP功能清单](./docs/MVP功能清单.md)
- [开发测试计划](./docs/开发测试计划.md)
