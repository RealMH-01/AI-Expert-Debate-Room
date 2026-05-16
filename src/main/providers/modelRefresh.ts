/**
 * Remote Model List Refresh - Section X
 *
 * Fetches available models from each provider's API endpoint
 * and caches them in the provider_models SQLite table.
 *
 * Not all providers support /v1/models listing.
 * - OpenAI, DeepSeek, Qwen, BigModel, Moonshot: /v1/models (OpenAI-compatible)
 * - Anthropic: /v1/models (custom format)
 * - Google Gemini: /v1beta/models (custom format)
 * - OpenAI Compatible: /v1/models (if baseUrl set)
 *
 * Models fetched remotely are always stored as 'unverified' status.
 * Seed models from MODEL_REGISTRY retain their original status.
 */

import { v4 as uuid } from 'uuid'
import { getDatabase } from '../db/sqlite'
import { getProviderConfig } from './providerSettings'
import { getProviderEntry } from '../../shared/providers/modelRegistry'
import type { ModelListRefreshResult, RefreshedModel } from './types'

/**
 * Fetch model list from a provider's remote API.
 */
export async function refreshModelsForProvider(providerId: string): Promise<ModelListRefreshResult> {
  const fetchedAt = new Date().toISOString()

  const config = getProviderConfig(providerId)
  if (!config || !config.apiKey) {
    return {
      providerId,
      success: false,
      models: [],
      errorMessage: 'Provider not configured or missing API key',
      fetchedAt
    }
  }

  const providerEntry = getProviderEntry(providerId)
  if (!providerEntry) {
    return {
      providerId,
      success: false,
      models: [],
      errorMessage: `Unknown provider: ${providerId}`,
      fetchedAt
    }
  }

  try {
    const models = await fetchRemoteModels(providerId, config.apiKey, config.baseUrl || providerEntry.defaultBaseUrl)

    // Save to database
    saveRemoteModels(providerId, models, fetchedAt)

    return {
      providerId,
      success: true,
      models,
      fetchedAt
    }
  } catch (error: unknown) {
    const errMsg = (error as Error).message || 'Unknown error'
    return {
      providerId,
      success: false,
      models: [],
      errorMessage: errMsg,
      fetchedAt
    }
  }
}

/**
 * Fetch models from remote API based on provider type.
 */
async function fetchRemoteModels(
  providerId: string,
  apiKey: string,
  baseUrl: string
): Promise<RefreshedModel[]> {
  switch (providerId) {
    case 'google':
      return fetchGeminiModels(apiKey, baseUrl)
    case 'anthropic':
      return fetchAnthropicModels(apiKey, baseUrl)
    default:
      // OpenAI-compatible: openai, deepseek, qwen, bigmodel, moonshot, openai_compatible
      return fetchOpenAICompatibleModels(apiKey, baseUrl)
  }
}

/**
 * Fetch from OpenAI-compatible /v1/models endpoint.
 */
async function fetchOpenAICompatibleModels(apiKey: string, baseUrl: string): Promise<RefreshedModel[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/models`
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    signal: AbortSignal.timeout(15000)
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const data = await response.json() as { data?: Array<{ id: string; name?: string }> }
  if (!data.data || !Array.isArray(data.data)) {
    return []
  }

  return data.data
    .filter((m) => m.id && typeof m.id === 'string')
    .map((m) => ({
      apiModelId: m.id,
      displayName: m.name || m.id
    }))
}

/**
 * Fetch from Anthropic /v1/models endpoint.
 */
async function fetchAnthropicModels(apiKey: string, baseUrl: string): Promise<RefreshedModel[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/v1/models`
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    signal: AbortSignal.timeout(15000)
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const data = await response.json() as { data?: Array<{ id: string; display_name?: string }> }
  if (!data.data || !Array.isArray(data.data)) {
    return []
  }

  return data.data
    .filter((m) => m.id && typeof m.id === 'string')
    .map((m) => ({
      apiModelId: m.id,
      displayName: m.display_name || m.id
    }))
}

/**
 * Fetch from Google Gemini /v1beta/models endpoint.
 */
async function fetchGeminiModels(apiKey: string, baseUrl: string): Promise<RefreshedModel[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/models?key=${apiKey}`
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    },
    signal: AbortSignal.timeout(15000)
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const data = await response.json() as { models?: Array<{ name: string; displayName?: string }> }
  if (!data.models || !Array.isArray(data.models)) {
    return []
  }

  return data.models
    .filter((m) => m.name && typeof m.name === 'string')
    .map((m) => {
      // Gemini returns "models/gemini-2.5-pro" - extract just the model ID
      const modelId = m.name.replace(/^models\//, '')
      return {
        apiModelId: modelId,
        displayName: m.displayName || modelId
      }
    })
    // Only include generateContent-capable models (text models)
    .filter((m) => m.apiModelId.startsWith('gemini'))
}

/**
 * Save fetched models to provider_models table.
 * Upserts: existing entries updated, new entries inserted.
 */
function saveRemoteModels(providerId: string, models: RefreshedModel[], fetchedAt: string): void {
  const db = getDatabase()

  const upsert = db.prepare(`
    INSERT INTO provider_models (id, provider_id, api_model_id, display_name, status, source, fetched_at, created_at)
    VALUES (?, ?, ?, ?, 'unverified', 'remote', ?, datetime('now'))
    ON CONFLICT(provider_id, api_model_id)
    DO UPDATE SET display_name = excluded.display_name, fetched_at = excluded.fetched_at, source = 'remote'
  `)

  const runBatch = db.transaction(() => {
    for (const model of models) {
      upsert.run(uuid(), providerId, model.apiModelId, model.displayName || model.apiModelId, fetchedAt)
    }
  })

  runBatch()
}

/**
 * Get cached remote models for a provider from database.
 */
export function getCachedRemoteModels(providerId: string): Array<{
  apiModelId: string
  displayName: string
  status: string
  source: string
  fetchedAt: string
}> {
  const db = getDatabase()
  const rows = db.prepare(
    'SELECT api_model_id, display_name, status, source, fetched_at FROM provider_models WHERE provider_id = ? ORDER BY api_model_id'
  ).all(providerId) as Array<{
    api_model_id: string
    display_name: string
    status: string
    source: string
    fetched_at: string
  }>

  return rows.map((r) => ({
    apiModelId: r.api_model_id,
    displayName: r.display_name,
    status: r.status,
    source: r.source,
    fetchedAt: r.fetched_at
  }))
}
