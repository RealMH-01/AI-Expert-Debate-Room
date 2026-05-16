/**
 * BaseAdapter - Abstract base class for all provider adapters.
 *
 * Implements DebateModelProvider interface by converting debate-specific
 * inputs to ChatMessage[], calling the abstract callApi(), and converting
 * ProviderResponse back to DebateGenerateOutput.
 *
 * Subclasses only need to implement:
 * - callApi(request: ProviderRequest): Promise<ProviderResponse>
 * - testConnection(): Promise<TestConnectionResult> (optional override)
 *
 * This eliminates massive code duplication across adapters.
 */

import type {
  DebateModelProvider,
  DebateGenerateInput,
  DebateGenerateOutput,
  VoteGenerateInput,
  VoteGenerateOutput
} from '../base'
import type { ChatMessage } from '../../prompts/moderatorPrompts'
import type { ProviderRequest, ProviderResponse, ThinkingConfig } from '../types'
import {
  buildModeratorOpeningPrompt,
  buildModeratorRoundSummaryPrompt,
  buildModeratorFinalSummaryPrompt
} from '../../prompts/moderatorPrompts'
import {
  buildExpertInitialPrompt,
  buildExpertDebatePrompt
} from '../../prompts/expertPrompts'
import { buildExpertVotePrompt } from '../../prompts/votingPrompts'

export interface TestConnectionResult {
  success: boolean
  message: string
  latencyMs?: number
}

export abstract class BaseAdapter implements DebateModelProvider {
  abstract readonly name: string
  protected readonly model: string
  protected readonly providerId: string
  protected readonly thinkingEnabled: boolean

  constructor(providerId: string, model: string, thinkingEnabled: boolean = false) {
    this.providerId = providerId
    this.model = model
    this.thinkingEnabled = thinkingEnabled
  }

  /**
   * Core API call method. Each adapter implements this with
   * provider-specific HTTP request building and response parsing.
   */
  protected abstract callApi(request: ProviderRequest): Promise<ProviderResponse>

  // ================================================================
  // DebateModelProvider implementation
  // ================================================================

  async generateModeratorOpening(input: DebateGenerateInput): Promise<DebateGenerateOutput> {
    const messages = buildModeratorOpeningPrompt(input)
    return this.invokeAndConvert(messages)
  }

  async generateExpertInitialAnswer(input: DebateGenerateInput): Promise<DebateGenerateOutput> {
    const messages = buildExpertInitialPrompt(input)
    return this.invokeAndConvert(messages)
  }

  async generateExpertDebateTurn(input: DebateGenerateInput): Promise<DebateGenerateOutput> {
    const messages = buildExpertDebatePrompt(input)
    return this.invokeAndConvert(messages)
  }

  async generateModeratorRoundSummary(input: DebateGenerateInput): Promise<DebateGenerateOutput> {
    const messages = buildModeratorRoundSummaryPrompt(input)
    return this.invokeAndConvert(messages)
  }

  async generateModeratorFinalSummary(input: DebateGenerateInput): Promise<DebateGenerateOutput> {
    const messages = buildModeratorFinalSummaryPrompt(input)
    return this.invokeAndConvert(messages)
  }

  async generateExpertVote(input: VoteGenerateInput): Promise<VoteGenerateOutput> {
    const messages = buildExpertVotePrompt(input)
    const response = await this.invokeAndConvert(messages)

    let rawJson = response.content
    // Extract JSON from markdown code block if present
    const jsonMatch = rawJson.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      rawJson = jsonMatch[1].trim()
    }
    return { rawJson }
  }

  // ================================================================
  // Connection testing (override in subclass if needed)
  // ================================================================

  async testConnection(): Promise<TestConnectionResult> {
    return { success: false, message: 'Test connection not implemented for this adapter.' }
  }

  // ================================================================
  // Internal helpers
  // ================================================================

  /**
   * Build ProviderRequest from ChatMessage[], call adapter, convert response.
   */
  private async invokeAndConvert(messages: ChatMessage[]): Promise<DebateGenerateOutput> {
    const thinking: ThinkingConfig = {
      enabled: this.thinkingEnabled,
      effort: this.thinkingEnabled ? 'high' : 'none'
    }

    const request: ProviderRequest = {
      messages,
      thinking,
      maxTokens: this.thinkingEnabled ? 8192 : 4096,
      temperature: 0.7
    }

    const response = await this.callApi(request)

    return {
      content: response.content,
      usage: response.usage
    }
  }

  /**
   * Sanitize error messages to remove API keys and sensitive data.
   */
  protected sanitizeError(message: string): string {
    return message
      .replace(/sk-[a-zA-Z0-9]{20,}/g, 'sk-****')
      .replace(/sk-ant-[a-zA-Z0-9\-_]{20,}/g, 'sk-ant-****')
      .replace(/AIza[a-zA-Z0-9\-_]{20,}/g, 'AIza****')
      .replace(/Bearer [a-zA-Z0-9\-_]+/g, 'Bearer ****')
      .replace(/x-api-key["\s:=]+["']?[a-zA-Z0-9\-_]+/gi, 'x-api-key=****')
      .replace(/x-goog-api-key["\s:=]+["']?[a-zA-Z0-9\-_]+/gi, 'x-goog-api-key=****')
      .replace(/api[_-]?key["\s:=]+["']?[a-zA-Z0-9\-_]+/gi, 'api_key=****')
      .replace(/key=[a-zA-Z0-9\-_]+/gi, 'key=****')
  }
}
