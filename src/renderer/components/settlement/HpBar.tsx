import type React from 'react';

/**
 * 专家 HP 显示状态。
 *
 * 本类型仅用于 renderer 组件 props。
 * 不写入 shared，避免扩大本轮范围。
 */
export interface ExpertHpDisplay {
  agentId: string;
  name: string;
  currentHp: number;
  hpCap: number;
  previousHp?: number;
  hpChange?: number;
  isEliminated: boolean;
  consecutiveLastCount?: number;
  displayRank?: number | null;
  hpZone?: HpZone;
}

/**
 * HP 所处区间。
 */
export type HpZone = 'safe' | 'warning' | 'danger' | 'critical' | 'dead';

interface HpBarProps {
  expert: ExpertHpDisplay;
  /** 是否显示 HP 变化值 */
  showChange?: boolean;
  /** 是否紧凑模式 */
  compact?: boolean;
}

/**
 * 根据 HP 值计算所处区间。
 */
export function getHpZone(hp: number): HpZone {
  if (hp <= 0) return 'dead';
  if (hp <= 10) return 'critical';
  if (hp <= 20) return 'danger';
  if (hp <= 30) return 'warning';
  return 'safe';
}

/**
 * 单个专家 HP 条组件。
 */
export function HpBar({
  expert,
  showChange = true,
  compact = false
}: HpBarProps): React.ReactElement {
  const hpCap = expert.hpCap > 0 ? expert.hpCap : 100;
  const hpPercentage = Math.max(0, Math.min(100, (expert.currentHp / hpCap) * 100));
  const zone = expert.hpZone ?? getHpZone(expert.currentHp);
  const barColorClass = getBarColorClass(zone);
  const hpChange = expert.hpChange ?? 0;
  const changeColorClass =
    hpChange > 0 ? 'text-green-500' : hpChange < 0 ? 'text-red-500' : 'text-gray-400';

  if (compact) {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="w-20 truncate text-xs font-medium" title={expert.name}>
          {expert.name}
        </span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${barColorClass}`}
            style={{ width: `${hpPercentage}%` }}
          />
        </div>
        <span className="w-10 text-right font-mono text-xs">
          {expert.isEliminated ? '💀' : expert.currentHp}
        </span>
        {showChange && hpChange !== 0 && (
          <span className={`w-10 text-right font-mono text-xs ${changeColorClass}`}>
            {hpChange > 0 ? '+' : ''}
            {hpChange}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border p-3 ${
        expert.isEliminated
          ? 'bg-gray-100 opacity-60 dark:bg-gray-800'
          : 'bg-white dark:bg-gray-900'
      }`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {typeof expert.displayRank === 'number' && (
            <span className="text-xs font-bold text-gray-500">#{expert.displayRank}</span>
          )}
          <span className="max-w-[160px] truncate text-sm font-medium" title={expert.name}>
            {expert.name}
          </span>
          {expert.isEliminated && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-700 dark:bg-red-900 dark:text-red-300">
              ELIMINATED
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-sm">
            {expert.currentHp}/{hpCap}
          </span>
          {showChange && hpChange !== 0 && (
            <span className={`font-mono text-sm font-bold ${changeColorClass}`}>
              ({hpChange > 0 ? '+' : ''}
              {hpChange})
            </span>
          )}
        </div>
      </div>

      <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${barColorClass}`}
          style={{ width: `${hpPercentage}%` }}
        />
      </div>

      {(expert.consecutiveLastCount ?? 0) >= 2 && !expert.isEliminated && (
        <div className="mt-1 text-xs text-orange-600 dark:text-orange-400">
          ⚠️ 连续垫底 {expert.consecutiveLastCount} 轮
        </div>
      )}
    </div>
  );
}

function getBarColorClass(zone: HpZone): string {
  switch (zone) {
    case 'safe':
      return 'bg-green-500';
    case 'warning':
      return 'bg-yellow-500';
    case 'danger':
      return 'bg-orange-500';
    case 'critical':
      return 'bg-red-600 animate-pulse';
    case 'dead':
      return 'bg-gray-400';
  }
}

export default HpBar;
