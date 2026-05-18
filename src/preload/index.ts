/**
 * Preload 脚本
 *
 * 使用 contextBridge 安全地暴露 IPC API 给渲染进程。
 * 渲染进程通过 window.api 调用主进程功能。
 * 不暴露 Node API，不开启 nodeIntegration。
 */

import { contextBridge, ipcRenderer } from 'electron'

/** 暴露给渲染进程的 API */
const api = {
  // ===== 应用基础 =====
  healthCheck: () => ipcRenderer.invoke('app:health-check'),
  getAppInfo: () => ipcRenderer.invoke('app:get-app-info'),

  // ===== Room =====
  roomGetAll: () => ipcRenderer.invoke('room:get-all'),
  roomGetById: (id: string) => ipcRenderer.invoke('room:get-by-id', id),
  roomCreate: (params: { name: string; description?: string }) =>
    ipcRenderer.invoke('room:create', params),
  roomUpdate: (params: { id: string; name: string; description: string }) =>
    ipcRenderer.invoke('room:update', params),
  roomUpdateRules: (params: { id: string; rules: unknown }) =>
    ipcRenderer.invoke('room:update-rules', params),
  roomDelete: (id: string) => ipcRenderer.invoke('room:delete', id),

  // ===== Agent =====
  agentGetModerator: (roomId: string) => ipcRenderer.invoke('agent:get-moderator', roomId),
  agentUpsertModerator: (params: { roomId: string; data: unknown }) =>
    ipcRenderer.invoke('agent:upsert-moderator', params),
  agentGetExperts: (roomId: string) => ipcRenderer.invoke('agent:get-experts', roomId),
  agentCreateExpert: (params: { roomId: string; data: unknown }) =>
    ipcRenderer.invoke('agent:create-expert', params),
  agentUpdateExpert: (params: { id: string; data: unknown }) =>
    ipcRenderer.invoke('agent:update-expert', params),
  agentDelete: (id: string) => ipcRenderer.invoke('agent:delete', id),
  agentGetById: (id: string) => ipcRenderer.invoke('agent:get-by-id', id),

  // ===== Debate / Session =====
  debateValidate: (roomId: string) => ipcRenderer.invoke('debate:validate', roomId),
  debateStart: (params: { roomId: string; userQuestion: string }) =>
    ipcRenderer.invoke('debate:start', params),
  debateIsRunning: (roomId: string) => ipcRenderer.invoke('debate:is-running', roomId),
  sessionGetById: (sessionId: string) => ipcRenderer.invoke('session:get-by-id', sessionId),
  sessionGetByRoom: (roomId: string) => ipcRenderer.invoke('session:get-by-room', roomId),
  messageGetBySession: (sessionId: string) =>
    ipcRenderer.invoke('message:get-by-session', sessionId),

  // ===== Debate 事件监听 =====
  onDebateMessage: (callback: (message: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data)
    ipcRenderer.on('debate:event:new-message', handler)
    return () => ipcRenderer.removeListener('debate:event:new-message', handler)
  },
  onDebatePhaseChange: (callback: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data)
    ipcRenderer.on('debate:event:phase-change', handler)
    return () => ipcRenderer.removeListener('debate:event:phase-change', handler)
  },
  onDebateSessionFinished: (callback: (session: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data)
    ipcRenderer.on('debate:event:session-finished', handler)
    return () => ipcRenderer.removeListener('debate:event:session-finished', handler)
  },
  onDebateError: (callback: (error: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data)
    ipcRenderer.on('debate:event:error', handler)
    return () => ipcRenderer.removeListener('debate:event:error', handler)
  },

  // ===== Settlement 事件监听 =====
  onSettlementReady: (callback: (settlement: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data)
    ipcRenderer.on('debate:event:settlement-ready', handler)
    return () => ipcRenderer.removeListener('debate:event:settlement-ready', handler)
  },

  // ===== Settlement 操作 =====
  settlementApply: (sessionId: string) =>
    ipcRenderer.invoke('settlement:apply', sessionId),
  settlementVeto: (sessionId: string) =>
    ipcRenderer.invoke('settlement:veto', sessionId),
  settlementHasPending: (sessionId: string) =>
    ipcRenderer.invoke('settlement:has-pending', sessionId),
  settlementGetPending: (sessionId: string) =>
    ipcRenderer.invoke('settlement:get-pending', sessionId),
  votesGetBySession: (sessionId: string) =>
    ipcRenderer.invoke('votes:get-by-session', sessionId),
  settlementsGetBySession: (sessionId: string) =>
    ipcRenderer.invoke('settlements:get-by-session', sessionId),
  agentGetAliveExperts: (roomId: string) =>
    ipcRenderer.invoke('agent:get-alive-experts', roomId),
  agentGetHellPoolExperts: (roomId: string) =>
    ipcRenderer.invoke('agent:get-hell-pool-experts', roomId),

  // ===== History =====
  historyGetList: (params: { search?: string; roomId?: string; limit?: number; offset?: number }) =>
    ipcRenderer.invoke('history:get-list', params),
  historyGetDetail: (sessionId: string) =>
    ipcRenderer.invoke('history:get-detail', sessionId),
  historyDeleteSession: (sessionId: string) =>
    ipcRenderer.invoke('history:delete-session', sessionId),
  historyGetRoomsForFilter: () =>
    ipcRenderer.invoke('history:get-rooms-for-filter'),
  historyGetReview: (sessionId: string) =>
    ipcRenderer.invoke('history:get-review', sessionId),

  // ===== Project Memory / User Intervention =====
  memoryAcceptSuggestion: (params: { suggestionId: string; editedContent?: string | null }) =>
    ipcRenderer.invoke('memory:accept-suggestion', params),
  memoryRejectSuggestion: (suggestionId: string) =>
    ipcRenderer.invoke('memory:reject-suggestion', suggestionId),
  memoryDisableItem: (itemId: string) =>
    ipcRenderer.invoke('memory:disable-item', itemId),
  memoryDeleteItem: (itemId: string) =>
    ipcRenderer.invoke('memory:delete-item', itemId),
  userInterventionCreate: (params: {
    meetingId: string
    type: string
    content: string
    targetExpertId?: string | null
    roundIndex?: number | null
  }) => ipcRenderer.invoke('user-intervention:create', params),

  // ===== Export =====
  exportMarkdown: (sessionId: string) =>
    ipcRenderer.invoke('export:markdown', sessionId),
  exportGetDbPath: () =>
    ipcRenderer.invoke('export:get-db-path'),
  exportAllDataJson: () =>
    ipcRenderer.invoke('export:all-data-json'),

  // ===== Provider Settings =====
  providerGetAllConfigs: () =>
    ipcRenderer.invoke('provider:get-all-configs'),
  providerGetConfig: (providerId: string) =>
    ipcRenderer.invoke('provider:get-config', providerId),
  providerSaveConfig: (params: {
    providerId: string
    apiKey: string
    baseUrl?: string
    defaultHeaders?: Record<string, string>
    timeout?: number
    enabled?: boolean
  }) => ipcRenderer.invoke('provider:save-config', params),
  providerDeleteConfig: (providerId: string) =>
    ipcRenderer.invoke('provider:delete-config', providerId),
  providerTestConnection: (providerId: string) =>
    ipcRenderer.invoke('provider:test-connection', providerId)
}

export type ElectronAPI = typeof api

// 安全暴露 API
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error('Failed to expose API via contextBridge:', error)
  }
} else {
  // @ts-expect-error fallback for non-isolated context
  window.api = api
}
