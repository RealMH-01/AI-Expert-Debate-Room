import { useState } from 'react';
import type React from 'react';
import type { RoundPhase } from '@shared/types';

export type DecisionActionType =
  | 'continue'
  | 'end_session'
  | 'inject_question'
  | 'revive_expert';

interface UserDecisionPanelProps {
  currentRoundPhase: RoundPhase | null;
  isResolving: boolean;
  activeAction: DecisionActionType | null;
  onContinue: () => void;
  onEndSession: () => void;
  onInjectQuestion: (content: string) => void;
  onReviveExpert: (agentId: string) => void;
  eliminatedExperts: Array<{ agentId: string; name: string }>;
}

/**
 * 用户决策面板。
 *
 * 纯受控组件：
 * - currentRoundPhase / isResolving / activeAction 由父组件控制
 * - 点击后只调用回调，不直接访问 store / IPC
 *
 * 按钮 disabled 规则：
 * - currentRoundPhase !== 'user_decision' 时全部 disabled
 * - isResolving === true 时全部 disabled
 * - 点击后父组件应立即把 isResolving 设为 true + 记录 activeAction
 */
export function UserDecisionPanel({
  currentRoundPhase,
  isResolving,
  activeAction,
  onContinue,
  onEndSession,
  onInjectQuestion,
  onReviveExpert,
  eliminatedExperts
}: UserDecisionPanelProps): React.ReactElement {
  const [showInjectInput, setShowInjectInput] = useState(false);
  const [injectContent, setInjectContent] = useState('');
  const [showReviveSelect, setShowReviveSelect] = useState(false);

  const isUserDecisionPhase = currentRoundPhase === 'user_decision';
  const buttonsDisabled = !isUserDecisionPhase || isResolving;

  const handleContinue = (): void => {
    if (buttonsDisabled) return;
    onContinue();
  };

  const handleEndSession = (): void => {
    if (buttonsDisabled) return;
    onEndSession();
  };

  const handleInjectSubmit = (): void => {
    if (buttonsDisabled || injectContent.trim() === '') return;
    onInjectQuestion(injectContent.trim());
    setInjectContent('');
    setShowInjectInput(false);
  };

  const handleRevive = (agentId: string): void => {
    if (buttonsDisabled) return;
    onReviveExpert(agentId);
    setShowReviveSelect(false);
  };

  return (
    <div className="space-y-3 rounded-lg border bg-white p-4 dark:bg-gray-900">
      <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {isUserDecisionPhase ? '请选择下一步操作：' : '等待辩论进行中...'}
      </div>

      <div className="flex flex-wrap gap-2">
        <DecisionButton
          disabled={buttonsDisabled}
          isActive={activeAction === 'continue'}
          resolving={isResolving}
          className="bg-blue-600 hover:bg-blue-700"
          onClick={handleContinue}
        >
          {activeAction === 'continue' && isResolving ? '处理中...' : '▶ 继续下一轮'}
        </DecisionButton>

        <DecisionButton
          disabled={buttonsDisabled}
          isActive={activeAction === 'end_session'}
          resolving={isResolving}
          className="bg-red-600 hover:bg-red-700"
          onClick={handleEndSession}
        >
          {activeAction === 'end_session' && isResolving ? '处理中...' : '⏹ 结束辩论'}
        </DecisionButton>

        <DecisionButton
          disabled={buttonsDisabled}
          isActive={activeAction === 'inject_question'}
          resolving={isResolving}
          className="bg-purple-600 hover:bg-purple-700"
          onClick={() => setShowInjectInput((value) => !value)}
        >
          💉 注入问题
        </DecisionButton>

        {eliminatedExperts.length > 0 && (
          <DecisionButton
            disabled={buttonsDisabled}
            isActive={activeAction === 'revive_expert'}
            resolving={isResolving}
            className="bg-green-600 hover:bg-green-700"
            onClick={() => setShowReviveSelect((value) => !value)}
          >
            {activeAction === 'revive_expert' && isResolving ? '处理中...' : '🔄 复活专家'}
          </DecisionButton>
        )}
      </div>

      {showInjectInput && (
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 rounded-md border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
            placeholder="输入要注入的新问题或方向..."
            value={injectContent}
            onChange={(event) => setInjectContent(event.target.value)}
            disabled={buttonsDisabled}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleInjectSubmit();
            }}
          />
          <button
            type="button"
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              buttonsDisabled || injectContent.trim() === ''
                ? 'cursor-not-allowed bg-gray-200 text-gray-400'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
            onClick={handleInjectSubmit}
            disabled={buttonsDisabled || injectContent.trim() === ''}
          >
            发送
          </button>
        </div>
      )}

      {showReviveSelect && eliminatedExperts.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-gray-500">选择要复活的专家：</div>
          {eliminatedExperts.map((expert) => (
            <button
              key={expert.agentId}
              type="button"
              className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                buttonsDisabled
                  ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                  : 'hover:border-green-300 hover:bg-green-50 dark:hover:bg-green-950'
              }`}
              onClick={() => handleRevive(expert.agentId)}
              disabled={buttonsDisabled}
            >
              🔄 {expert.name}
            </button>
          ))}
        </div>
      )}

      {isResolving && activeAction && (
        <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          正在处理 {activeAction}...
        </div>
      )}
    </div>
  );
}

interface DecisionButtonProps {
  disabled: boolean;
  isActive: boolean;
  resolving: boolean;
  className: string;
  onClick: () => void;
  children: React.ReactNode;
}

function DecisionButton({
  disabled,
  isActive,
  resolving,
  className,
  onClick,
  children
}: DecisionButtonProps): React.ReactElement {
  const disabledClass =
    'cursor-not-allowed bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500';
  const activeClass = isActive && resolving ? 'opacity-80' : '';

  return (
    <button
      type="button"
      className={`rounded-md px-4 py-2 text-sm font-medium text-white transition-colors ${
        disabled ? disabledClass : className
      } ${activeClass}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export default UserDecisionPanel;
