import { useState } from 'react';
import type React from 'react';
import type { ExpertSettlementResult, RoundSettlementResult } from '@shared/types';

interface RoundSettlementCardProps {
  settlement: RoundSettlementResult;
  /** 专家 ID -> 名字映射 */
  expertNames: Record<string, string>;
  defaultExpanded?: boolean;
}

/**
 * 单轮结算结果卡片。
 *
 * 只展示已有结算字段：
 * - baseHpChange
 * - extraPenalty
 * - finalHpChange
 * - rawHpAfter
 * - clampedHp
 * - eliminated
 */
export function RoundSettlementCard({
  settlement,
  expertNames,
  defaultExpanded = true
}: RoundSettlementCardProps): React.ReactElement {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const sortedResults = [...settlement.results].sort((a, b) => a.displayRank - b.displayRank);

  return (
    <div className="overflow-hidden rounded-lg border bg-white dark:bg-gray-900">
      <button
        type="button"
        className="flex w-full items-center justify-between bg-gray-50 px-4 py-2 transition-colors hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
        onClick={() => setExpanded((value) => !value)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Round {settlement.round} 结算</span>

          {settlement.isProtectionSettlement && (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-300">
              🛡️ 保护期
            </span>
          )}

          {settlement.eliminatedAgentIds.length > 0 && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-900 dark:text-red-300">
              💀 有淘汰
            </span>
          )}
        </div>

        <span className="text-sm text-gray-400">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="space-y-1 px-4 py-2">
          {sortedResults.map((result) => (
            <SettlementRow
              key={result.agentId}
              result={result}
              name={expertNames[result.agentId] ?? result.agentId}
            />
          ))}

          {settlement.triggersEndgame && (
            <div className="mt-2 text-xs font-medium text-orange-600 dark:text-orange-400">
              ⚡ 触发终局
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface SettlementRowProps {
  result: ExpertSettlementResult;
  name: string;
}

function SettlementRow({ result, name }: SettlementRowProps): React.ReactElement {
  const changeColor =
    result.finalHpChange > 0
      ? 'text-green-600 dark:text-green-400'
      : result.finalHpChange < 0
        ? 'text-red-600 dark:text-red-400'
        : 'text-gray-500';

  return (
    <div
      className={`flex items-center justify-between rounded px-2 py-1 text-sm ${
        result.eliminated ? 'bg-red-50 dark:bg-red-950' : ''
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="w-6 text-xs font-bold text-gray-400">#{result.displayRank}</span>
        <span
          className={`truncate font-medium ${result.eliminated ? 'text-red-500 line-through' : ''}`}
          title={name}
        >
          {name}
        </span>
        {result.eliminated && <span className="text-xs">💀</span>}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {result.extraPenalty < 0 && (
          <span
            className="rounded bg-red-100 px-1 py-0.5 text-xs text-red-700 dark:bg-red-900 dark:text-red-300"
            title="连续垫底额外惩罚"
          >
            连续{result.nextConsecutiveLastCount}轮
          </span>
        )}

        <span className="font-mono text-xs text-gray-400">
          base {formatSignedNumber(result.baseHpChange)}
        </span>

        <span className={`font-mono font-bold ${changeColor}`}>
          {formatSignedNumber(result.finalHpChange)}
        </span>

        <span className="w-24 text-right font-mono text-xs text-gray-500">
          {result.rawHpAfter} → {result.clampedHp}
        </span>
      </div>
    </div>
  );
}

function formatSignedNumber(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export default RoundSettlementCard;
