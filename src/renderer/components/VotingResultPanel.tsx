/**
 * VotingResultPanel - 投票结果面板
 *
 * 显示投票排名结果。
 * 只展示系统规则引擎确定的客观结果，不展示主理人的主观评价。
 */

import React from 'react'
import type { RankingEntryDisplay } from '../../shared/types'

interface VotingResultPanelProps {
  rankings: RankingEntryDisplay[]
  visible: boolean
}

const VotingResultPanel: React.FC<VotingResultPanelProps> = ({ rankings, visible }) => {
  if (!visible || rankings.length === 0) return null

  return (
    <div className="voting-result-panel">
      <h3>📊 投票排名结果</h3>
      <p className="voting-note">
        排名由系统规则引擎（VoteValidator）根据有效票客观计算。主理人无权审票。
      </p>
      <table className="ranking-table">
        <thead>
          <tr>
            <th>名次</th>
            <th>专家</th>
            <th>平均分</th>
            <th>总分</th>
            <th>有效票数</th>
            <th>议事权</th>
          </tr>
        </thead>
        <tbody>
          {rankings.map((entry) => (
            <tr
              key={entry.agentId}
              className={
                entry.rank === 1
                  ? 'rank-first'
                  : entry.rank === rankings.length
                    ? 'rank-last'
                    : ''
              }
            >
              <td className="rank-cell">
                {entry.rank === 1 && '🥇'}
                {entry.rank === 2 && '🥈'}
                {entry.rank === 3 && '🥉'}
                {entry.rank > 3 && `#${entry.rank}`}
              </td>
              <td>{entry.agentName}</td>
              <td>{entry.scoreAvg.toFixed(2)}</td>
              <td>{entry.scoreSum}</td>
              <td>{entry.voteCount}</td>
              <td>{entry.influence}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="voting-disclaimer">
        议事权仅用于同分排序，不影响最终总结观点权重。
      </p>
    </div>
  )
}

export default VotingResultPanel
