/**
 * 左侧面板：会议室 / 专家列表占位
 *
 * 本轮只做占位，不实现任何业务功能
 */

import React from 'react'

const LeftPanel: React.FC = () => {
  return (
    <div className="panel-left">
      <div className="panel-title">会议室 / 专家</div>
      <div className="panel-body">
        <p className="placeholder-text">
          会议室列表将在后续轮次实现。
        </p>
        <br />
        <p className="placeholder-text">
          在这里你将可以：
        </p>
        <ul className="placeholder-text" style={{ paddingLeft: 16, marginTop: 8 }}>
          <li>创建和管理会议室</li>
          <li>配置主理人和专家</li>
          <li>查看历史会议记录</li>
        </ul>
      </div>
    </div>
  )
}

export default LeftPanel
