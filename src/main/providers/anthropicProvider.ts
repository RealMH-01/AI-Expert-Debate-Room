/**
 * Anthropic Provider - Legacy Compatibility Layer
 *
 * Round 7: Delegates to AnthropicAdapter in adapters/ directory.
 * Kept for backward compatibility with existing imports.
 */

export { AnthropicAdapter as AnthropicProvider } from './adapters'
