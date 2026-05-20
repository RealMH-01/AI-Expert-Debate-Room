import { useEffect } from 'react';
import type React from 'react';

interface EliminationBannerProps {
  visible: boolean;
  eliminatedAgentIds: string[];
  /** 专家 ID -> 名字映射 */
  expertNames: Record<string, string>;
  onClose: () => void;
  /** 自动隐藏延时，0 表示不自动隐藏 */
  autoHideMs?: number;
}

/**
 * 淘汰横幅组件。
 *
 * 纯受控组件：visible / eliminatedAgentIds / onClose 由父组件控制。
 */
export function EliminationBanner({
  visible,
  eliminatedAgentIds,
  expertNames,
  onClose,
  autoHideMs = 5000
}: EliminationBannerProps): React.ReactElement | null {
  useEffect(() => {
    if (!visible || autoHideMs <= 0) return undefined;

    const timer = window.setTimeout(() => {
      onClose();
    }, autoHideMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [visible, autoHideMs, onClose]);

  if (!visible || eliminatedAgentIds.length === 0) {
    return null;
  }

  const eliminatedNames = eliminatedAgentIds
    .map((agentId) => expertNames[agentId] ?? agentId)
    .join('、');

  return (
    <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2">
      <div className="flex items-center gap-3 rounded-lg bg-red-600 px-6 py-3 text-white shadow-lg">
        <span className="text-2xl">💀</span>
        <div>
          <div className="text-sm font-bold">专家淘汰</div>
          <div className="text-xs opacity-90">{eliminatedNames} 已被淘汰，进入 Hell Pool</div>
        </div>
        <button
          type="button"
          className="ml-4 text-white/70 transition-colors hover:text-white"
          onClick={onClose}
          aria-label="关闭淘汰提示"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default EliminationBanner;
