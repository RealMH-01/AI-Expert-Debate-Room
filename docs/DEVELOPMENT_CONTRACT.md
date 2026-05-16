# AI Expert Debate Room - 开发契约与实施计划

> 版本：v1.0（第 0 轮确认版）
> 日期：2026-05-16
> 状态：使用者已审阅通过，进入第 1 轮前最终版

---

## 一、项目目标

**AI 专家修罗场会议室**（AI Expert Debate Room）是一个本地桌面版 AI 专家对抗式会议程序。

### 核心目的

用户提出一个问题/议题，多个由不同 AI 模型驱动的"专家"角色先独立回答，再经过多轮互相攻击、反驳、修正的辩论过程，最终通过匿名投票、HP 结算、淘汰机制，产出经过多轮压力测试的高质量答案。

### 它不是

- 不是普通的 AI 群聊
- 不是投票决定真理的民主系统
- 不是主理人独裁的仲裁系统

### 它是

- 一个"答案进化器"——通过对抗产出更可靠的观点
- 一个结构化的辩论引擎——有明确的流程、规则和结算体系
- 一个本地优先的桌面工具——数据完全归用户所有

---

## 二、核心概念：Room / Session 分离

### 2.1 概念定义

| 概念 | 说明 |
|------|------|
| **Room（会议室）** | 可复用的会议室配置，保存名称、规则、主理人配置、专家配置 |
| **Agent（智能体）** | 主理人或专家配置，挂在 Room 下，用 `role = moderator \| expert` 区分 |
| **Session（会议实例）** | 某一次具体讨论，保存用户问题、状态、最终总结，挂在 Room 下 |
| **Message（消息）** | 某个 Session 内的所有发言 |
| **Vote（投票）** | 某个 Session 内的专家投票 |
| **Settlement（结算）** | 某个 Session 内的 HP 结算记录 |
| **Agent Snapshot（快照）** | 某个 Session / Round 的专家 HP、议事权、威望、状态快照 |

### 2.2 关键区分

- **Room 是长期配置**，可以复用。同一个 Room 可以开多次 Session。
- **Session 是一次具体讨论**。用户问题 `question` 属于 Session，不属于 Room。
- **Agent 挂在 Room 下**，而不是 Session 下。Session 开始时生成 Agent Snapshot 记录当场初始状态。
- **Provider/Model 在数据库层允许为空**（支持草稿配置），但启动 Session 前必须严格校验。

---

## 三、产品铁律清单（不可擅自修改）

### 3.1 角色与模型选择铁律

| 编号 | 规则 |
|------|------|
| R-1 | 所有 AI 角色底层模型由使用者选择 |
| R-2 | 系统不能强制指定默认模型 |
| R-3 | 系统不能将模型固定分配给某角色 |
| R-4 | 系统只提供模型池、能力标记和配置界面 |
| R-5 | 使用者决定每位专家/主理人用什么模型 |
| R-6 | 专家数量由使用者决定 |
| R-7 | 第一阶段使用 MockProvider |
| R-8 | 后续模型池：GPT-5.5 / Claude Opus 4.6 / Gemini 3.1 Pro / DeepSeek V4 Pro Thinking / Qwen / 智谱 GLM / Kimi |
| R-9 | 支持 thinking 的模型默认开启思考模式 |
| R-10 | 失败惩罚不能关闭 thinking 或削弱模型能力 |

### 3.2 会议流程铁律

| 编号 | 规则 |
|------|------|
| F-1 | 用户创建会议室（Room） |
| F-2 | 用户配置主理人 |
| F-3 | 用户配置任意数量专家 |
| F-4 | 专家字段：名称、人设、领域、立场、记忆、攻击性、模型配置、HP、议事权 |
| F-5 | 用户在 Session 中提出问题 |
| F-6 | 主理人宣布会议开始 |
| F-7 | 每位专家先独立回答（首轮隔离，避免互相污染） |
| F-8 | 首轮结束后专家可见他人观点 |
| F-9 | 至少 3 轮辩论 |
| F-10 | 每轮必须攻击他人 + 回应他人对自己的攻击 |
| F-11 | 辩论结束后存活专家匿名互投（需存活 >= 3 人） |
| F-12 | 系统投票规则校验 |
| F-13 | 系统生成 HP 结算建议 |
| F-14 | 用户可否决本轮结算 |
| F-15 | 结算生效后更新 HP、议事权、威望、Hell Pool |
| F-16 | 主理人输出最终总结和复盘 |
| F-17 | 所有会议历史保存到本地 SQLite |

### 3.3 投票铁律

| 编号 | 规则 |
|------|------|
| V-1 | 保留专家互投 |
| V-2 | 投票默认匿名、同时进行 |
| V-3 | 专家不能投自己 |
| V-4 | 投票必须结构化 |
| V-5 | 投票理由必须含：攻击了什么、反驳了什么、修正了什么、存活观点、剩余弱点 |
| V-6 | 主理人无权审票 |
| V-7 | 投票有效性只能由非 AI 规则引擎做客观校验 |
| V-8 | 规则引擎只检查：JSON 可解析、字段完整、分数合法（0-10）、不投自己、投票者存活、被投对象存在、不重复、不漏投 |
| V-9 | 规则引擎不判断理由质量或观点正确性 |
| V-10 | 投票只用于排名、HP 结算、议事权变化、威望变化、Hell Pool 淘汰 |
| V-11 | 投票不能直接决定最终答案的观点权重 |
| V-12 | 投票不能决定真理归属 |

### 3.4 HP 和 Hell Pool 铁律

| 编号 | 规则 |
|------|------|
| H-1 | 初始 HP = 100 |
| H-2 | HP 上限 = 100 |
| H-3 | 单轮最大扣血 = 20 |
| H-4 | 获胜回血远低于失败扣血 |
| H-5 | 默认结算：第一 +3、第二 +1、中间 0、倒二 -8、倒一 -15 |
| H-6 | 额外扣血必须由客观规则触发，不允许主理人主观判定 |
| H-7 | HP <= 0 -> 踢出会议 -> 进 Hell Pool |
| H-8 | Hell Pool 专家：不能发言、不能投票、不计入活跃 |
| H-9 | 存活专家 < 3 人 -> 停止投票和 HP 扣除 -> 进入总结 |

### 3.5 议事权铁律

| 编号 | 规则 | 数值 |
|------|------|------|
| P-1 | 议事权影响发言顺序 | - |
| P-2 | 议事权影响平票优势 | - |
| P-3 | 议事权影响同分排名 | - |
| P-4 | 议事权不影响主理人是否优先引用 | - |
| P-5 | 议事权不影响最终总结中观点权重 | - |
| P-6 | 议事权不影响观点正确性判定 | - |
| P-7 | 专家可有流程地位，观点无特权 | - |
| P-8 | 初始值 = 0，整数，范围 -5 到 +5 | 0 |
| P-9 | 变化规则：第一名 +2，第二名 +1，倒数第一 -1 | - |

### 3.6 威望铁律

| 编号 | 规则 | 数值 |
|------|------|------|
| PR-1 | 初始值 = 0 | 0 |
| PR-2 | 仅用于展示、历史统计和称号 | - |
| PR-3 | 不参与任何裁决 | - |
| PR-4 | 变化规则：第一名 +5，第二名 +2，倒数第一 -3 | - |

### 3.7 主理人权力限制

| 编号 | 规则 |
|------|------|
| M-1 | 主理人负责：控场、安排阶段、提醒规则、整理争议、输出总结 |
| M-2 | 主理人不能审票 |
| M-3 | 主理人不能否决专家投票 |
| M-4 | 主理人不能因议事权偏袒专家 |
| M-5 | 主理人不能拥有最终独裁权 |
| M-6 | 主理人最终总结必须结构化 |
| M-7 | 上下文压缩不是主理人独占权力 |

### 3.8 最小专家数量规则

| 编号 | 规则 |
|------|------|
| MIN-1 | 至少 2 个专家可以启动普通讨论 |
| MIN-2 | 只有存活专家数量 >= 3 时，才启用专家互投和 HP 结算 |
| MIN-3 | 存活专家少于 3 时停止投票和 HP 扣除，进入总结或最后对照式讨论 |

---

## 四、技术栈确认

| 层 | 技术选型 | 说明 |
|----|---------|------|
| 桌面框架 | Electron（electron-vite 模板兼容的稳定版） | 本地桌面运行，不锁定具体版本号 |
| 前端框架 | React + TypeScript | 渲染进程 UI |
| 构建工具 | electron-vite | 快速构建 + HMR |
| 状态管理 | Zustand | 轻量级 |
| UI 组件库 | shadcn/ui + Tailwind CSS | 现代、可定制 |
| 数据库 | SQLite via better-sqlite3 | Main Process 侧，直接 SQL |
| ORM | 无（直接 better-sqlite3 SQL） | MVP 阶段减少复杂度 |
| IPC | Electron contextBridge + ipcMain/ipcRenderer | 前后端通信 |
| 状态机 | 自定义 phase + event queue | 不用 XState |
| 测试 | Vitest（后置，不拖慢骨架） | Playwright E2E 后置 |
| 包管理 | pnpm | Monorepo 友好 |
| 打包 | electron-builder | 最终分发 |
| UI 语言 | 纯中文界面 | 第一阶段 |

### 关键版本原则

- Electron 版本：使用 electron-vite 模板兼容的稳定版本，写入 lockfile
- Node.js 版本：使用当前环境可稳定运行的 LTS 版本，不为版本号破坏 native module 兼容性
- better-sqlite3：确保与 Electron 版本的原生模块编译兼容

---

## 五、目录结构

```
ai-expert-debate-room/
├── package.json
├── pnpm-workspace.yaml (如需)
├── electron.vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
├── tailwind.config.js
├── electron-builder.yml
│
├── src/
│   ├── main/                       # Electron Main Process
│   │   ├── index.ts                # 入口
│   │   ├── ipc/                    # IPC Handler 注册
│   │   │   ├── room.ipc.ts
│   │   │   ├── agent.ipc.ts
│   │   │   ├── session.ipc.ts
│   │   │   ├── debate.ipc.ts
│   │   │   └── vote.ipc.ts
│   │   ├── database/               # SQLite 数据层
│   │   │   ├── connection.ts       # 数据库连接
│   │   │   ├── migrations/         # 迁移脚本
│   │   │   │   └── 001_init.sql
│   │   │   └── repositories/       # 数据访问
│   │   │       ├── room.repo.ts
│   │   │       ├── agent.repo.ts
│   │   │       ├── session.repo.ts
│   │   │       ├── message.repo.ts
│   │   │       ├── vote.repo.ts
│   │   │       ├── settlement.repo.ts
│   │   │       └── snapshot.repo.ts
│   │   ├── engine/                 # 核心引擎
│   │   │   ├── debate-engine.ts    # 辩论引擎主控
│   │   │   ├── phase-manager.ts    # 阶段管理
│   │   │   ├── event-queue.ts      # 事件队列
│   │   │   ├── vote-validator.ts   # 投票规则引擎
│   │   │   ├── hp-settlement.ts    # HP 结算
│   │   │   └── hell-pool.ts        # Hell Pool 管理
│   │   └── providers/              # AI 模型 Provider
│   │       ├── base-provider.ts    # 抽象接口
│   │       ├── mock-provider.ts    # Mock 实现
│   │       └── openai-compatible-provider.ts  # OpenAI 兼容 Provider
│   │
│   ├── renderer/                   # React 渲染进程
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── room/               # 会议室配置
│   │   │   ├── agent/              # 智能体配置
│   │   │   ├── session/            # 会议实例
│   │   │   ├── debate/             # 辩论时间线
│   │   │   ├── vote/               # 投票面板
│   │   │   └── settlement/         # 结算视图
│   │   ├── stores/                 # Zustand stores
│   │   ├── hooks/
│   │   ├── pages/
│   │   └── styles/
│   │
│   ├── shared/                     # Main + Renderer 共享
│   │   ├── types/                  # TypeScript 类型定义
│   │   │   ├── room.types.ts
│   │   │   ├── agent.types.ts
│   │   │   ├── session.types.ts
│   │   │   ├── debate.types.ts
│   │   │   ├── vote.types.ts
│   │   │   ├── settlement.types.ts
│   │   │   ├── provider.types.ts
│   │   │   └── events.types.ts
│   │   ├── constants/
│   │   │   ├── rules.ts            # 铁律常量
│   │   │   └── defaults.ts
│   │   └── ipc-channels.ts         # IPC 通道名
│   │
│   └── preload/                    # Electron preload
│       └── index.ts
│
├── tests/
│   ├── unit/
│   └── integration/
│
└── docs/
    └── DEVELOPMENT_CONTRACT.md     # 本文档
```

---

## 六、SQLite 数据表设计（修正版）

```sql
-- ============================
-- 会议室（可复用配置）
-- ============================
CREATE TABLE rooms (
  id              TEXT PRIMARY KEY,       -- UUID
  name            TEXT NOT NULL,          -- 会议室名称
  description     TEXT,                   -- 描述
  min_debate_rounds INTEGER NOT NULL DEFAULT 3,  -- 最少辩论轮数
  rules_config    TEXT,                   -- JSON: 自定义规则参数（如 HP 公式等）
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- ============================
-- 智能体（主理人或专家，挂在 Room 下）
-- ============================
CREATE TABLE agents (
  id              TEXT PRIMARY KEY,       -- UUID
  room_id         TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,          -- 'moderator' | 'expert'
  name            TEXT NOT NULL,
  persona         TEXT,                   -- 人设 prompt
  domain          TEXT,                   -- 领域（专家专用）
  stance          TEXT,                   -- 立场（专家专用）
  aggressiveness  REAL DEFAULT 0.5,       -- 攻击性 0-1（专家专用）
  provider_id     TEXT,                   -- 可为空（草稿状态）
  model_config    TEXT,                   -- JSON: model params，可为空
  sort_order      INTEGER NOT NULL DEFAULT 0,  -- 排序
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- ============================
-- 会议实例（一次具体讨论）
-- ============================
CREATE TABLE sessions (
  id              TEXT PRIMARY KEY,       -- UUID
  room_id         TEXT NOT NULL REFERENCES rooms(id),
  title           TEXT,                   -- 会议标题（可选）
  question        TEXT NOT NULL,          -- 用户提出的问题/议题
  status          TEXT NOT NULL DEFAULT 'preparing',
                  -- preparing | independent_answer | debate | voting
                  -- | settlement_pending | settled | summary | completed
  current_round   INTEGER NOT NULL DEFAULT 0,
  total_rounds    INTEGER NOT NULL DEFAULT 0,  -- 实际进行的总轮数
  summary         TEXT,                   -- JSON: 最终结构化总结
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  completed_at    TEXT
);

-- ============================
-- 智能体快照（Session/Round 级别状态记录）
-- ============================
CREATE TABLE agent_snapshots (
  id              TEXT PRIMARY KEY,       -- UUID
  session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  agent_id        TEXT NOT NULL REFERENCES agents(id),
  round           INTEGER NOT NULL,       -- 轮次（0 = session 开始时初始快照）
  hp              INTEGER NOT NULL DEFAULT 100,
  hp_cap          INTEGER NOT NULL DEFAULT 100,
  speaking_right  INTEGER NOT NULL DEFAULT 0,   -- 议事权 -5 到 +5
  prestige        INTEGER NOT NULL DEFAULT 0,   -- 威望
  status          TEXT NOT NULL DEFAULT 'active',
                  -- active | eliminated | hell_pool
  created_at      TEXT NOT NULL
);

-- ============================
-- 辩论消息
-- ============================
CREATE TABLE messages (
  id              TEXT PRIMARY KEY,       -- UUID
  session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  round           INTEGER NOT NULL,       -- 0 = 独立回答阶段, 1+ = 辩论轮
  speaker_type    TEXT NOT NULL,          -- 'moderator' | 'expert' | 'system'
  speaker_id      TEXT NOT NULL,          -- 关联 agents.id
  content         TEXT NOT NULL,
  targets         TEXT,                   -- JSON: 本条攻击了谁（agent_id 数组）
  responding_to   TEXT,                   -- JSON: 本条回应了哪些攻击（message_id 数组）
  thinking        TEXT,                   -- 模型 thinking 内容（如有）
  token_usage     TEXT,                   -- JSON: {prompt_tokens, completion_tokens, thinking_tokens}
  created_at      TEXT NOT NULL
);

-- ============================
-- 投票
-- ============================
CREATE TABLE votes (
  id              TEXT PRIMARY KEY,       -- UUID
  session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  round           INTEGER NOT NULL,       -- 本次投票对应哪轮结算
  voter_id        TEXT NOT NULL REFERENCES agents(id),
  target_id       TEXT NOT NULL REFERENCES agents(id),
  score           INTEGER NOT NULL,       -- 0-10
  reason          TEXT NOT NULL,          -- JSON: 结构化投票理由
  is_valid        INTEGER NOT NULL DEFAULT 1,
  validation_errors TEXT,                 -- JSON: 规则校验错误（如有）
  created_at      TEXT NOT NULL
);

-- ============================
-- HP 结算记录
-- ============================
CREATE TABLE settlements (
  id              TEXT PRIMARY KEY,       -- UUID
  session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  round           INTEGER NOT NULL,
  agent_id        TEXT NOT NULL REFERENCES agents(id),
  rank            INTEGER NOT NULL,       -- 本轮排名
  score_received  INTEGER NOT NULL,       -- 收到的总分
  hp_change       INTEGER NOT NULL,       -- HP 变化
  speaking_right_change INTEGER NOT NULL DEFAULT 0,  -- 议事权变化
  prestige_change INTEGER NOT NULL DEFAULT 0,        -- 威望变化
  reason          TEXT NOT NULL,          -- 结算原因说明
  vetoed          INTEGER NOT NULL DEFAULT 0,  -- 用户是否否决
  created_at      TEXT NOT NULL
);

-- ============================
-- Hell Pool 记录
-- ============================
CREATE TABLE hell_pool (
  id              TEXT PRIMARY KEY,       -- UUID
  session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  agent_id        TEXT NOT NULL REFERENCES agents(id),
  eliminated_at_round INTEGER NOT NULL,
  final_hp        INTEGER NOT NULL,
  created_at      TEXT NOT NULL
);

-- ============================
-- 全局设置
-- ============================
CREATE TABLE settings (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL,          -- JSON value
  updated_at      TEXT NOT NULL
);

-- ============================
-- 索引
-- ============================
CREATE INDEX idx_agents_room_id ON agents(room_id);
CREATE INDEX idx_sessions_room_id ON sessions(room_id);
CREATE INDEX idx_agent_snapshots_session ON agent_snapshots(session_id, round);
CREATE INDEX idx_messages_session_round ON messages(session_id, round);
CREATE INDEX idx_votes_session_round ON votes(session_id, round);
CREATE INDEX idx_settlements_session_round ON settlements(session_id, round);
```

---

## 七、TypeScript 核心类型初稿（修正版）

```typescript
// ===== Provider 类型 =====
type ProviderId = 'mock' | 'openai-compatible';

interface ModelConfig {
  providerId: ProviderId;
  modelName: string;
  displayName?: string;        // 用户可见名
  temperature?: number;
  maxTokens?: number;
  thinkingEnabled?: boolean;   // R-9: 默认开启
  baseUrl?: string;
  extraParams?: Record<string, unknown>;
  // 注意：apiKey 加密存储在 settings 表，不在此对象中
}

interface ProviderCapability {
  providerId: ProviderId;
  displayName: string;
  models: ModelInfo[];
  supportsThinking: boolean;
  supportsStreaming: boolean;
}

interface ModelInfo {
  id: string;
  name: string;
  supportsThinking: boolean;
  maxContextWindow: number;
  costPerMillionTokens?: { input: number; output: number };
}

// ===== Room 类型 =====
interface Room {
  id: string;
  name: string;
  description?: string;
  minDebateRounds: number;
  rulesConfig?: RulesConfig;
  createdAt: string;
  updatedAt: string;
}

interface RulesConfig {
  hpInitial: number;           // H-1: 默认 100
  hpCap: number;               // H-2: 默认 100
  maxHpLossPerRound: number;   // H-3: 默认 20
  settlementFormula: SettlementFormula;
  speakingRightRange: [number, number]; // P-8: [-5, 5]
}

interface SettlementFormula {
  first: number;     // H-5: +3 HP
  second: number;    // H-5: +1 HP
  middle: number;    // H-5: 0
  secondLast: number; // H-5: -8 HP
  last: number;      // H-5: -15 HP
}

// ===== Agent 类型 =====
type AgentRole = 'moderator' | 'expert';
type AgentStatus = 'active' | 'eliminated' | 'hell_pool';

interface Agent {
  id: string;
  roomId: string;
  role: AgentRole;
  name: string;
  persona?: string;
  domain?: string;             // 专家专用
  stance?: string;             // 专家专用
  aggressiveness?: number;     // 0-1，专家专用
  providerId?: string;         // 可为空（草稿）
  modelConfig?: ModelConfig;   // 可为空（草稿）
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ===== Session 类型 =====
type SessionStatus =
  | 'preparing'
  | 'independent_answer'
  | 'debate'
  | 'voting'
  | 'settlement_pending'
  | 'settled'
  | 'summary'
  | 'completed';

interface Session {
  id: string;
  roomId: string;
  title?: string;
  question: string;
  status: SessionStatus;
  currentRound: number;
  totalRounds: number;
  summary?: SessionSummary;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

// ===== Agent Snapshot 类型 =====
interface AgentSnapshot {
  id: string;
  sessionId: string;
  agentId: string;
  round: number;               // 0 = 初始快照
  hp: number;
  hpCap: number;
  speakingRight: number;       // P-8: -5 到 +5
  prestige: number;
  status: AgentStatus;
  createdAt: string;
}

// ===== Message 类型 =====
type SpeakerType = 'moderator' | 'expert' | 'system';

interface DebateMessage {
  id: string;
  sessionId: string;
  round: number;               // 0 = 独立回答阶段
  speakerType: SpeakerType;
  speakerId: string;
  content: string;
  targets?: string[];          // 攻击对象 agent_id
  respondingTo?: string[];     // 回应的 message_id
  thinking?: string;           // 模型内部思考
  tokenUsage?: TokenUsage;
  createdAt: string;
}

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  thinkingTokens?: number;
}

// ===== Vote 类型 =====
interface Vote {
  id: string;
  sessionId: string;
  round: number;
  voterId: string;
  targetId: string;
  score: number;               // V-8: 0-10
  reason: VoteReason;
  isValid: boolean;
  validationErrors?: string[];
}

interface VoteReason {
  attacked: string;            // 攻击了什么
  rebutted: string;            // 反驳了什么
  corrected: string;           // 修正了什么
  survivingClaims: string;     // 存活观点
  remainingWeakness: string;   // 仍有的弱点
}

// ===== Settlement 类型 =====
interface HpSettlement {
  id: string;
  sessionId: string;
  round: number;
  agentId: string;
  rank: number;
  scoreReceived: number;
  hpChange: number;
  speakingRightChange: number;
  prestigeChange: number;
  reason: string;
  vetoed: boolean;
}

// ===== Session Summary 类型 =====
interface SessionSummary {
  mainConclusions: string[];
  survivingClaims: ClaimSummary[];
  eliminatedClaims: ClaimSummary[];
  keyDebatePoints: string[];
  expertPerformance: ExpertPerformanceSummary[];
}

interface ClaimSummary {
  claim: string;
  supportedBy: string[];       // agent names
  challengedBy: string[];
  finalStatus: 'survived' | 'modified' | 'eliminated';
}

interface ExpertPerformanceSummary {
  agentId: string;
  agentName: string;
  finalHp: number;
  finalRank: number;
  keyContributions: string[];
}

// ===== Event / Phase 系统 =====
type SessionPhase = SessionStatus;  // 复用 SessionStatus

type DebateEvent =
  | { type: 'START_SESSION' }
  | { type: 'INDEPENDENT_ANSWERS_COMPLETE' }
  | { type: 'ROUND_COMPLETE'; round: number }
  | { type: 'INITIATE_VOTING' }
  | { type: 'VOTING_COMPLETE' }
  | { type: 'SETTLEMENT_PROPOSED'; settlements: HpSettlement[] }
  | { type: 'USER_VETO_SETTLEMENT' }
  | { type: 'SETTLEMENT_CONFIRMED' }
  | { type: 'SUMMARY_COMPLETE' }
  | { type: 'USER_INJECT'; content: string }
  | { type: 'USER_CONTINUE_DEBATE' }
  | { type: 'USER_REVIVE_EXPERT'; agentId: string }
  | { type: 'USER_END_SESSION' }
  | { type: 'EXPERT_TIMEOUT'; agentId: string }
  | { type: 'FORMAT_VIOLATION'; agentId: string; detail: string }
  | { type: 'EXPERT_ELIMINATED'; agentId: string }
  | { type: 'ALIVE_BELOW_THRESHOLD' };

// ===== Provider 抽象接口 =====
interface AIProvider {
  id: ProviderId;
  generateResponse(params: GenerateParams): Promise<GenerateResult>;
  generateVote(params: VoteGenerateParams): Promise<VoteGenerateResult>;
  streamResponse?(params: GenerateParams): AsyncIterable<StreamChunk>;
}

interface GenerateParams {
  systemPrompt: string;
  messages: ChatMessage[];
  modelConfig: ModelConfig;
  agentContext?: AgentContext;
}

interface GenerateResult {
  content: string;
  thinking?: string;
  tokenUsage: TokenUsage;
  finishReason: string;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface AgentContext {
  agentId: string;
  agentName: string;
  role: AgentRole;
  persona?: string;
  domain?: string;
  stance?: string;
  aggressiveness?: number;
}

interface VoteGenerateParams {
  systemPrompt: string;
  debateHistory: DebateMessage[];
  aliveExperts: Agent[];
  selfId: string;
  modelConfig: ModelConfig;
}

interface VoteGenerateResult {
  votes: Omit<Vote, 'id' | 'sessionId' | 'round' | 'isValid' | 'validationErrors'>[];
  thinking?: string;
  tokenUsage: TokenUsage;
}

interface StreamChunk {
  content?: string;
  thinking?: string;
  done: boolean;
}
```

---

## 八、模块边界（修正版）

```
┌─────────────────────────────────────────────────────────────────┐
│                     Renderer Process (React)                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ Room     │ │ Agent    │ │ Session  │ │ Vote &   │           │
│  │ Config   │ │ Config   │ │ Debate   │ │ Settle   │           │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘           │
│       └─────────────┴─────────────┴─────────────┘                │
│                           │ (IPC via contextBridge)              │
└───────────────────────────┼──────────────────────────────────────┘
                            │
┌───────────────────────────┼──────────────────────────────────────┐
│                     Main Process (Node.js)                        │
│                           │                                      │
│  ┌────────────────────────┴────────────────────────┐             │
│  │              IPC Router / Handlers               │             │
│  └───┬────────┬────────┬────────┬─────────┬────────┘             │
│      │        │        │        │         │                      │
│  ┌───┴────┐ ┌─┴──────┐ ┌┴──────┐ ┌──┴───┐ ┌──┴───────┐        │
│  │Debate  │ │Phase   │ │Event │ │Vote  │ │HP        │        │
│  │Engine  │ │Manager │ │Queue │ │Valid.│ │Settlement│        │
│  └───┬────┘ └────────┘ └──────┘ └──────┘ └──────────┘        │
│      │                                                           │
│  ┌───┴──────────────────────────────────────────────┐            │
│  │            Provider Manager                       │            │
│  │  ┌─────────────┐  ┌─────────────────────────┐   │            │
│  │  │MockProvider │  │OpenAI-Compatible Provider│   │            │
│  │  └─────────────┘  └─────────────────────────┘   │            │
│  └──────────────────────────────────────────────────┘            │
│                           │                                      │
│  ┌────────────────────────┴────────────────────────┐             │
│  │     Database Layer (SQLite / better-sqlite3)     │             │
│  │  Repositories: room / agent / session / message  │             │
│  │               vote / settlement / snapshot       │             │
│  └──────────────────────────────────────────────────┘            │
└──────────────────────────────────────────────────────────────────┘
```

### 模块职责边界

| 模块 | 职责 | 绝对不做 |
|------|------|---------|
| Renderer | UI 展示、用户操作、状态展示 | 不做模型调用、不做结算逻辑、不访问数据库 |
| IPC Router | 路由前端请求到对应 Handler | 不做业务逻辑 |
| Debate Engine | 辩论主控，协调各阶段，调用 Provider | 不做投票校验和结算 |
| Phase Manager | 管理当前阶段，判断阶段转换合法性 | 不做 AI 调用 |
| Event Queue | 接收和分发事件，支持用户干预事件 | 不做业务判断 |
| Vote Validator | 纯规则校验投票格式合法性（V-8 的 8 项） | 不判断观点质量（V-9） |
| HP Settlement | 根据投票排名计算 HP/议事权/威望变化 | 不做主观判定（H-6） |
| Provider Manager | 统一管理 Provider 实例、路由调用 | 不做业务逻辑 |
| Database Layer | 持久化和查询 | 不做业务逻辑 |

---

## 九、状态管理设计（Phase + Event Queue）

### 9.1 阶段（Phase）

```
preparing -> independent_answer -> debate -> voting
    -> settlement_pending -> settled -> summary -> completed
```

### 9.2 事件队列

会议有当前 phase，但可以接收事件。事件队列接收来自系统内部和用户的事件，由 Phase Manager 判断当前 phase 下事件是否合法，合法则执行阶段转换或触发对应逻辑。

### 9.3 支持的事件

| 事件 | 触发来源 | 说明 |
|------|---------|------|
| START_SESSION | 用户 | 启动会议 |
| INDEPENDENT_ANSWERS_COMPLETE | 系统 | 独立回答阶段完成 |
| ROUND_COMPLETE | 系统 | 一轮辩论完成 |
| INITIATE_VOTING | 系统 | 满足轮数后发起投票 |
| VOTING_COMPLETE | 系统 | 所有投票收集完毕 |
| SETTLEMENT_PROPOSED | 系统 | 结算建议已生成 |
| USER_VETO_SETTLEMENT | 用户 | 用户否决本轮结算 |
| SETTLEMENT_CONFIRMED | 用户/系统 | 结算确认生效 |
| SUMMARY_COMPLETE | 系统 | 总结完成 |
| USER_INJECT | 用户 | 用户中途注入意见 |
| USER_CONTINUE_DEBATE | 用户 | 用户要求继续辩论 |
| USER_REVIVE_EXPERT | 用户 | 用户复活专家 |
| USER_END_SESSION | 用户 | 用户强制结束 |
| EXPERT_TIMEOUT | 系统 | 专家响应超时 |
| FORMAT_VIOLATION | 系统 | 格式违规 |
| EXPERT_ELIMINATED | 系统 | 专家 HP <= 0 |
| ALIVE_BELOW_THRESHOLD | 系统 | 存活人数不足 |

### 9.4 设计原则

- 第 1-4 轮可以先做简化流程（线性推进）
- 架构命名和边界不写死成不可扩展的线性状态机
- Event Queue 支持后续扩展新事件类型
- Phase Manager 支持后续添加新阶段转换规则

---

## 十、8 轮开发路线

### 第 1 轮：项目骨架初始化

**目标**：搭建 Electron + React + TypeScript + SQLite + electron-vite 项目，能启动窗口。

**产出**：
- electron-vite 项目初始化
- Electron 主进程启动
- React + Tailwind + shadcn/ui 渲染进程加载
- better-sqlite3 连接成功 + 建表脚本执行
- IPC 双向通信 demo（preload + contextBridge）
- 基础页面框架（侧边栏 + 主内容区）
- 开发模式 HMR 可用

### 第 2 轮：Room / Agent 配置与持久化

**目标**：实现会议室、智能体的 CRUD 和持久化。

**产出**：
- 创建/编辑/删除 Room
- 添加/编辑/删除 Agent（moderator + expert）
- 模型池展示（此阶段只有 MockProvider 选项）
- 支持草稿保存（provider/model 可为空）
- 数据持久化到 SQLite
- UI：Room 列表 + Agent 配置面板

### 第 3 轮：MockProvider + 核心辩论流程

**目标**：用 MockProvider 跑通完整辩论流程。

**产出**：
- MockProvider 返回结构化假数据
- Session 创建 + 问题输入
- Agent Snapshot 初始化
- Phase Manager 阶段流转
- 独立回答阶段（首轮隔离）
- 辩论阶段（>= 3 轮）
- 主理人控场消息
- 辩论时间线 UI

### 第 4 轮：投票 + VoteValidator + HP 结算 + Hell Pool

**目标**：实现投票、校验、结算、淘汰完整闭环。

**产出**：
- 专家生成结构化投票（MockProvider）
- VoteValidator 8 项规则校验
- 投票排名计算
- HP 结算 + 议事权变化 + 威望变化
- 用户否决功能
- Hell Pool 淘汰
- 存活 < 3 人自动停止
- Agent Snapshot 每轮更新
- 投票 + 结算 UI

### 第 5 轮：历史记录 + 结构化复盘 + 导出

**目标**：Session 可回顾、可导出。

**产出**：
- Session 历史列表
- Session 回放（时间线浏览）
- 主理人结构化总结生成
- Markdown 导出
- Session 统计面板

### 第 6 轮：接入 OpenAI-Compatible Provider

**目标**：从 MockProvider 过渡到真实 API 调用。

**产出**：
- OpenAI-Compatible Provider 实现
- API Key 安全管理（settings 表加密存储，不暴露给渲染进程）
- 用 OpenAI 测通完整辩论流程
- 错误处理 + 重试机制
- Token 用量统计
- Thinking 模式支持
- 流式响应

### 第 7 轮：扩展多家 Provider

**目标**：接入 DeepSeek、Qwen、Kimi、智谱等兼容 OpenAI 格式的 Provider，以及 Claude、Gemini。

**产出**：
- 复用 OpenAI-Compatible 逻辑接入 DeepSeek / Qwen / Kimi / 智谱
- Claude Provider（独立适配）
- Gemini Provider（独立适配）
- 各家 thinking / reasoning 模式适配
- 模型能力标记
- 模型切换无缝

### 第 8 轮：质量增强

**目标**：Claim Tracker、上下文压缩、项目级记忆、成本估算、用户干预等。

**产出**：
- Claim Tracker（论点追踪）
- 上下文压缩模块（系统级，M-7）
- 项目级记忆（跨 Session）
- 成本估算与预警
- 用户中途干预能力（USER_INJECT 等事件生效）
- 性能优化

---

## 十一、每轮验收标准

| 轮次 | 验收标准 |
|------|---------|
| 第 1 轮 | (1) `pnpm dev` 启动 Electron 窗口 (2) React 页面正常渲染 (3) SQLite 建表成功 (4) IPC 通信可工作 (5) TypeScript 编译无错误 (6) Tailwind 样式生效 |
| 第 2 轮 | (1) 可创建 Room 并持久化 (2) 可添加 moderator 和多个 expert (3) 重启后数据不丢失 (4) 草稿可保存（provider 为空不报错）(5) 模型选择 UI 显示 MockProvider |
| 第 3 轮 | (1) MockProvider 返回合理假回复 (2) 独立回答阶段各专家互不可见他人内容 (3) 辩论 >= 3 轮完成 (4) Phase Manager 正确流转 (5) UI 时间线展示完整对话 (6) Agent Snapshot 正确记录 |
| 第 4 轮 | (1) 投票 JSON 结构合规 (2) VoteValidator 正确拦截 8 类非法投票 (3) HP 按公式正确结算 (4) 议事权/威望正确变化 (5) 用户可否决结算 (6) HP <= 0 自动进 Hell Pool (7) 存活 < 3 人自动停止 |
| 第 5 轮 | (1) Session 历史可列表查看 (2) 可浏览完整对话 (3) 结构化总结生成 (4) Markdown 正确导出 (5) 统计面板数据正确 |
| 第 6 轮 | (1) 真实 OpenAI API 调用成功 (2) Thinking 模式正常 (3) API Key 不暴露给渲染进程 (4) 错误重试有效 (5) Token 统计准确 (6) 流式响应可用 |
| 第 7 轮 | (1) 多家 Provider 可配置 (2) 切换模型后辩论正常 (3) 各家 thinking 适配正确 (4) 异构 API 格式统一输出 |
| 第 8 轮 | (1) Claim Tracker 可追踪论点 (2) 上下文压缩不丢关键信息 (3) 记忆可跨 Session 持久化 (4) 成本预估偏差 < 20% (5) 用户可中途干预 |

---

## 十二、高风险点清单

| 风险 | 级别 | 说明 | 缓解策略 |
|------|------|------|---------|
| Electron + better-sqlite3 原生模块编译 | 高 | native addon 与 Electron 版本不一致时编译失败 | 使用 electron-vite 官方模板；electron-rebuild；CI 验证 |
| 辩论 prompt 过长超出上下文窗口 | 高 | 3+ 轮辩论 x 多专家，token 快速膨胀 | 第 8 轮做上下文压缩；每轮估算 token；必要时截断 |
| MockProvider 与真实 Provider 行为差异 | 中 | Mock 格式固定，真实模型输出非标 | Provider 接口统一输出；加 response parser |
| 投票格式强依赖 AI 输出 JSON 质量 | 中 | 模型可能输出格式错误 JSON | 多次重试 + JSON 修复 + 清晰 prompt |
| 七家 Provider API 差异大 | 中 | 格式、错误码、rate limit 不同 | 统一 adapter；OpenAI-Compatible 复用 |
| Thinking 模式各家实现不统一 | 中 | 各家 thinking/reasoning 字段不同 | 抽象为统一字段；各家 adapter 适配 |
| 阶段管理复杂度 | 中 | 事件多、转换条件多 | Phase Manager 明确转换表；充分测试 |
| Electron 打包体积 | 低 | SQLite native + Electron 较大 | 暂不处理，后期优化 |
| 跨 Session 记忆一致性 | 中 | 记忆跨 Session 携带可能导致不可预测行为 | 第 8 轮实现，严格记忆格式 |

---

## 十三、开发者承诺（不可擅自修改的规则）

我（AI 开发者）承诺，在后续所有开发轮次中：

1. **绝不** 为任何角色强制指定默认模型（R-2, R-3）
2. **绝不** 让主理人拥有审票权或独裁权（M-2, M-3, M-5）
3. **绝不** 让 VoteValidator 判断观点质量或正确性（V-7, V-9）
4. **绝不** 让投票直接决定最终答案的观点权重或真理归属（V-11, V-12）
5. **绝不** 让议事权影响观点正确性判定（P-6, P-7）
6. **绝不** 修改 HP 默认结算公式（H-5），除非使用者要求
7. **绝不** 允许主理人进行主观 HP 扣除（H-6）
8. **绝不** 让 HP <= 0 的专家继续发言或投票（H-7, H-8）
9. **绝不** 在存活 < 3 人时继续投票和扣血（H-9）
10. **绝不** 关闭或削弱模型的 thinking 能力作为惩罚（R-10）
11. **绝不** 将 API Key 暴露给渲染进程
12. **绝不** 把上下文压缩做成主理人的独占功能（M-7）
13. **绝不** 跳过用户否决结算的环节（F-14）
14. **绝不** 将 question 放在 Room 表而非 Session 表
15. **绝不** 在数据库层对草稿配置强制 NOT NULL（除非是 ID/时间戳等必需字段）
16. **绝不** 将状态管理做成不可扩展的严格线性 FSM
17. **绝不** 擅自修改以上任何产品铁律，若有冲突会提报给使用者决定

---

## 十四、使用者确认记录

以下为使用者在进入第 1 轮前的确认选择：

| # | 事项 | 确认结果 |
|---|------|---------|
| 1 | ORM 选择 | 直接 better-sqlite3 SQL，不用 Drizzle |
| 2 | UI 组件库 | shadcn/ui + Tailwind CSS |
| 3 | 状态机实现 | 自定义 phase + event queue，不用 XState |
| 4 | Electron 版本 | electron-vite 模板兼容的稳定版，不强锁版本号 |
| 5 | Node.js 版本 | 当前环境 LTS 稳定版 |
| 6 | 最小专家数量 | >= 2 可讨论，>= 3 才启用投票和 HP 结算 |
| 7 | 投票分数范围 | 0-10 分 |
| 8 | 议事权 | 初始 0，整数，范围 -5 到 +5，第一 +2、第二 +1、倒一 -1 |
| 9 | 威望 | 初始 0，仅展示/统计/称号，不参与裁决，第一 +5、第二 +2、倒一 -3 |
| 10 | UI 语言 | 纯中文界面 |
| 11 | Git 分支 | `genspark/round-0-contract`，每轮独立 commit |
| 12 | 首选 Provider | 先实现 OpenAI-Compatible，再测通 OpenAI；兼容格式可复用 |

---

## 十五、变更记录

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-05-16 | v1.0 | 初始契约。根据使用者审阅意见修正：Room/Session 分离、数据库表重构、状态管理改为 phase+event queue、12 项确认选择纳入 |
