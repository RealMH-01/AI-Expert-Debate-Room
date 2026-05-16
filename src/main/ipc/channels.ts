/**
 * IPC 通道名统一定义
 * 所有 IPC 通信使用此处定义的常量，避免硬编码字符串
 */
export const IPC_CHANNELS = {
  /** 数据库健康检查 */
  HEALTH_CHECK: 'app:health-check',
  /** 获取应用信息 */
  GET_APP_INFO: 'app:get-app-info'
} as const

/** IPC 通道名类型 */
export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
