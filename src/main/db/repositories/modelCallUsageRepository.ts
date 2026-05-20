import { getDatabase } from '../sqlite'
import type { ModelCallUsageRecordInput } from '../../cost/usageTracker'

export interface ModelCallUsageRecord extends ModelCallUsageRecordInput {}

export function insertModelCallUsage(record: ModelCallUsageRecordInput): void {
  const db = getDatabase()
  db.prepare(
    `INSERT INTO model_call_usage (
      id, meeting_id, phase, round_index, role, expert_id, provider, model,
      estimated_input_tokens, estimated_output_tokens, actual_input_tokens, actual_output_tokens,
      estimated_cost, currency, pricing_source, request_started_at, request_finished_at,
      queue_wait_ms, request_duration_ms, total_duration_ms, finish_reason, error_type,
      timeout_ms, max_tokens, thinking_enabled, response_format, provider_fallback_json, created_at
    ) VALUES (
      @id, @meeting_id, @phase, @round_index, @role, @expert_id, @provider, @model,
      @estimated_input_tokens, @estimated_output_tokens, @actual_input_tokens, @actual_output_tokens,
      @estimated_cost, @currency, @pricing_source, @request_started_at, @request_finished_at,
      @queue_wait_ms, @request_duration_ms, @total_duration_ms, @finish_reason, @error_type,
      @timeout_ms, @max_tokens, @thinking_enabled, @response_format, @provider_fallback_json, @created_at
    )`
  ).run(record)
}

export function getModelCallUsageForMeeting(meetingId: string): ModelCallUsageRecord[] {
  const db = getDatabase()
  return db
    .prepare(
      `SELECT * FROM model_call_usage
       WHERE meeting_id = ?
       ORDER BY request_started_at ASC, created_at ASC`
    )
    .all(meetingId) as ModelCallUsageRecord[]
}
