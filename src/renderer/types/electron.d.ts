/**
 * 渲染进程全局类型声明
 *
 * 声明 window.api 的类型，使渲染进程可以安全调用 IPC API
 */

import type { Room, Agent, RulesConfig, Session, Message, ValidationResult, SettlementResultDisplay } from '../../shared/types'

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
  agentGetAliveExperts: (roomId: string) => Promise<IpcResponse<Agent[]>>
  agentGetHellPoolExperts: (roomId: string) => Promise<IpcResponse<Agent[]>>

  // Debate / Session
  debateValidate: (roomId: string) => Promise<IpcResponse<ValidationResult>>
  debateStart: (params: { roomId: string; userQuestion: string }) => Promise<IpcResponse<{ started: boolean; roomId: string }>>
  debateIsRunning: (roomId: string) => Promise<IpcResponse<boolean>>
  sessionGetById: (sessionId: string) => Promise<IpcResponse<Session>>
  sessionGetByRoom: (roomId: string) => Promise<IpcResponse<Session[]>>
  messageGetBySession: (sessionId: string) => Promise<IpcResponse<Message[]>>

  // Settlement
  settlementApply: (sessionId: string) => Promise<IpcResponse<Session>>
  settlementVeto: (sessionId: string) => Promise<IpcResponse<Session>>
  settlementHasPending: (sessionId: string) => Promise<IpcResponse<boolean>>
  settlementGetPending: (sessionId: string) => Promise<IpcResponse<SettlementResultDisplay | null>>
  votesGetBySession: (sessionId: string) => Promise<IpcResponse<unknown[]>>
  settlementsGetBySession: (sessionId: string) => Promise<IpcResponse<unknown[]>>

  // Debate 事件监听（返回 cleanup 函数）
  onDebateMessage: (callback: (message: Message) => void) => () => void
  onDebatePhaseChange: (callback: (data: { phase: string; session: Session }) => void) => () => void
  onDebateSessionFinished: (callback: (session: Session) => void) => () => void
  onDebateError: (callback: (error: string) => void) => () => void
  onSettlementReady: (callback: (settlement: SettlementResultDisplay) => void) => () => void

  // History
  historyGetList: (params: { search?: string; roomId?: string; limit?: number; offset?: number }) => Promise<IpcResponse<{ items: unknown[]; total: number }>>
  historyGetDetail: (sessionId: string) => Promise<IpcResponse<unknown>>
  historyDeleteSession: (sessionId: string) => Promise<IpcResponse<boolean>>
  historyGetRoomsForFilter: () => Promise<IpcResponse<Array<{ id: string; name: string }>>>
  historyGetReview: (sessionId: string) => Promise<IpcResponse<unknown>>

  // Export
  exportMarkdown: (sessionId: string) => Promise<IpcResponse<{ canceled?: boolean; filePath?: string; size?: number }>>
  exportGetDbPath: () => Promise<IpcResponse<string>>
  exportAllDataJson: () => Promise<IpcResponse<{ canceled?: boolean; filePath?: string; size?: number }>>

  // Provider Settings
  providerGetAllConfigs: () => Promise<IpcResponse<Array<{
    providerId: string
    hasApiKey: boolean
    maskedApiKey: string
    baseUrl: string
    timeout: number
    enabled: boolean
    allowUnverifiedModels: boolean
    lastTestStatus?: 'success' | 'fail' | null
    lastTestError?: string | null
    lastTestAt?: string | null
  }>>>
  providerGetConfig: (providerId: string) => Promise<IpcResponse<{
    providerId: string
    hasApiKey: boolean
    maskedApiKey: string
    baseUrl: string
    timeout: number
    enabled: boolean
    allowUnverifiedModels: boolean
    lastTestStatus?: 'success' | 'fail' | null
    lastTestError?: string | null
    lastTestAt?: string | null
  } | null>>
  providerSaveConfig: (params: {
    providerId: string
    apiKey: string
    baseUrl?: string
    defaultHeaders?: Record<string, string>
    timeout?: number
    enabled?: boolean
    allowUnverifiedModels?: boolean
  }) => Promise<IpcResponse<unknown>>
  providerDeleteConfig: (providerId: string) => Promise<IpcResponse<unknown>>
  providerTestConnection: (providerId: string) => Promise<IpcResponse<{
    success: boolean
    message: string
    latencyMs?: number
    errorType?: string
    httpStatus?: number
    testedAt: string
  }>>
  providerRefreshModels: (providerId: string) => Promise<IpcResponse<{
    providerId: string
    success: boolean
    models: Array<{ apiModelId: string; displayName?: string }>
    errorMessage?: string
    fetchedAt: string
  }>>
  providerGetCachedModels: (providerId: string) => Promise<IpcResponse<Array<{
    apiModelId: string
    displayName: string
    status: string
    source: string
    fetchedAt: string
  }>>>
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
