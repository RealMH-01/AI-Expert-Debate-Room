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
import type { ProviderId } from '../../../shared/providers/modelRegistry'
import type { ProviderRequest, ProviderResponse } from '../types'

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
    return this.callMessages(buildModeratorOpeningPrompt(input))
  }

  async generateExpertInitialAnswer(input: DebateGenerateInput): Promise<DebateGenerateOutput> {
    return this.callMessages(buildExpertInitialPrompt(input))
  }

  async generateExpertDebateTurn(input: DebateGenerateInput): Promise<DebateGenerateOutput> {
    return this.callMessages(buildExpertDebatePrompt(input))
  }

  async generateModeratorRoundSummary(input: DebateGenerateInput): Promise<DebateGenerateOutput> {
    return this.callMessages(buildModeratorRoundSummaryPrompt(input))
  }

  async generateModeratorFinalSummary(input: DebateGenerateInput): Promise<DebateGenerateOutput> {
    return this.callMessages(buildModeratorFinalSummaryPrompt(input))
  }

  async generateExpertVote(input: VoteGenerateInput): Promise<VoteGenerateOutput> {
    const output = await this.callMessages(buildExpertVotePrompt(input), 'json_object')
    let rawJson = output.content
    const jsonMatch = rawJson.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      rawJson = jsonMatch[1].trim()
    }
    return { rawJson }
  }

  protected async callMessages(
    messages: ChatMessage[],
    responseFormat: 'text' | 'json_object' = 'text'
  ): Promise<DebateGenerateOutput> {
    const response = await this.send({
      model: this.model,
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content
      })),
      temperature: 0.7,
      maxTokens: 4096,
      responseFormat,
      thinking: { enabled: this.thinkingEnabled, effort: this.thinkingEnabled ? 'medium' : 'none' }
    })

    return {
      content: response.text,
      usage: response.usage
        ? {
            promptTokens: response.usage.inputTokens ?? 0,
            completionTokens: response.usage.outputTokens ?? 0,
            totalTokens: response.usage.totalTokens ?? 0
          }
        : undefined
    }
  }

  protected abstract send(request: ProviderRequest): Promise<ProviderResponse>
}
