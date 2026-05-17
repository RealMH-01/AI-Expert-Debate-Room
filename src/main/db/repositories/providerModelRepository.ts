import { getDatabase } from '../sqlite'
import type { ModelListRefreshResult } from '../../providers/modelListFetcher'
import { getModelCapability } from '../../../shared/providers/modelRegistry'

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
      const staticCapability = getModelCapability(result.providerId, model.apiModelId)
      const status = staticCapability?.status === 'active' ? 'active' : 'unverified'
      stmt.run(
        result.providerId,
        model.apiModelId,
        model.displayName ?? model.apiModelId,
        status,
        staticCapability ? JSON.stringify(staticCapability) : null,
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

export function upsertTestedModel(params: {
  providerId: string
  modelId: string
  displayName?: string
  testedAt: string
  testStatus: 'success' | 'failure'
}): void {
  const staticCapability = getModelCapability(params.providerId, params.modelId)
  const status = staticCapability?.status === 'active' ? 'active' : 'unverified'
  getDatabase()
    .prepare(`
      INSERT INTO provider_models (
        provider_id, model_id, display_name, status, capabilities_json, source,
        last_fetched_at, last_test_status, last_test_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_id, model_id) DO UPDATE SET
        display_name = excluded.display_name,
        status = excluded.status,
        capabilities_json = excluded.capabilities_json,
        source = excluded.source,
        last_test_status = excluded.last_test_status,
        last_test_at = excluded.last_test_at
    `)
    .run(
      params.providerId,
      params.modelId,
      params.displayName ?? params.modelId,
      status,
      staticCapability ? JSON.stringify(staticCapability) : null,
      staticCapability ? 'static_seed' : 'user_custom',
      params.testedAt,
      params.testStatus,
      params.testedAt
    )
}
