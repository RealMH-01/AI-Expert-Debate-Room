/**
 * Unified Provider Request/Response Types
 *
 * Round 7: Shared types used by all provider adapters.
 * These decouple adapter internals from the DebateModelProvider interface.
 *
 * Key features:
 * - ProviderRequest: normalized request that adapters translate to API-specific format
 * - ProviderResponse: normalized response with optional reasoningText
 * - ThinkingConfig: per-request thinking mode configuration
 * - ThinkingEffort: unified effort levels mapped to provider-specific params
 */

import type { ChatMessage } from '../prompts/moderatorPrompts'

// ============================================================
// Thinking Configuration
// ============================================================

/**
 * Unified thinking effort levels.
 * Each adapter maps these to provider-specific parameters.
 */
export type ThinkingEffort = 'none' | 'low' | 'medium' | 'high';

/**
 * Per-request thinking configuration.
 * Passed from DebateModelProvider methods to adapter callApi.
 */
export interface ThinkingConfig {
  /** Whether thinking is enabled for this request */
  enabled: boolean;
  /** Effort level — adapters map this to provider-specific params */
  effort: ThinkingEffort;
}

// ============================================================
// Provider Request
// ============================================================

/**
 * Normalized request passed to adapter's internal callApi.
 */
export interface ProviderRequest {
  /** Chat messages in OpenAI-style format */
  messages: ChatMessage[];
  /** Thinking configuration */
  thinking: ThinkingConfig;
  /** Max output tokens (adapter may override based on thinking mode) */
  maxTokens: number;
  /** Temperature (adapter may omit in thinking mode for some providers) */
  temperature: number;
}

// ============================================================
// Provider Response
// ============================================================

/**
 * Normalized response returned from adapter's internal callApi.
 */
export interface ProviderResponse {
  /** Main text content (the answer) */
  content: string;
  /** Optional reasoning/thinking text extracted from provider-specific fields */
  reasoningText?: string;
  /** Token usage statistics */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ============================================================
// OpenAI-Compatible Response Types (shared by multiple adapters)
// ============================================================

/**
 * OpenAI-compatible chat completions response.
 * Used by: OpenAI, DeepSeek, Qwen, BigModel, Moonshot adapters.
 */
export interface OpenAIChatCompletionsResponse {
  id: string;
  choices: Array<{
    message: {
      content: string | null;
      role: string;
      /** DeepSeek/Qwen/Moonshot: reasoning_content returned in thinking mode */
      reasoning_content?: string | null;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ============================================================
// Provider Test Result (Section XII)
// ============================================================

/**
 * Error classification for provider connection tests.
 * Maps HTTP status codes and error patterns to categories.
 */
export type ProviderTestErrorType =
  | 'auth'          // 401 / invalid API key
  | 'permission'    // 403 / forbidden / insufficient quota
  | 'rate_limit'    // 429 / rate limit exceeded
  | 'validation'    // 400 / bad request / invalid model
  | 'network'       // ECONNREFUSED / ENOTFOUND / timeout
  | 'server'        // 500+ / internal server error
  | 'unknown';      // Unclassifiable

/**
 * Unified test result with error classification.
 */
export interface ProviderTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  errorType?: ProviderTestErrorType;
  httpStatus?: number;
  testedAt: string;  // ISO timestamp
}

/**
 * Classify an error into ProviderTestErrorType based on HTTP status and error message.
 */
export function classifyTestError(
  httpStatus?: number,
  errorMessage?: string
): ProviderTestErrorType {
  if (httpStatus) {
    if (httpStatus === 401) return 'auth';
    if (httpStatus === 403) return 'permission';
    if (httpStatus === 429) return 'rate_limit';
    if (httpStatus === 400 || httpStatus === 422) return 'validation';
    if (httpStatus >= 500) return 'server';
  }

  const msg = (errorMessage || '').toLowerCase();

  // Network errors
  if (msg.includes('econnrefused') || msg.includes('enotfound') ||
      msg.includes('etimedout') || msg.includes('timeout') ||
      msg.includes('network') || msg.includes('fetch failed') ||
      msg.includes('dns')) {
    return 'network';
  }

  // Auth errors
  if (msg.includes('unauthorized') || msg.includes('invalid api key') ||
      msg.includes('authentication') || msg.includes('api key')) {
    return 'auth';
  }

  // Permission errors
  if (msg.includes('forbidden') || msg.includes('quota') ||
      msg.includes('permission') || msg.includes('billing')) {
    return 'permission';
  }

  // Rate limit
  if (msg.includes('rate limit') || msg.includes('too many requests')) {
    return 'rate_limit';
  }

  // Validation
  if (msg.includes('bad request') || msg.includes('invalid') ||
      msg.includes('model not found') || msg.includes('does not exist')) {
    return 'validation';
  }

  return 'unknown';
}

// ============================================================
// Model Refresh Types (Section X)
// ============================================================

/**
 * A model entry fetched from remote /v1/models endpoint.
 */
export interface RefreshedModel {
  apiModelId: string;
  displayName?: string;
}

/**
 * Result of refreshing model list for a provider.
 */
export interface ModelListRefreshResult {
  providerId: string;
  success: boolean;
  models: RefreshedModel[];
  errorMessage?: string;
  fetchedAt: string;  // ISO timestamp
}

// ============================================================
// Adapter Options
// ============================================================

/**
 * Common options for constructing an adapter.
 */
export interface AdapterOptions {
  providerId: string;
  model: string;
  thinkingEnabled?: boolean;
}
