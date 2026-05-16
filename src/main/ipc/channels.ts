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
  AGENT_GET_BY_ID: 'agent:get-by-id'
} as const

/** IPC 通道名类型 */
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
