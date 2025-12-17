import fs from 'fs'
import path from 'path'
import os from 'os'

// 主题目录路径
const THEMES_DIR = path.join(os.homedir(), '.please', 'themes')

// 主题类型定义（改为 string 支持动态主题）
export type ThemeName = string

// 内置主题名称
export type BuiltinThemeName = 'dark' | 'light' | 'nord' | 'dracula' | 'retro' | 'contrast' | 'monokai'

// 主题颜色配置
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

// 主题元数据
export interface ThemeMetadata {
  name: ThemeName                    // 内部标识符
  displayName: string                // 显示名称（如 "深色"）
  description: string                // 描述（如 "默认深色主题，适合深色终端背景"）
  category: 'dark' | 'light'         // 类别（用于分组）
  previewColor: string               // 预览颜色（在列表中显示）
  author?: string                    // 作者（内置主题为 'built-in'，自定义主题显示用户名）
}

// 完整的主题定义（颜色 + 元数据）
export interface ThemeDefinition {
  metadata: ThemeMetadata
  colors: Theme
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

// Nord 主题 - 冷色调护眼，适合长时间使用
const nordTheme: Theme = {
  primary: '#88C0D0',      // Nord8 - 冰蓝色
  secondary: '#B48EAD',    // Nord15 - 紫色
  accent: '#EBCB8B',       // Nord13 - 黄色
  success: '#A3BE8C',      // Nord14 - 绿色
  error: '#BF616A',        // Nord11 - 红色
  warning: '#D08770',      // Nord12 - 橙色
  info: '#81A1C1',         // Nord9 - 蓝色
  text: {
    primary: '#ECEFF4',    // Nord6 - 雪白色
    secondary: '#D8DEE9',  // Nord4 - 浅灰色
    muted: '#A3BE8C',      // Nord14 - 柔和绿
    dim: '#5E81AC',        // Nord10 - 暗蓝色
  },
  border: '#4C566A',       // Nord3
  divider: '#3B4252',      // Nord1
  code: {
    background: '#2E3440', // Nord0 - 深灰背景
    text: '#ECEFF4',       // Nord6
    keyword: '#81A1C1',    // Nord9 - 蓝色
    string: '#A3BE8C',     // Nord14 - 绿色
    function: '#88C0D0',   // Nord8 - 青色
    comment: '#616E88',    // Nord3 变体
  },
}

// Dracula 主题 - 暗色系流行配色
const draculaTheme: Theme = {
  primary: '#8BE9FD',      // 青色
  secondary: '#BD93F9',    // 紫色
  accent: '#FF79C6',       // 粉色
  success: '#50FA7B',      // 绿色
  error: '#FF5555',        // 红色
  warning: '#FFB86C',      // 橙色
  info: '#8BE9FD',         // 青色
  text: {
    primary: '#F8F8F2',    // 几乎白色
    secondary: '#BFBFBF',  // 灰色
    muted: '#6272A4',      // 暗灰蓝
    dim: '#44475A',        // 深灰
  },
  border: '#6272A4',       // 评论色
  divider: '#44475A',      // 深灰
  code: {
    background: '#282A36', // 背景色
    text: '#F8F8F2',       // 前景色
    keyword: '#FF79C6',    // 粉色关键字
    string: '#F1FA8C',     // 黄色字符串
    function: '#50FA7B',   // 绿色函数
    comment: '#6272A4',    // 评论色
  },
}

// Retro Green 主题 - 经典终端荧光绿
const retroTheme: Theme = {
  primary: '#00FF00',      // 荧光绿
  secondary: '#00CC00',    // 暗绿
  accent: '#00FFAA',       // 青绿色
  success: '#00FF00',      // 荧光绿
  error: '#FF0000',        // 纯红
  warning: '#FFFF00',      // 纯黄
  info: '#00FFFF',         // 青色
  text: {
    primary: '#00FF00',    // 荧光绿
    secondary: '#00DD00',  // 稍暗绿
    muted: '#00AA00',      // 中绿
    dim: '#008800',        // 暗绿
  },
  border: '#00AA00',       // 中绿边框
  divider: '#006600',      // 暗绿分割线
  code: {
    background: '#000000', // 纯黑背景
    text: '#00FF00',       // 荧光绿
    keyword: '#00FFFF',    // 青色关键字
    string: '#00FF00',     // 绿色字符串
    function: '#00FFAA',   // 青绿函数
    comment: '#008800',    // 暗绿注释
  },
}

// High Contrast 主题 - 极高对比度，辅助功能
const contrastTheme: Theme = {
  primary: '#FFFFFF',      // 纯白
  secondary: '#AAAAAA',    // 灰色
  accent: '#00FFFF',       // 青色
  success: '#00FF00',      // 纯绿
  error: '#FF0000',        // 纯红
  warning: '#FFFF00',      // 纯黄
  info: '#00FFFF',         // 青色
  text: {
    primary: '#FFFFFF',    // 纯白
    secondary: '#CCCCCC',  // 浅灰
    muted: '#999999',      // 中灰
    dim: '#666666',        // 暗灰
  },
  border: '#FFFFFF',       // 白色边框
  divider: '#888888',      // 灰色分割线
  code: {
    background: '#000000', // 纯黑背景
    text: '#FFFFFF',       // 纯白文字
    keyword: '#00FFFF',    // 青色关键字
    string: '#00FF00',     // 绿色字符串
    function: '#FFFF00',   // 黄色函数
    comment: '#888888',    // 灰色注释
  },
}

// Monokai 主题 - 经典编辑器配色
const monokaiTheme: Theme = {
  primary: '#66D9EF',      // 青色
  secondary: '#AE81FF',    // 紫色
  accent: '#F92672',       // 粉红
  success: '#A6E22E',      // 绿色
  error: '#F92672',        // 粉红
  warning: '#E6DB74',      // 黄色
  info: '#66D9EF',         // 青色
  text: {
    primary: '#F8F8F2',    // 几乎白色
    secondary: '#CFCFC2',  // 浅灰
    muted: '#75715E',      // 暗灰
    dim: '#49483E',        // 深灰
  },
  border: '#75715E',       // 注释色
  divider: '#49483E',      // 深灰
  code: {
    background: '#272822', // 深灰背景
    text: '#F8F8F2',       // 前景色
    keyword: '#F92672',    // 粉红关键字
    string: '#E6DB74',     // 黄色字符串
    function: '#A6E22E',   // 绿色函数
    comment: '#75715E',    // 注释色
  },
}

// 所有主题定义（颜色 + 元数据）
export const themeDefinitions: Record<ThemeName, ThemeDefinition> = {
  dark: {
    metadata: {
      name: 'dark',
      displayName: '深色',
      description: '默认深色主题，明亮的颜色适合深色终端背景',
      category: 'dark',
      previewColor: '#00D9FF',
      author: 'built-in',
    },
    colors: darkTheme,
  },
  light: {
    metadata: {
      name: 'light',
      displayName: '浅色',
      description: '浅色主题，较深的颜色适合浅色终端背景',
      category: 'light',
      previewColor: '#0369A1',
      author: 'built-in',
    },
    colors: lightTheme,
  },
  nord: {
    metadata: {
      name: 'nord',
      displayName: '北欧冷色',
      description: '冷色调护眼主题，适合长时间使用',
      category: 'dark',
      previewColor: '#88C0D0',
      author: 'built-in',
    },
    colors: nordTheme,
  },
  dracula: {
    metadata: {
      name: 'dracula',
      displayName: '德古拉暗色',
      description: '高对比暗色主题，色彩丰富但不刺眼',
      category: 'dark',
      previewColor: '#BD93F9',
      author: 'built-in',
    },
    colors: draculaTheme,
  },
  retro: {
    metadata: {
      name: 'retro',
      displayName: '复古终端绿',
      description: '经典终端荧光绿，致敬老派 hacker 风格',
      category: 'dark',
      previewColor: '#00FF00',
      author: 'built-in',
    },
    colors: retroTheme,
  },
  contrast: {
    metadata: {
      name: 'contrast',
      displayName: '高对比度',
      description: '极高对比度，适合视力辅助和强光环境',
      category: 'dark',
      previewColor: '#FFFFFF',
      author: 'built-in',
    },
    colors: contrastTheme,
  },
  monokai: {
    metadata: {
      name: 'monokai',
      displayName: '经典编辑器',
      description: 'Monokai 经典配色，开发者熟悉的选择',
      category: 'dark',
      previewColor: '#66D9EF',
      author: 'built-in',
    },
    colors: monokaiTheme,
  },
}

// 向后兼容：导出纯颜色主题对象
export const themes: Record<ThemeName, Theme> = Object.fromEntries(
  Object.entries(themeDefinitions).map(([name, def]) => [name, def.colors])
) as Record<ThemeName, Theme>

// 获取当前主题（按需加载策略）
export function getCurrentTheme(): Theme {
  // 直接读取配置文件，避免循环依赖
  try {
    const configPath = path.join(os.homedir(), '.please', 'config.json')
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8')
      const config = JSON.parse(content)
      const themeName = config.theme || 'dark'

      // 1. 先检查是否为内置主题
      if (themeName in themeDefinitions) {
        return themeDefinitions[themeName].colors
      }

      // 2. 如果不是内置主题，加载自定义主题
      const customTheme = loadCustomTheme(themeName)
      if (customTheme) {
        return customTheme.colors
      }

      // 3. 加载失败，回退到默认主题
      console.warn(`⚠ 主题 "${themeName}" 不存在，已回退到 dark 主题`)
    }
  } catch {
    // 忽略错误，返回默认主题
  }
  return themeDefinitions.dark.colors
}

// 获取单个主题的元数据（支持自定义主题）
export function getThemeMetadata(name: ThemeName): ThemeMetadata | undefined {
  // 先检查内置主题
  if (name in themeDefinitions) {
    return themeDefinitions[name].metadata
  }

  // 加载自定义主题
  const customTheme = loadCustomTheme(name)
  return customTheme?.metadata || undefined
}

// 获取所有主题的元数据列表（扫描所有主题）
export function getAllThemeMetadata(): ThemeMetadata[] {
  const customThemes = loadAllCustomThemes()
  const allThemes = { ...themeDefinitions, ...customThemes }
  return Object.values(allThemes).map((def) => def.metadata)
}

// 获取完整的主题定义（颜色 + 元数据）
export function getThemeDefinition(name: ThemeName): ThemeDefinition | undefined {
  // 先检查内置主题
  if (name in themeDefinitions) {
    return themeDefinitions[name]
  }

  // 加载自定义主题
  return loadCustomTheme(name) || undefined
}

// 检查主题是否存在（支持自定义主题）
export function isValidTheme(name: string): name is ThemeName {
  // 先检查内置主题
  if (name in themeDefinitions) {
    return true
  }

  // 检查自定义主题文件是否存在
  const themePath = path.join(THEMES_DIR, `${name}.json`)
  return fs.existsSync(themePath)
}

// 检查是否为内置主题
export function isBuiltinTheme(name: string): boolean {
  return name in themeDefinitions
}

// ========== 自定义主题加载逻辑 ==========

/**
 * 加载单个自定义主题（按需加载）
 */
function loadCustomTheme(name: string): ThemeDefinition | null {
  try {
    const themePath = path.join(THEMES_DIR, `${name}.json`)

    if (!fs.existsSync(themePath)) {
      return null
    }

    const content = fs.readFileSync(themePath, 'utf-8')
    const theme = JSON.parse(content)

    // 验证主题格式
    if (!validateTheme(theme)) {
      console.warn(`⚠ 主题 "${name}" 格式不正确，已跳过`)
      return null
    }

    return theme
  } catch (error: any) {
    console.warn(`⚠ 加载主题 "${name}" 失败: ${error.message}`)
    return null
  }
}

/**
 * 加载所有自定义主题（完整扫描）
 */
function loadAllCustomThemes(): Record<string, ThemeDefinition> {
  const themes: Record<string, ThemeDefinition> = {}

  try {
    // 确保主题目录存在
    if (!fs.existsSync(THEMES_DIR)) {
      return themes
    }

    // 扫描所有 .json 文件
    const files = fs.readdirSync(THEMES_DIR).filter((f) => f.endsWith('.json'))

    for (const file of files) {
      try {
        const themePath = path.join(THEMES_DIR, file)
        const content = fs.readFileSync(themePath, 'utf-8')
        const theme = JSON.parse(content)

        // 验证主题格式
        if (validateTheme(theme)) {
          themes[theme.metadata.name] = theme
        }
      } catch (error) {
        // 单个主题加载失败不影响其他主题
        continue
      }
    }
  } catch (error) {
    // 目录读取失败，返回空对象
  }

  return themes
}

/**
 * 验证主题格式是否正确
 */
export function validateTheme(theme: any): theme is ThemeDefinition {
  try {
    // 检查基本结构
    if (!theme || typeof theme !== 'object') {
      return false
    }

    // 检查 metadata 必填字段
    if (
      !theme.metadata ||
      typeof theme.metadata !== 'object' ||
      !theme.metadata.name ||
      !theme.metadata.displayName ||
      !theme.metadata.category
    ) {
      return false
    }

    // 检查 category 值
    if (theme.metadata.category !== 'dark' && theme.metadata.category !== 'light') {
      return false
    }

    // 检查 colors 必填字段
    if (
      !theme.colors ||
      typeof theme.colors !== 'object' ||
      !theme.colors.primary ||
      !theme.colors.success ||
      !theme.colors.error ||
      !theme.colors.text ||
      !theme.colors.text.primary
    ) {
      return false
    }

    // 验证颜色格式（十六进制）
    const hexRegex = /^#[0-9A-Fa-f]{6}$/
    const requiredColors = [
      theme.colors.primary,
      theme.colors.secondary,
      theme.colors.accent,
      theme.colors.success,
      theme.colors.error,
      theme.colors.warning,
      theme.colors.info,
      theme.colors.text.primary,
      theme.colors.border,
    ]

    for (const color of requiredColors) {
      if (!color || !hexRegex.test(color)) {
        return false
      }
    }

    return true
  } catch {
    return false
  }
}

/**
 * 获取主题验证的详细错误信息
 */
export function validateThemeWithDetails(theme: any): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // 检查基本结构
  if (!theme || typeof theme !== 'object') {
    errors.push('主题必须是一个 JSON 对象')
    return { valid: false, errors }
  }

  // 检查 metadata
  if (!theme.metadata || typeof theme.metadata !== 'object') {
    errors.push('缺少 metadata 字段')
  } else {
    if (!theme.metadata.name) errors.push('缺少 metadata.name')
    if (!theme.metadata.displayName) errors.push('缺少 metadata.displayName')
    if (!theme.metadata.category) {
      errors.push('缺少 metadata.category')
    } else if (theme.metadata.category !== 'dark' && theme.metadata.category !== 'light') {
      errors.push('metadata.category 必须是 "dark" 或 "light"')
    }
  }

  // 检查 colors
  if (!theme.colors || typeof theme.colors !== 'object') {
    errors.push('缺少 colors 字段')
  } else {
    const hexRegex = /^#[0-9A-Fa-f]{6}$/

    // 检查必填颜色字段
    const colorFields = [
      'primary',
      'secondary',
      'accent',
      'success',
      'error',
      'warning',
      'info',
      'border',
      'divider',
    ]

    for (const field of colorFields) {
      if (!theme.colors[field]) {
        errors.push(`缺少 colors.${field}`)
      } else if (!hexRegex.test(theme.colors[field])) {
        errors.push(`colors.${field} 格式错误（应为 #RRGGBB 格式）`)
      }
    }

    // 检查 text 字段
    if (!theme.colors.text || typeof theme.colors.text !== 'object') {
      errors.push('缺少 colors.text')
    } else {
      const textFields = ['primary', 'secondary', 'muted', 'dim']
      for (const field of textFields) {
        if (!theme.colors.text[field]) {
          errors.push(`缺少 colors.text.${field}`)
        } else if (!hexRegex.test(theme.colors.text[field])) {
          errors.push(`colors.text.${field} 格式错误（应为 #RRGGBB 格式）`)
        }
      }
    }

    // 检查 code 字段
    if (!theme.colors.code || typeof theme.colors.code !== 'object') {
      errors.push('缺少 colors.code')
    } else {
      const codeFields = ['background', 'text', 'keyword', 'string', 'function', 'comment']
      for (const field of codeFields) {
        if (!theme.colors.code[field]) {
          errors.push(`缺少 colors.code.${field}`)
        } else if (!hexRegex.test(theme.colors.code[field])) {
          errors.push(`colors.code.${field} 格式错误（应为 #RRGGBB 格式）`)
        }
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * 创建主题模板
 */
export function createThemeTemplate(name: string, displayName: string, category: 'dark' | 'light'): ThemeDefinition {
  // 根据类别选择基础配色
  const baseTheme = category === 'dark' ? darkTheme : lightTheme

  return {
    metadata: {
      name,
      displayName,
      description: '自定义主题',
      category,
      previewColor: baseTheme.primary,
      author: os.userInfo().username || 'user',
    },
    colors: baseTheme,
  }
}

// 向后兼容：导出默认主题
export const theme = darkTheme
