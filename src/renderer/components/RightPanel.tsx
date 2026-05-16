/**
 * 右侧面板：主理人 / 规则 / 状态面板占位
 *
 * 本轮只做占位，不实现任何业务功能
 */

import React from 'react'

const RightPanel: React.FC = () => {
  return (
    <div className="panel-right">
      <div className="panel-title">主理人 / 规则 / 状态</div>
      <div className="panel-body">
        <p className="placeholder-text">
          主理人和规则面板将在后续轮次实现。
        </p>
        <br />
        <p className="placeholder-text">
          在这里你将可以查看：
        </p>
        <ul className="placeholder-text" style={{ paddingLeft: 16, marginTop: 8 }}>
          <li>当前主理人信息</li>
          <li>会议规则配置</li>
          <li>辩论阶段状态</li>
          <li>专家 HP 和排名</li>
          <li>投票与结算结果</li>
        </ul>
      </div>
    </div>
  )
}

export default RightPanel
