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
  agentGetById: (id: string) => ipcRenderer.invoke('agent:get-by-id', id)
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
