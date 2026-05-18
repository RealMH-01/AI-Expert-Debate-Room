/**
 * IPC 通道名统一定义
 * 所有 IPC 通信使用此处定义的常量，避免硬编码字符串
 */
export const IPC_CHANNELS = {
  /** 数据库健康检查 */
  HEALTH_CHECK: 'app:health-check',
  /** 获取应用信息 */
  GET_APP_INFO: 'app:get-app-info',

  // ===== Room 相关 =====
  /** 获取所有会议室 */
  ROOM_GET_ALL: 'room:get-all',
  /** 获取单个会议室 */
  ROOM_GET_BY_ID: 'room:get-by-id',
  /** 创建会议室 */
  ROOM_CREATE: 'room:create',
  /** 更新会议室 */
  ROOM_UPDATE: 'room:update',
  /** 更新会议室规则 */
  ROOM_UPDATE_RULES: 'room:update-rules',
  /** 删除会议室 */
  ROOM_DELETE: 'room:delete',

  // ===== Agent 相关 =====
  /** 获取会议室主理人 */
  AGENT_GET_MODERATOR: 'agent:get-moderator',
  /** 创建/更新主理人 */
  AGENT_UPSERT_MODERATOR: 'agent:upsert-moderator',
  /** 获取会议室所有专家 */
  AGENT_GET_EXPERTS: 'agent:get-experts',
  /** 创建专家 */
  AGENT_CREATE_EXPERT: 'agent:create-expert',
  /** 更新专家 */
  AGENT_UPDATE_EXPERT: 'agent:update-expert',
  /** 删除 Agent */
  AGENT_DELETE: 'agent:delete',
  /** 获取单个 Agent */
  AGENT_GET_BY_ID: 'agent:get-by-id',
  /** 获取存活专家 */
  AGENT_GET_ALIVE_EXPERTS: 'agent:get-alive-experts',
  /** 获取 Hell Pool 专家 */
  AGENT_GET_HELL_POOL_EXPERTS: 'agent:get-hell-pool-experts',

  // ===== Debate / Session 相关 =====
  /** 校验会议室能否启动辩论 */
  DEBATE_VALIDATE: 'debate:validate',
  /** 启动辩论 */
  DEBATE_START: 'debate:start',
  /** 获取辩论运行状态 */
  DEBATE_IS_RUNNING: 'debate:is-running',
  /** 获取会议信息 */
  SESSION_GET_BY_ID: 'session:get-by-id',
  /** 获取会议室的所有会议 */
  SESSION_GET_BY_ROOM: 'session:get-by-room',
  /** 获取会议的所有消息 */
  MESSAGE_GET_BY_SESSION: 'message:get-by-session',

  // ===== Settlement 相关 =====
  /** 应用 HP 结算 */
  SETTLEMENT_APPLY: 'settlement:apply',
  /** 否决 HP 结算 */
  SETTLEMENT_VETO: 'settlement:veto',
  /** 检查是否有待确认结算 */
  SETTLEMENT_HAS_PENDING: 'settlement:has-pending',
  /** 获取待确认结算详情 */
  SETTLEMENT_GET_PENDING: 'settlement:get-pending',
  /** 获取某会议的投票记录 */
  VOTES_GET_BY_SESSION: 'votes:get-by-session',
  /** 获取某会议的结算记录 */
  SETTLEMENTS_GET_BY_SESSION: 'settlements:get-by-session',

  // ===== History 相关 =====
  /** 获取历史会议列表 */
  HISTORY_GET_LIST: 'history:get-list',
  /** 获取会议完整详情 */
  HISTORY_GET_DETAIL: 'history:get-detail',
  /** 删除历史会议 */
  HISTORY_DELETE_SESSION: 'history:delete-session',
  /** 获取可过滤的 room 列表 */
  HISTORY_GET_ROOMS_FOR_FILTER: 'history:get-rooms-for-filter',
  /** 获取会议 review */
  HISTORY_GET_REVIEW: 'history:get-review',

  // ===== Project Memory / User Intervention =====
  MEMORY_ACCEPT_SUGGESTION: 'memory:accept-suggestion',
  MEMORY_REJECT_SUGGESTION: 'memory:reject-suggestion',
  MEMORY_DISABLE_ITEM: 'memory:disable-item',
  MEMORY_DELETE_ITEM: 'memory:delete-item',
  USER_INTERVENTION_CREATE: 'user-intervention:create',

  // ===== Export 相关 =====
  /** 导出 session 为 Markdown */
  EXPORT_MARKDOWN: 'export:markdown',
  /** 获取数据库文件路径 */
  EXPORT_GET_DB_PATH: 'export:get-db-path',
  /** 导出全部数据为 JSON */
  EXPORT_ALL_DATA_JSON: 'export:all-data-json',

  // ===== Provider Settings 相关 =====
  /** 获取所有 Provider 配置（安全版，无明文 API Key） */
  PROVIDER_GET_ALL_CONFIGS: 'provider:get-all-configs',
  /** 获取单个 Provider 配置（安全版） */
  PROVIDER_GET_CONFIG: 'provider:get-config',
  /** 保存 Provider 配置（含 API Key，仅 Main Process 存储） */
  PROVIDER_SAVE_CONFIG: 'provider:save-config',
  /** 删除 Provider 配置 */
  PROVIDER_DELETE_CONFIG: 'provider:delete-config',
  /** 测试 Provider 连接 */
  PROVIDER_TEST_CONNECTION: 'provider:test-connection'
} as const

/** IPC 通道名类型 */
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
