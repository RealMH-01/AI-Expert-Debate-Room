import { getDatabase } from '../sqlite'
import type { ModelListRefreshResult } from '../../providers/modelListFetcher'

export function upsertRefreshedModels(result: ModelListRefreshResult): void {
  const db = getDatabase()
  const stmt = db.prepare(`
    INSERT INTO provider_models (
      provider_id, model_id, display_name, status, capabilities_json, source, last_fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider_id, model_id) DO UPDATE SET
      display_name = excluded.display_name,
      status = excluded.status,
      capabilities_json = excluded.capabilities_json,
      source = excluded.source,
      last_fetched_at = excluded.last_fetched_at
  `)
  db.transaction(() => {
    for (const model of result.models) {
      stmt.run(
        result.providerId,
        model.apiModelId,
        model.displayName ?? model.apiModelId,
        model.status,
        model.capabilities ? JSON.stringify(model.capabilities) : null,
        result.source,
        result.fetchedAt
      )
    }
  })()
}

export function getCachedProviderModels(providerId: string): unknown[] {
  return getDatabase()
    .prepare('SELECT * FROM provider_models WHERE provider_id = ? ORDER BY model_id ASC')
    .all(providerId)
}
