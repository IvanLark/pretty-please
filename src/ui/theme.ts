// 主题配置 - 优雅的配色方案
export const theme = {
  // 主色调
  primary: '#00D9FF',      // 青色 - 主要交互元素
  secondary: '#A78BFA',    // 紫色 - 次要元素
  accent: '#F472B6',       // 粉色 - 强调元素

  // 状态色
  success: '#10B981',      // 绿色 - 成功
  error: '#EF4444',        // 红色 - 错误
  warning: '#F59E0B',      // 橙色 - 警告
  info: '#3B82F6',         // 蓝色 - 信息

  // 文本色
  text: {
    primary: '#E5E7EB',    // 主文本
    secondary: '#9CA3AF',  // 次要文本
    muted: '#6B7280',      // 弱化文本
    dim: '#4B5563',        // 暗淡文本
  },

  // 边框和分隔
  border: '#374151',       // 边框色
  divider: '#1F2937',      // 分隔线

  // 代码相关
  code: {
    background: '#1F2937',
    text: '#E5E7EB',
    keyword: '#C678DD',
    string: '#98C379',
    function: '#61AFEF',
    comment: '#5C6370',
  }
} as const

export type Theme = typeof theme
