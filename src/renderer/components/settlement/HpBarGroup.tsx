import type React from 'react';
import { HpBar } from './HpBar';
import type { ExpertHpDisplay } from './HpBar';

interface HpBarGroupProps {
  experts: ExpertHpDisplay[];
  currentRound?: number;
  compact?: boolean;
  showChange?: boolean;
}

/**
 * 专家 HP 条列表组件。
 *
 * 纯受控组件：通过 props 接收专家 HP 数据，不读取 store。
 */
export function HpBarGroup({
  experts,
  currentRound,
  compact = false,
  showChange = true
}: HpBarGroupProps): React.ReactElement {
  const sortedExperts = [...experts].sort((a, b) => {
    if (a.isEliminated !== b.isEliminated) {
      return a.isEliminated ? 1 : -1;
    }

    return b.currentHp - a.currentHp;
  });

  return (
    <div className="space-y-1">
      {typeof currentRound === 'number' && currentRound > 0 && (
        <div className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
          Round {currentRound}
        </div>
      )}

      {sortedExperts.length === 0 ? (
        <div className="rounded border border-dashed p-3 text-sm text-gray-500">
          暂无专家 HP 数据
        </div>
      ) : (
        sortedExperts.map((expert) => (
          <HpBar
            key={expert.agentId}
            expert={expert}
            compact={compact}
            showChange={showChange}
          />
        ))
      )}
    </div>
  );
}

export default HpBarGroup;
