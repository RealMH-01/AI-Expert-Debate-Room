/**
 * 渲染进程全局类型声明
 *
 * 声明 window.api 的类型，使渲染进程可以安全调用 IPC API
 */

import type { Room, Agent, RulesConfig } from '../../shared/types'

/** 健康检查结果 */
export interface HealthCheckResult {
  status: 'ok' | 'error'
  database: boolean
  timestamp: string
  message: string
}

/** 应用信息 */
export interface AppInfoResult {
  appName: string
  version: string
  databasePath: string
  environment: string
  nodeVersion: string
  electronVersion: string
  platform: string
  arch: string
  dbVersion: string
  tableCount: number
}

/** IPC 响应包装 */
export interface IpcResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

/** Electron API 接口 */
export interface ElectronAPI {
  // 应用基础
  healthCheck: () => Promise<HealthCheckResult>
  getAppInfo: () => Promise<AppInfoResult>

  // Room
  roomGetAll: () => Promise<IpcResponse<Room[]>>
  roomGetById: (id: string) => Promise<IpcResponse<Room>>
  roomCreate: (params: { name: string; description?: string }) => Promise<IpcResponse<Room>>
  roomUpdate: (params: { id: string; name: string; description: string }) => Promise<IpcResponse<Room>>
  roomUpdateRules: (params: { id: string; rules: RulesConfig }) => Promise<IpcResponse<Room>>
  roomDelete: (id: string) => Promise<IpcResponse<boolean>>

  // Agent
  agentGetModerator: (roomId: string) => Promise<IpcResponse<Agent | null>>
  agentUpsertModerator: (params: {
    roomId: string
    data: Partial<Omit<Agent, 'id' | 'room_id' | 'role' | 'created_at' | 'updated_at'>>
  }) => Promise<IpcResponse<Agent>>
  agentGetExperts: (roomId: string) => Promise<IpcResponse<Agent[]>>
  agentCreateExpert: (params: {
    roomId: string
    data: Partial<Omit<Agent, 'id' | 'room_id' | 'role' | 'created_at' | 'updated_at'>>
  }) => Promise<IpcResponse<Agent>>
  agentUpdateExpert: (params: {
    id: string
    data: Partial<Omit<Agent, 'id' | 'room_id' | 'role' | 'created_at' | 'updated_at'>>
  }) => Promise<IpcResponse<Agent>>
  agentDelete: (id: string) => Promise<IpcResponse<boolean>>
  agentGetById: (id: string) => Promise<IpcResponse<Agent>>
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
