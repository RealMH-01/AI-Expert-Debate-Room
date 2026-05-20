import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import SettlementPreview from '../src/renderer/components/SettlementPreview'
import type { SettlementResultDisplay } from '../src/shared/types'

const settlement: SettlementResultDisplay = {
  sessionId: 'session-ui',
  roundIndex: 3,
  rankings: [],
  items: [
    {
      agentId: 'expert-1',
      agentName: 'Expert 1',
      rank: 1,
      hpBefore: 50,
      hpChange: 3,
      hpAfter: 53,
      enterHellPool: false,
      reason: 'winner'
    }
  ],
  status: 'pending',
  aliveExpertCount: 1
}

describe('SettlementPreview resolving state', () => {
  it('disables both apply and veto buttons while apply is resolving', () => {
    const html = renderToStaticMarkup(
      <SettlementPreview
        settlement={settlement}
        visible
        resolvingAction="apply"
        onApply={vi.fn()}
        onVeto={vi.fn()}
      />
    )

    expect(html.match(/disabled=""/g)).toHaveLength(2)
  })

  it('disables both apply and veto buttons while veto is resolving and shows veto feedback', () => {
    const html = renderToStaticMarkup(
      <SettlementPreview
        settlement={settlement}
        visible
        resolvingAction="veto"
        onApply={vi.fn()}
        onVeto={vi.fn()}
      />
    )

    expect(html.match(/disabled=""/g)).toHaveLength(2)
    expect(html).toContain('正在否决')
  })
})
