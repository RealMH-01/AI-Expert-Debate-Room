import type {
  DebateGenerateInput,
  DebateGenerateOutput,
  DebateModelProvider,
  VoteGenerateInput,
  VoteGenerateOutput
} from '../base'
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
import type { ChatMessage } from '../../prompts/moderatorPrompts'
import {
  getModelCapability,
  type ProviderId
} from '../../../shared/providers/modelRegistry'
import type { ProviderRequest, ProviderResponse } from '../types'
import { sanitizeErrorMessage } from '../types'
import type { DebatePhase } from '../../../shared/types'

export const DEFAULT_OUTPUT_TOKENS_BY_PHASE: Record<DebatePhase, number> = {
  moderator_opening: 4096,
  expert_initial: 16384,
  debate_round: 16384,
  moderator_round_summary: 8192,
  voting: 8192,
  settlement_pending: 4096,
  moderator_final_summary: 16384
}

type ProviderResponseFormat = NonNullable<ProviderRequest['responseFormat']>

export abstract class BaseAdapter implements DebateModelProvider {
  readonly name: string
  protected providerId: ProviderId
  protected model: string
  protected thinkingEnabled: boolean

  constructor(options: { providerId: ProviderId; model: string; thinkingEnabled?: boolean }) {
    this.providerId = options.providerId
    this.model = options.model
    this.thinkingEnabled = options.thinkingEnabled ?? false
    this.name = `${options.providerId}:${options.model}`
  }

  async generateModeratorOpening(input: DebateGenerateInput): Promise<DebateGenerateOutput> {
    return this.callMessages(buildModeratorOpeningPrompt(input), {
      phase: 'moderator_opening',
      signal: input.signal
    })
  }

  async generateExpertInitialAnswer(input: DebateGenerateInput): Promise<DebateGenerateOutput> {
    return this.callMessages(buildExpertInitialPrompt(input), {
      phase: 'expert_initial',
      responseFormat: this.getExpertOutputResponseFormat(),
      signal: input.signal
    })
  }

  async generateExpertDebateTurn(input: DebateGenerateInput): Promise<DebateGenerateOutput> {
    return this.callMessages(buildExpertDebatePrompt(input), {
      phase: 'debate_round',
      responseFormat: this.getExpertOutputResponseFormat(),
      signal: input.signal
    })
  }

  async generateModeratorRoundSummary(input: DebateGenerateInput): Promise<DebateGenerateOutput> {
    return this.callMessages(buildModeratorRoundSummaryPrompt(input), {
      phase: 'moderator_round_summary',
      signal: input.signal
    })
  }

  async generateModeratorFinalSummary(input: DebateGenerateInput): Promise<DebateGenerateOutput> {
    return this.callMessages(buildModeratorFinalSummaryPrompt(input), {
      phase: 'moderator_final_summary',
      signal: input.signal
    })
  }

  async generateExpertVote(input: VoteGenerateInput): Promise<VoteGenerateOutput> {
    const output = await this.callMessages(buildExpertVotePrompt(input), {
      phase: 'voting',
      responseFormat: 'json_object',
      signal: input.signal
    })
    let rawJson = output.content
    const jsonMatch = rawJson.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      rawJson = jsonMatch[1].trim()
    }
    return { rawJson, usage: output.usage, telemetry: output.telemetry }
  }

  protected async callMessages(
    messages: ChatMessage[],
    options: {
      phase: DebatePhase
      responseFormat?: ProviderResponseFormat
      signal?: AbortSignal
    }
  ): Promise<DebateGenerateOutput> {
    const request: ProviderRequest = {
      model: this.model,
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content
      })),
      signal: options.signal,
      temperature: 0.7,
      maxTokens: DEFAULT_OUTPUT_TOKENS_BY_PHASE[options.phase],
      responseFormat: options.responseFormat ?? 'text',
      thinking: { enabled: this.thinkingEnabled, effort: this.thinkingEnabled ? 'medium' : 'none' },
      telemetry: {
        provider: this.providerId,
        model: this.model,
        maxTokens: DEFAULT_OUTPUT_TOKENS_BY_PHASE[options.phase],
        thinkingEnabled: this.thinkingEnabled,
        responseFormat: options.responseFormat ?? 'text'
      }
    }
    let providerFallback: DebateGenerateOutput['providerFallback'] | undefined
    let response: ProviderResponse
    try {
      response = await this.send(request)
    } catch (error) {
      if (request.responseFormat === 'json_object' && isJsonObjectUnsupportedError(error)) {
        const reason = sanitizeErrorMessage(error instanceof Error ? error.message : String(error))
        console.warn(`[ProviderAdapter] json_object response_format fallback for ${this.name}: ${reason}`)
        providerFallback = {
          responseFormat: {
            from: 'json_object',
            to: 'text',
            reason
          }
        }
        const fallbackRequest: ProviderRequest = {
          ...request,
          responseFormat: 'text'
        }
        fallbackRequest.telemetry = {
          ...request.telemetry,
          responseFormat: 'text',
          fallback: providerFallback
        }
        response = await this.send(fallbackRequest)
        request.telemetry = fallbackRequest.telemetry
      } else {
        attachTelemetryToError(error, request.telemetry)
        throw error
      }
    }
    request.telemetry = {
      ...request.telemetry,
      ...response.telemetry,
      finishReason: response.finishReason,
      fallback: providerFallback ?? request.telemetry?.fallback
    }
    const finishError = getFinishReasonError(response)
    if (finishError) {
      const error = new Error(finishError)
      attachTelemetryToError(error, {
        ...request.telemetry,
        errorType: finishError.split(':')[0]
      })
      throw error
    }

    return {
      content: response.text,
      usage: response.usage
        ? {
            promptTokens: response.usage.inputTokens ?? 0,
            completionTokens: response.usage.outputTokens ?? 0,
            totalTokens: response.usage.totalTokens ?? 0
          }
        : undefined,
      providerFallback,
      telemetry: request.telemetry
    }
  }

  protected getExpertOutputResponseFormat(): ProviderResponseFormat {
    return this.shouldUseJsonModeForExpertOutput() ? 'json_object' : 'text'
  }

  protected shouldUseJsonModeForExpertOutput(): boolean {
    return getModelCapability(this.providerId, this.model)?.supportsJson === true
  }

  protected abstract send(request: ProviderRequest): Promise<ProviderResponse>
}

function attachTelemetryToError(error: unknown, telemetry: ProviderRequest['telemetry']): void {
  if (error && typeof error === 'object') {
    ;(error as { providerTelemetry?: ProviderRequest['telemetry'] }).providerTelemetry = telemetry
  }
}

function isJsonObjectUnsupportedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()
  const mentionsJsonMode =
    normalized.includes('response_format') ||
    normalized.includes('json_object') ||
    normalized.includes('json mode')
  const explicitUnsupported =
    normalized.includes('not support') ||
    normalized.includes('unsupported') ||
    normalized.includes('unrecognized') ||
    normalized.includes('unknown parameter') ||
    normalized.includes('invalid parameter') ||
    normalized.includes('invalid_request') ||
    normalized.includes('validation')
  return mentionsJsonMode && explicitUnsupported
}

function getFinishReasonError(response: ProviderResponse): string | null {
  if (response.toolCalls && response.toolCalls.length > 0) {
    return 'provider_incomplete: 模型返回了 tool_calls，未返回可展示的文本输出'
  }

  const finishReason = response.finishReason
  if (!finishReason) return null

  const normalized = finishReason.toLowerCase()
  if (['stop', 'completed', 'end_turn', 'stop_sequence'].includes(normalized)) {
    return null
  }
  if (normalized === 'length' || normalized === 'max_tokens' || normalized === 'max_tokens_reached') {
    return 'output_truncated: 模型输出达到 max_tokens，上调输出上限或缩短上下文后重试'
  }
  if (normalized === 'insufficient_system_resource') {
    return 'provider_incomplete: DeepSeek 系统资源不足，模型未能完成本轮输出，请稍后重试'
  }
  if (normalized === 'content_filter' || normalized === 'safety' || normalized === 'recitation') {
    return `provider_incomplete: 模型输出被安全策略中断 (${finishReason})`
  }
  if (normalized === 'tool_calls') {
    return 'provider_incomplete: 模型返回了 tool_calls，未返回可展示的文本输出'
  }
  if (normalized === 'incomplete') {
    const incompleteReason = readProviderRawReason(response.raw)
    if (incompleteReason === 'max_output_tokens' || incompleteReason === 'max_tokens') {
      return 'output_truncated: 模型输出达到 max_tokens，上调输出上限或缩短上下文后重试'
    }
    return 'provider_incomplete: 模型未完成本轮输出'
  }
  return null
}

function readProviderRawReason(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  const incompleteDetails = record.incomplete_details
  if (typeof incompleteDetails === 'object' && incompleteDetails !== null) {
    const reason = (incompleteDetails as Record<string, unknown>).reason
    return typeof reason === 'string' ? reason : null
  }
  return null
}
