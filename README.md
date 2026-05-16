# AI 专家修罗场会议室 (AI Expert Debate Room)

本地桌面版 AI 专家对抗式会议程序。

多个由不同 AI 模型驱动的"专家"角色通过多轮辩论、投票、HP 结算，产出经过压力测试的高质量答案。

## 技术栈

- **桌面框架**: Electron
- **前端框架**: React + TypeScript
- **构建工具**: electron-vite
- **数据库**: SQLite (better-sqlite3)
- **包管理**: pnpm

## 快速开始

### 环境要求

- Node.js >= 18 (LTS)
- pnpm >= 8

### 安装依赖

```bash
pnpm install
```

### 启动开发模式

```bash
pnpm dev
```

### 构建项目

```bash
pnpm build
```

## 项目结构

```
├── package.json
├── electron.vite.config.ts          # electron-vite 构建配置
├── electron-builder.yml             # 打包配置
├── tsconfig.json                    # TypeScript 根配置
├── tsconfig.node.json               # Main/Preload TypeScript 配置
├── tsconfig.web.json                # Renderer TypeScript 配置
│
├── src/
│   ├── main/                        # Electron Main Process
│   │   ├── index.ts                 # 入口：窗口创建、数据库初始化
│   │   ├── ipc/                     # IPC Handler
│   │   │   ├── channels.ts          # IPC 通道名常量
│   │   │   └── health.ipc.ts        # 健康检查和应用信息
│   │   └── db/                      # 数据库层
│   │       ├── sqlite.ts            # 数据库连接管理
│   │       ├── schema.ts            # 数据表 Schema 定义
│   │       └── migrations.ts        # 迁移管理
│   │
│   ├── preload/                     # Preload 安全桥接
│   │   └── index.ts                 # contextBridge API 暴露
│   │
│   └── renderer/                    # React 渲染进程
│       ├── index.html               # HTML 入口
│       ├── main.tsx                  # React 入口
│       ├── App.tsx                   # 根组件（三栏布局）
│       ├── components/              # UI 组件
│       │   ├── LeftPanel.tsx         # 左侧：会议室/专家列表
│       │   ├── CenterPanel.tsx       # 中间：聊天流/欢迎页
│       │   └── RightPanel.tsx        # 右侧：主理人/规则/状态
│       ├── styles/
│       │   └── global.css           # 全局样式
│       └── types/
│           └── electron.d.ts        # window.api 类型声明
│
├── data/                            # 开发环境数据库存放目录
│   └── .gitkeep
│
└── docs/
    └── DEVELOPMENT_CONTRACT.md      # 开发契约
```

## 数据库

- **开发环境**: 数据库文件位于项目 `data/debate-room.db`
- **生产环境**: 数据库文件位于 Electron `userData` 目录
- 首次启动应用时自动创建数据库和所有表
- 支持迁移版本管理，多次启动不会重复建表

### 数据表 (9 张)

| 表名 | 说明 |
|------|------|
| app_meta | 应用元信息（迁移版本等） |
| rooms | 会议室配置 |
| agents | 智能体（主理人/专家） |
| sessions | 会议实例 |
| messages | 辩论消息 |
| votes | 投票记录 |
| agent_snapshots | 智能体状态快照 |
| settlements | HP 结算记录 |
| settings | 全局设置 |

## IPC API

| 通道 | 说明 |
|------|------|
| `app:health-check` | 数据库健康检查 |
| `app:get-app-info` | 获取应用版本、数据库路径等信息 |

## 开发文档

详见 [docs/DEVELOPMENT_CONTRACT.md](docs/DEVELOPMENT_CONTRACT.md)
