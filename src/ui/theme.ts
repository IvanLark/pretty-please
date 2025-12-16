import fs from 'fs'
import path from 'path'
import os from 'os'

// 主题类型定义
export type ThemeName = 'dark' | 'light'

export interface Theme {
  primary: string
  secondary: string
  accent: string
  success: string
  error: string
  warning: string
  info: string
  text: {
    primary: string
    secondary: string
    muted: string
    dim: string
  }
  border: string
  divider: string
  code: {
    background: string
    text: string
    keyword: string
    string: string
    function: string
    comment: string
  }
}

// 深色主题（原默认主题）
const darkTheme: Theme = {
  primary: '#00D9FF',
  secondary: '#A78BFA',
  accent: '#F472B6',
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
  text: {
    primary: '#E5E7EB',
    secondary: '#9CA3AF',
    muted: '#6B7280',
    dim: '#4B5563',
  },
  border: '#374151',
  divider: '#1F2937',
  code: {
    background: '#1F2937',
    text: '#E5E7EB',
    keyword: '#C678DD',
    string: '#98C379',
    function: '#61AFEF',
    comment: '#5C6370',
  },
}

// 浅色主题（白色/浅色终端背景）
// 所有颜色都要在白色背景上清晰可见
const lightTheme: Theme = {
  primary: '#0369A1',      // 深天蓝，在白底上醒目
  secondary: '#6D28D9',    // 深紫色
  accent: '#BE185D',       // 深粉色
  success: '#047857',      // 深绿色
  error: '#B91C1C',        // 深红色
  warning: '#B45309',      // 深橙色
  info: '#1D4ED8',         // 深蓝色
  text: {
    primary: '#111827',    // 近黑色，主要文字
    secondary: '#374151',  // 深灰色
    muted: '#4B5563',      // 中灰色
    dim: '#6B7280',        // 浅灰色
  },
  border: '#6B7280',       // 边框要明显
  divider: '#9CA3AF',
  code: {
    background: '#F3F4F6',
    text: '#111827',
    keyword: '#6D28D9',
    string: '#047857',
    function: '#0369A1',
    comment: '#4B5563',
  },
}

// 所有主题
export const themes: Record<ThemeName, Theme> = {
  dark: darkTheme,
  light: lightTheme,
}

// 获取当前主题
export function getCurrentTheme(): Theme {
  // 直接读取配置文件，避免循环依赖
  try {
    const configPath = path.join(os.homedir(), '.please', 'config.json')
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8')
      const config = JSON.parse(content)
      if (config.theme && themes[config.theme as ThemeName]) {
        return themes[config.theme as ThemeName]
      }
    }
  } catch {
    // 忽略错误，返回默认主题
  }
  return themes.dark
}

// 向后兼容：导出默认主题
export const theme = darkTheme
