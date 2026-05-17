/**
 * SessionDetail - 会议详情页
 *
 * 显示完整的会议内容：
 * - 基本信息
 * - 参会专家列表
 * - 主理人开场
 * - 专家首轮回答
 * - 辩论记录（按轮分组）
 * - 投票结果
 * - HP 结算
 * - Hell Pool
 * - 最终总结
 * - 结构化复盘
 * - Markdown 导出按钮
 */

import React, { useEffect, useState } from 'react'

interface SessionDetailProps {
  sessionId: string
  onBack: () => void
}

interface SessionFullDetail {
  session: {
    id: string
    room_id: string
    title: string
    user_question: string | null
    status: string
    current_phase: string | null
    final_summary: string | null
    created_at: string
    updated_at: string
  }
  room_name: string
  participants: Participant[]
  messages: DetailMessage[]
  votes: DetailVote[]
  settlements: DetailSettlement[]
  snapshots: DetailSnapshot[]
  claims: DetailClaim[]
  attacks: DetailAttack[]
  review: { id: string; session_id: string; review_json: string; markdown: string | null; created_at: string; updated_at: string } | null
}

interface Participant {
  id: string
  session_id: string
  agent_id: string
  role: string
  name: string
  provider: string | null
  model: string | null
  persona: string | null
  domain: string | null
  stance: string | null
  initial_hp: number
  final_hp: number | null
  initial_influence: number
  initial_prestige: number
  status: string
}

interface DetailMessage {
  id: string
  session_id: string
  round_index: number
  phase: string
  speaker_id: string | null
  speaker_name: string | null
  speaker_role: string | null
  content: string
  structured_json: string | null
  created_at: string
}

interface DetailVote {
  id: string
  round_index: number
  voter_agent_id: string
  target_agent_id: string
  score: number
  reason_json: string | null
  valid: number
  invalid_reason: string | null
}

interface DetailSettlement {
  id: string
  round_index: number
  settlement_json: string
  status: string
  applied_at: string | null
}

interface DetailSnapshot {
  id: string
  round_index: number
  agent_id: string
  hp: number
  influence: number
  prestige: number
  status: string
}

interface DetailClaim {
  id: string
  meeting_id: string
  round_index: number
  speaker_expert_id: string
  source_message_id: string
  claim_text: string
  status: 'active' | 'revised' | 'abandoned'
  revised_from_claim_id: string | null
}

interface DetailAttack {
  id: string
  meeting_id: string
  round_index: number
  attacker_expert_id: string
  target_expert_id: string | null
  target_claim_id: string | null
  target_claim_text: string | null
  attack_text: string
  attack_dimensions_json: string
  source_message_id: string
}

interface ReviewData {
  question: string
  room_name: string
  mode: string
  round_count: number
  core_disputes: string[]
  expert_positions: { expert_name: string; stance: string | null; key_arguments: string[] }[]
  major_attacks: string[]
  revisions: string[]
  voting_summary: { round_index: number; voter_name: string; target_name: string; score: number; valid: boolean }[]
  hp_changes: { expert_name: string; hp_before: number; hp_change: number; hp_after: number; reason: string }[]
  hell_pool: { expert_name: string; hp_at_entry: number; round_entered: number }[]
  final_recommendation: string
  unresolved_questions: string[]
}

const SessionDetail: React.FC<SessionDetailProps> = ({ sessionId, onBack }) => {
  const [detail, setDetail] = useState<SessionFullDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<string>('overview')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await window.api.historyGetDetail(sessionId)
        if (res.success && res.data) {
          setDetail(res.data as SessionFullDetail)
        } else {
          setError(res.error || '加载失败')
        }
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [sessionId])

  const handleExportMarkdown = async () => {
    setExporting(true)
    setExportMsg(null)
    try {
      const res = await window.api.exportMarkdown(sessionId)
      if (res.success && res.data) {
        if (res.data.canceled) {
          setExportMsg('导出已取消')
        } else {
          setExportMsg(`已导出到: ${res.data.filePath}`)
        }
      } else {
        setExportMsg(`导出失败: ${res.error || '未知错误'}`)
      }
    } catch (e) {
      setExportMsg(`导出失败: ${(e as Error).message}`)
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="session-detail">
        <div className="session-detail-loading">加载中...</div>
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="session-detail">
        <button className="btn btn-small" onClick={onBack}>返回列表</button>
        <div className="session-detail-error">{error || '会议数据为空'}</div>
      </div>
    )
  }

  const { session, room_name, participants, messages, votes, settlements, claims, attacks } = detail
  const moderator = participants.find((p) => p.role === 'moderator')
  const experts = participants.filter((p) => p.role === 'expert')

  // Parse review
  let reviewData: ReviewData | null = null
  if (detail.review) {
    try {
      reviewData = JSON.parse(detail.review.review_json) as ReviewData
    } catch {
      // ignore
    }
  }

  // Group messages by phase
  const openingMsgs = messages.filter((m) => m.phase === 'moderator_opening')
  const initialMsgs = messages.filter((m) => m.phase === 'expert_initial' && m.speaker_role === 'expert')
  const debateMsgs = messages.filter((m) => m.phase === 'debate_round')
  const roundSummaryMsgs = messages.filter((m) => m.phase === 'moderator_round_summary')
  const votingMsgs = messages.filter((m) => m.phase === 'voting')
  const settlementMsgs = messages.filter((m) => m.phase === 'settlement_pending')
  const finalMsgs = messages.filter((m) => m.phase === 'moderator_final_summary')

  // Get round indices
  const roundIndices = [...new Set(debateMsgs.map((m) => m.round_index))].sort((a, b) => a - b)

  // Participant name lookup
  const nameMap = new Map<string, string>()
  for (const p of participants) {
    nameMap.set(p.agent_id, p.name)
  }

  const renderClaimsForMessage = (messageId: string) => {
    const messageClaims = claims.filter((claim) => claim.source_message_id === messageId)
    if (messageClaims.length === 0) return null

    return (
      <div className="detail-claims">
        <div className="detail-subtitle">Claims</div>
        {messageClaims.map((claim) => (
          <div key={claim.id} className="detail-claim-item">
            <span className={`claim-status ${claim.status}`}>{claim.status}</span>
            <span>{claim.claim_text}</span>
          </div>
        ))}
      </div>
    )
  }

  const renderAttacksForMessage = (messageId: string) => {
    const messageAttacks = attacks.filter((attack) => attack.source_message_id === messageId)
    if (messageAttacks.length === 0) return null

    return (
      <div className="detail-attacks">
        <div className="detail-subtitle">攻击记录</div>
        {messageAttacks.map((attack) => (
          <div key={attack.id} className="detail-attack-item">
            <div className="detail-attack-line">
              <strong>{nameMap.get(attack.attacker_expert_id) || attack.attacker_expert_id.slice(0, 8)}</strong>
              <span> → </span>
              <strong>
                {attack.target_expert_id
                  ? nameMap.get(attack.target_expert_id) || attack.target_expert_id.slice(0, 8)
                  : '未绑定专家'}
              </strong>
            </div>
            {attack.target_claim_text && (
              <div className="detail-target-claim">被攻击观点：{attack.target_claim_text}</div>
            )}
            <div className="detail-attack-text">{attack.attack_text}</div>
            <div className="attack-dimensions">
              {parseAttackDimensions(attack.attack_dimensions_json).map((dimension) => (
                <span key={dimension} className="attack-dimension-tag">{dimension}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  const sections = [
    { id: 'overview', label: '概览' },
    { id: 'transcript', label: '发言记录' },
    { id: 'voting', label: '投票结果' },
    { id: 'settlement', label: 'HP结算' },
    { id: 'review', label: '结构化复盘' }
  ]

  return (
    <div className="session-detail">
      {/* Header */}
      <div className="session-detail-header">
        <button className="btn btn-small" onClick={onBack}>← 返回列表</button>
        <h2>{session.title}</h2>
        <div className="session-detail-actions">
          <button
            className="btn btn-primary btn-small"
            onClick={handleExportMarkdown}
            disabled={exporting}
          >
            {exporting ? '导出中...' : '导出 Markdown'}
          </button>
        </div>
      </div>

      {exportMsg && (
        <div className={`export-message ${exportMsg.includes('失败') ? 'error' : 'success'}`}>
          {exportMsg}
        </div>
      )}

      {/* Section tabs */}
      <div className="session-detail-tabs">
        {sections.map((s) => (
          <button
            key={s.id}
            className={`detail-tab ${activeSection === s.id ? 'active' : ''}`}
            onClick={() => setActiveSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="session-detail-content">
        {activeSection === 'overview' && (
          <div className="detail-section">
            {/* Basic info */}
            <div className="detail-card">
              <h4>基本信息</h4>
              <div className="detail-info-grid">
                <div><span className="detail-label">会议室:</span> {room_name}</div>
                <div><span className="detail-label">状态:</span> <span className={`status-badge status-${session.status}`}>{formatStatus(session.status)}</span></div>
                <div><span className="detail-label">开始时间:</span> {formatTime(session.created_at)}</div>
                <div><span className="detail-label">结束时间:</span> {formatTime(session.updated_at)}</div>
                <div><span className="detail-label">消息数:</span> {messages.length}</div>
                <div><span className="detail-label">辩论轮数:</span> {roundIndices.length}</div>
              </div>
            </div>

            {/* User question */}
            <div className="detail-card">
              <h4>用户问题</h4>
              <div className="detail-question">{session.user_question || '无'}</div>
            </div>

            {/* Moderator */}
            {moderator && (
              <div className="detail-card">
                <h4>主理人</h4>
                <div className="detail-info-grid">
                  <div><span className="detail-label">名称:</span> {moderator.name}</div>
                  <div><span className="detail-label">模型:</span> {moderator.provider || '-'}/{moderator.model || '-'}</div>
                  {moderator.persona && <div><span className="detail-label">人设:</span> {moderator.persona}</div>}
                </div>
              </div>
            )}

            {/* Expert list */}
            <div className="detail-card">
              <h4>参会专家 ({experts.length})</h4>
              <table className="detail-table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>Provider/Model</th>
                    <th>人设摘要</th>
                    <th>初始HP</th>
                    <th>最终HP</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {experts.map((expert) => (
                    <tr key={expert.id} className={expert.status === 'hell_pool' ? 'row-hell' : ''}>
                      <td>{expert.name}</td>
                      <td>{expert.provider || '-'}/{expert.model || '-'}</td>
                      <td>{expert.persona ? (expert.persona.length > 25 ? expert.persona.slice(0, 25) + '...' : expert.persona) : '-'}</td>
                      <td>{expert.initial_hp}</td>
                      <td>{expert.final_hp ?? '-'}</td>
                      <td><span className={`status-badge-sm ${expert.status}`}>{expert.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Final summary */}
            {session.final_summary && (
              <div className="detail-card">
                <h4>最终总结</h4>
                <div className="detail-content-block">{session.final_summary}</div>
              </div>
            )}
          </div>
        )}

        {activeSection === 'transcript' && (
          <div className="detail-section">
            {/* Opening */}
            {openingMsgs.length > 0 && (
              <div className="detail-card">
                <h4>主理人开场</h4>
                {openingMsgs.map((msg) => (
                  <div key={msg.id} className="detail-message message-moderator">
                    <div className="detail-msg-header">
                      <span className="detail-msg-speaker">{msg.speaker_name}</span>
                      <span className="detail-msg-role">主理人</span>
                    </div>
                    <div className="detail-msg-content">{msg.content}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Initial answers */}
            {initialMsgs.length > 0 && (
              <div className="detail-card">
                <h4>专家首轮回答</h4>
                {initialMsgs.map((msg) => (
                  <div key={msg.id} className="detail-message message-expert">
                    <div className="detail-msg-header">
                      <span className="detail-msg-speaker">{msg.speaker_name}</span>
                      <span className="detail-msg-role">专家</span>
                    </div>
                    <div className="detail-msg-content">{msg.content}</div>
                    {renderClaimsForMessage(msg.id)}
                    {renderAttacksForMessage(msg.id)}
                  </div>
                ))}
              </div>
            )}

            {/* Debate rounds */}
            {roundIndices.map((roundIdx) => (
              <div key={roundIdx} className="detail-card">
                <h4>第 {roundIdx} 轮辩论</h4>
                {debateMsgs
                  .filter((m) => m.round_index === roundIdx)
                  .map((msg) => (
                    <div key={msg.id} className="detail-message message-expert">
                      <div className="detail-msg-header">
                        <span className="detail-msg-speaker">{msg.speaker_name}</span>
                        <span className="detail-msg-role">{msg.speaker_role}</span>
                      </div>
                      <div className="detail-msg-content">{msg.content}</div>
                      {renderClaimsForMessage(msg.id)}
                      {renderAttacksForMessage(msg.id)}
                    </div>
                  ))}
                {roundSummaryMsgs
                  .filter((m) => m.round_index === roundIdx)
                  .map((msg) => (
                    <div key={msg.id} className="detail-message message-moderator">
                      <div className="detail-msg-header">
                        <span className="detail-msg-speaker">{msg.speaker_name}</span>
                        <span className="detail-msg-role">主理人小结</span>
                      </div>
                      <div className="detail-msg-content">{msg.content}</div>
                    </div>
                  ))}
              </div>
            ))}

            {/* Voting messages */}
            {votingMsgs.length > 0 && (
              <div className="detail-card">
                <h4>投票阶段消息</h4>
                {votingMsgs.map((msg) => (
                  <div key={msg.id} className="detail-message message-system">
                    <div className="detail-msg-header">
                      <span className="detail-msg-speaker">{msg.speaker_name}</span>
                    </div>
                    <div className="detail-msg-content">{msg.content}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Settlement messages */}
            {settlementMsgs.length > 0 && (
              <div className="detail-card">
                <h4>结算阶段消息</h4>
                {settlementMsgs.map((msg) => (
                  <div key={msg.id} className="detail-message message-system">
                    <div className="detail-msg-header">
                      <span className="detail-msg-speaker">{msg.speaker_name}</span>
                    </div>
                    <div className="detail-msg-content">{msg.content}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Final summary messages */}
            {finalMsgs.length > 0 && (
              <div className="detail-card">
                <h4>主理人最终总结</h4>
                {finalMsgs.map((msg) => (
                  <div key={msg.id} className="detail-message message-moderator">
                    <div className="detail-msg-header">
                      <span className="detail-msg-speaker">{msg.speaker_name}</span>
                      <span className="detail-msg-role">主理人</span>
                    </div>
                    <div className="detail-msg-content">{msg.content}</div>
                  </div>
                ))}
              </div>
            )}

            {messages.length === 0 && (
              <div className="detail-card">
                <p className="placeholder-text">本场会议没有消息记录。</p>
              </div>
            )}
          </div>
        )}

        {activeSection === 'voting' && (
          <div className="detail-section">
            {votes.length === 0 ? (
              <div className="detail-card">
                <p className="placeholder-text">本场会议没有投票记录。</p>
              </div>
            ) : (
              <div className="detail-card">
                <h4>投票记录</h4>
                <table className="detail-table">
                  <thead>
                    <tr>
                      <th>轮次</th>
                      <th>投票者</th>
                      <th>被投者</th>
                      <th>分数</th>
                      <th>有效</th>
                      <th>无效原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    {votes.map((v) => (
                      <tr key={v.id} className={v.valid !== 1 ? 'row-invalid' : ''}>
                        <td>{v.round_index}</td>
                        <td>{nameMap.get(v.voter_agent_id) || v.voter_agent_id.slice(0, 8)}</td>
                        <td>{nameMap.get(v.target_agent_id) || v.target_agent_id.slice(0, 8)}</td>
                        <td>{v.score}</td>
                        <td>{v.valid === 1 ? '是' : '否'}</td>
                        <td>{v.invalid_reason || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeSection === 'settlement' && (
          <div className="detail-section">
            {settlements.length === 0 ? (
              <div className="detail-card">
                <p className="placeholder-text">本场会议没有HP结算记录。</p>
              </div>
            ) : (
              settlements.map((s) => {
                let items: { agentId: string; agentName: string; rank: number; hpBefore: number; hpChange: number; hpAfter: number; enterHellPool: boolean; reason: string }[] = []
                try {
                  const data = JSON.parse(s.settlement_json)
                  if (data.items) items = data.items
                } catch {
                  // ignore
                }

                return (
                  <div key={s.id} className="detail-card">
                    <h4>
                      第 {s.round_index} 轮结算
                      <span className={`settlement-status-badge ${s.status}`}>
                        {s.status === 'applied' ? '已应用' : s.status === 'vetoed' ? '已否决' : s.status === 'skipped' ? '已跳过' : '待确认'}
                      </span>
                    </h4>
                    {items.length > 0 ? (
                      <table className="detail-table">
                        <thead>
                          <tr>
                            <th>排名</th>
                            <th>专家</th>
                            <th>HP前</th>
                            <th>变化</th>
                            <th>HP后</th>
                            <th>Hell Pool</th>
                            <th>原因</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item, idx) => (
                            <tr key={idx} className={item.enterHellPool ? 'row-hell' : ''}>
                              <td>#{item.rank}</td>
                              <td>{item.agentName}</td>
                              <td>{item.hpBefore}</td>
                              <td className={item.hpChange > 0 ? 'hp-gain' : item.hpChange < 0 ? 'hp-loss' : 'hp-neutral'}>
                                {item.hpChange > 0 ? `+${item.hpChange}` : item.hpChange}
                              </td>
                              <td>{item.hpAfter}</td>
                              <td>{item.enterHellPool ? '是' : '否'}</td>
                              <td>{item.reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="placeholder-text">结算详情无法解析</p>
                    )}
                  </div>
                )
              })
            )}

            {/* Hell Pool */}
            {experts.some((e) => e.status === 'hell_pool') && (
              <div className="detail-card">
                <h4>Hell Pool</h4>
                <ul className="hell-pool-list">
                  {experts
                    .filter((e) => e.status === 'hell_pool')
                    .map((e) => (
                      <li key={e.id}>
                        <strong>{e.name}</strong> - HP 降至 0，已堕入地狱。不可发言、不可投票。
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {activeSection === 'review' && (
          <div className="detail-section">
            {!reviewData ? (
              <div className="detail-card">
                <p className="placeholder-text">本场会议没有结构化复盘数据。复盘在会议结束时自动生成。</p>
              </div>
            ) : (
              <>
                <div className="detail-card">
                  <h4>基本信息</h4>
                  <div className="detail-info-grid">
                    <div><span className="detail-label">问题:</span> {reviewData.question}</div>
                    <div><span className="detail-label">会议室:</span> {reviewData.room_name}</div>
                    <div><span className="detail-label">模式:</span> {reviewData.mode}</div>
                    <div><span className="detail-label">辩论轮数:</span> {reviewData.round_count}</div>
                  </div>
                </div>

                {reviewData.core_disputes.length > 0 && (
                  <div className="detail-card">
                    <h4>核心争议</h4>
                    <ul className="review-list">
                      {reviewData.core_disputes.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {reviewData.expert_positions.length > 0 && (
                  <div className="detail-card">
                    <h4>专家立场</h4>
                    {reviewData.expert_positions.map((p, i) => (
                      <div key={i} className="review-position">
                        <strong>{p.expert_name}</strong>
                        {p.stance && <span className="review-stance"> ({p.stance})</span>}
                        <ul className="review-list">
                          {p.key_arguments.map((arg, j) => (
                            <li key={j}>{arg}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                {reviewData.major_attacks.length > 0 && (
                  <div className="detail-card">
                    <h4>主要攻击</h4>
                    <ul className="review-list">
                      {reviewData.major_attacks.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {reviewData.hp_changes.length > 0 && (
                  <div className="detail-card">
                    <h4>HP 变化汇总</h4>
                    <table className="detail-table">
                      <thead>
                        <tr>
                          <th>专家</th>
                          <th>变化前</th>
                          <th>变化量</th>
                          <th>变化后</th>
                          <th>原因</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reviewData.hp_changes.map((h, i) => (
                          <tr key={i}>
                            <td>{h.expert_name}</td>
                            <td>{h.hp_before}</td>
                            <td className={h.hp_change > 0 ? 'hp-gain' : h.hp_change < 0 ? 'hp-loss' : 'hp-neutral'}>
                              {h.hp_change > 0 ? `+${h.hp_change}` : h.hp_change}
                            </td>
                            <td>{h.hp_after}</td>
                            <td>{h.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {reviewData.hell_pool.length > 0 && (
                  <div className="detail-card">
                    <h4>Hell Pool 记录</h4>
                    <ul className="review-list">
                      {reviewData.hell_pool.map((h, i) => (
                        <li key={i}>
                          <strong>{h.expert_name}</strong> - 在第{h.round_entered}轮堕入地狱 (HP: {h.hp_at_entry})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="detail-card">
                  <h4>最终建议</h4>
                  <div className="detail-content-block">
                    {reviewData.final_recommendation.length > 500
                      ? reviewData.final_recommendation.slice(0, 500) + '...'
                      : reviewData.final_recommendation}
                  </div>
                </div>

                {reviewData.unresolved_questions.length > 0 && (
                  <div className="detail-card">
                    <h4>未解决问题</h4>
                    <ul className="review-list">
                      {reviewData.unresolved_questions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Helpers
function formatTime(iso: string): string {
  if (!iso) return '未知'
  try {
    const d = new Date(iso)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch {
    return iso
  }
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

function formatStatus(status: string): string {
  const map: Record<string, string> = {
    preparing: '准备中',
    running: '进行中',
    finished: '已完成',
    failed: '失败'
  }
  return map[status] || status
}

function parseAttackDimensions(json: string | null | undefined): string[] {
  if (!json) return ['unknown']
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) && parsed.length > 0
      ? parsed.map((item) => String(item))
      : ['unknown']
  } catch {
    return ['unknown']
  }
}

export default SessionDetail
