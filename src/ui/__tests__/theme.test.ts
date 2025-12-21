/**
 * 主题系统测试
 * 测试主题读取、验证、自定义主题加载等功能
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock fs 模块
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
}))

// Mock os 模块
vi.mock('os', () => ({
  default: {
    homedir: vi.fn(() => '/home/testuser'),
    userInfo: vi.fn(() => ({ username: 'testuser' })),
  },
}))

import fs from 'fs'
import os from 'os'

const mockFs = vi.mocked(fs)
const mockOs = vi.mocked(os)

// 模块重置辅助函数
async function resetThemeModule() {
  vi.resetModules()
  return await import('../theme.js')
}

// 有效的主题定义
const validThemeDefinition = {
  metadata: {
    name: 'custom-theme',
    displayName: '自定义主题',
    description: '测试用自定义主题',
    category: 'dark' as const,
    previewColor: '#FF0000',
    author: 'testuser',
  },
  colors: {
    primary: '#FF0000',
    secondary: '#00FF00',
    accent: '#0000FF',
    success: '#00FF00',
    error: '#FF0000',
    warning: '#FFFF00',
    info: '#00FFFF',
    text: {
      primary: '#FFFFFF',
      secondary: '#CCCCCC',
      muted: '#999999',
      dim: '#666666',
    },
    border: '#333333',
    divider: '#222222',
    code: {
      background: '#111111',
      text: '#FFFFFF',
      keyword: '#FF00FF',
      string: '#00FF00',
      function: '#00FFFF',
      comment: '#666666',
    },
  },
}

// 有效的配置
const validConfig = {
  theme: 'dark',
  apiKey: 'test-key',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockOs.homedir.mockReturnValue('/home/testuser')
  mockOs.userInfo.mockReturnValue({ username: 'testuser' } as any)
  mockFs.existsSync.mockReturnValue(false)
  mockFs.readFileSync.mockReturnValue('{}')
  mockFs.readdirSync.mockReturnValue([])
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ============================================================================
// themeDefinitions 和 themes 测试
// ============================================================================

describe('themeDefinitions', () => {
  it('应该包含所有内置主题', async () => {
    const { themeDefinitions } = await resetThemeModule()

    expect(themeDefinitions).toHaveProperty('dark')
    expect(themeDefinitions).toHaveProperty('light')
    expect(themeDefinitions).toHaveProperty('nord')
    expect(themeDefinitions).toHaveProperty('dracula')
    expect(themeDefinitions).toHaveProperty('retro')
    expect(themeDefinitions).toHaveProperty('contrast')
    expect(themeDefinitions).toHaveProperty('monokai')
  })

  it('每个内置主题应该有完整的 metadata', async () => {
    const { themeDefinitions } = await resetThemeModule()

    for (const [name, def] of Object.entries(themeDefinitions)) {
      expect(def.metadata.name).toBe(name)
      expect(def.metadata.displayName).toBeTruthy()
      expect(def.metadata.description).toBeTruthy()
      expect(['dark', 'light']).toContain(def.metadata.category)
      expect(def.metadata.previewColor).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(def.metadata.author).toBe('built-in')
    }
  })

  it('每个内置主题应该有完整的 colors', async () => {
    const { themeDefinitions } = await resetThemeModule()

    for (const def of Object.values(themeDefinitions)) {
      expect(def.colors.primary).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(def.colors.secondary).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(def.colors.accent).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(def.colors.success).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(def.colors.error).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(def.colors.warning).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(def.colors.info).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(def.colors.text.primary).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(def.colors.text.secondary).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(def.colors.text.muted).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(def.colors.text.dim).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(def.colors.border).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(def.colors.divider).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(def.colors.code.background).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(def.colors.code.text).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(def.colors.code.keyword).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(def.colors.code.string).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(def.colors.code.function).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(def.colors.code.comment).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })
})

describe('themes', () => {
  it('应该是 themeDefinitions 的颜色映射', async () => {
    const { themes, themeDefinitions } = await resetThemeModule()

    expect(Object.keys(themes)).toEqual(Object.keys(themeDefinitions))

    for (const [name, colors] of Object.entries(themes)) {
      expect(colors).toEqual(themeDefinitions[name].colors)
    }
  })
})

// ============================================================================
// getCurrentTheme 测试
// ============================================================================

describe('getCurrentTheme', () => {
  it('配置文件不存在时应该返回 dark 主题', async () => {
    mockFs.existsSync.mockReturnValue(false)

    const { getCurrentTheme, themeDefinitions } = await resetThemeModule()
    const theme = getCurrentTheme()

    expect(theme).toEqual(themeDefinitions.dark.colors)
  })

  it('配置为 dark 应该返回 dark 主题', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ theme: 'dark' }))

    const { getCurrentTheme, themeDefinitions } = await resetThemeModule()
    const theme = getCurrentTheme()

    expect(theme).toEqual(themeDefinitions.dark.colors)
  })

  it('配置为 light 应该返回 light 主题', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ theme: 'light' }))

    const { getCurrentTheme, themeDefinitions } = await resetThemeModule()
    const theme = getCurrentTheme()

    expect(theme).toEqual(themeDefinitions.light.colors)
  })

  it('配置为 nord 应该返回 nord 主题', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ theme: 'nord' }))

    const { getCurrentTheme, themeDefinitions } = await resetThemeModule()
    const theme = getCurrentTheme()

    expect(theme).toEqual(themeDefinitions.nord.colors)
  })

  it('配置为 dracula 应该返回 dracula 主题', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ theme: 'dracula' }))

    const { getCurrentTheme, themeDefinitions } = await resetThemeModule()
    const theme = getCurrentTheme()

    expect(theme).toEqual(themeDefinitions.dracula.colors)
  })

  it('配置 JSON 损坏应该返回 dark 主题', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('{invalid json')

    const { getCurrentTheme, themeDefinitions } = await resetThemeModule()
    const theme = getCurrentTheme()

    expect(theme).toEqual(themeDefinitions.dark.colors)
  })

  it('配置没有 theme 字段应该返回 dark 主题', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ apiKey: 'test' }))

    const { getCurrentTheme, themeDefinitions } = await resetThemeModule()
    const theme = getCurrentTheme()

    expect(theme).toEqual(themeDefinitions.dark.colors)
  })

  it('应该支持自定义主题', async () => {
    mockFs.existsSync.mockImplementation((path: any) => {
      if (path.includes('config.json')) return true
      if (path.includes('custom-theme.json')) return true
      return false
    })
    mockFs.readFileSync.mockImplementation((path: any) => {
      if (path.toString().includes('config.json')) {
        return JSON.stringify({ theme: 'custom-theme' })
      }
      if (path.toString().includes('custom-theme.json')) {
        return JSON.stringify(validThemeDefinition)
      }
      return '{}'
    })

    const { getCurrentTheme } = await resetThemeModule()
    const theme = getCurrentTheme()

    expect(theme.primary).toBe('#FF0000')
  })

  it('自定义主题不存在应该回退到 dark', async () => {
    // 模拟 console.warn
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    mockFs.existsSync.mockImplementation((path: any) => {
      if (path.includes('config.json')) return true
      return false
    })
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ theme: 'nonexistent-theme' }))

    const { getCurrentTheme, themeDefinitions } = await resetThemeModule()
    const theme = getCurrentTheme()

    expect(theme).toEqual(themeDefinitions.dark.colors)
    expect(warnSpy).toHaveBeenCalled()

    warnSpy.mockRestore()
  })
})

// ============================================================================
// getThemeMetadata 测试
// ============================================================================

describe('getThemeMetadata', () => {
  it('应该返回内置主题的元数据', async () => {
    const { getThemeMetadata } = await resetThemeModule()

    const darkMeta = getThemeMetadata('dark')
    expect(darkMeta?.name).toBe('dark')
    expect(darkMeta?.displayName).toBe('深色')
    expect(darkMeta?.category).toBe('dark')

    const lightMeta = getThemeMetadata('light')
    expect(lightMeta?.name).toBe('light')
    expect(lightMeta?.displayName).toBe('浅色')
    expect(lightMeta?.category).toBe('light')
  })

  it('不存在的主题应该返回 undefined', async () => {
    mockFs.existsSync.mockReturnValue(false)

    const { getThemeMetadata } = await resetThemeModule()
    const meta = getThemeMetadata('nonexistent')

    expect(meta).toBeUndefined()
  })

  it('应该支持自定义主题', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(validThemeDefinition))

    const { getThemeMetadata } = await resetThemeModule()
    const meta = getThemeMetadata('custom-theme')

    expect(meta?.name).toBe('custom-theme')
    expect(meta?.displayName).toBe('自定义主题')
    expect(meta?.author).toBe('testuser')
  })
})

// ============================================================================
// getAllThemeMetadata 测试
// ============================================================================

describe('getAllThemeMetadata', () => {
  it('应该返回所有内置主题的元数据', async () => {
    mockFs.existsSync.mockReturnValue(false)

    const { getAllThemeMetadata } = await resetThemeModule()
    const allMeta = getAllThemeMetadata()

    expect(allMeta.length).toBeGreaterThanOrEqual(7) // 7 个内置主题
    expect(allMeta.find((m) => m.name === 'dark')).toBeDefined()
    expect(allMeta.find((m) => m.name === 'light')).toBeDefined()
    expect(allMeta.find((m) => m.name === 'nord')).toBeDefined()
    expect(allMeta.find((m) => m.name === 'dracula')).toBeDefined()
  })

  it('应该包含自定义主题', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockReturnValue(['custom-theme.json'] as any)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(validThemeDefinition))

    const { getAllThemeMetadata } = await resetThemeModule()
    const allMeta = getAllThemeMetadata()

    expect(allMeta.find((m) => m.name === 'custom-theme')).toBeDefined()
  })

  it('主题目录不存在时应该只返回内置主题', async () => {
    mockFs.existsSync.mockReturnValue(false)
    mockFs.readdirSync.mockImplementation(() => {
      throw new Error('ENOENT')
    })

    const { getAllThemeMetadata } = await resetThemeModule()
    const allMeta = getAllThemeMetadata()

    expect(allMeta.length).toBe(7) // 只有内置主题
  })

  it('应该跳过无效的自定义主题文件', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readdirSync.mockReturnValue(['invalid.json', 'valid.json'] as any)
    mockFs.readFileSync.mockImplementation((path: any) => {
      if (path.toString().includes('invalid.json')) {
        return '{invalid json'
      }
      return JSON.stringify({
        ...validThemeDefinition,
        metadata: { ...validThemeDefinition.metadata, name: 'valid' },
      })
    })

    const { getAllThemeMetadata } = await resetThemeModule()
    const allMeta = getAllThemeMetadata()

    // 应该有 7 个内置 + 1 个有效自定义
    expect(allMeta.find((m) => m.name === 'valid')).toBeDefined()
  })
})

// ============================================================================
// getThemeDefinition 测试
// ============================================================================

describe('getThemeDefinition', () => {
  it('应该返回内置主题的完整定义', async () => {
    const { getThemeDefinition } = await resetThemeModule()

    const darkDef = getThemeDefinition('dark')
    expect(darkDef?.metadata.name).toBe('dark')
    expect(darkDef?.colors.primary).toBeDefined()
  })

  it('不存在的主题应该返回 undefined', async () => {
    mockFs.existsSync.mockReturnValue(false)

    const { getThemeDefinition } = await resetThemeModule()
    const def = getThemeDefinition('nonexistent')

    expect(def).toBeUndefined()
  })

  it('应该返回自定义主题的完整定义', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(validThemeDefinition))

    const { getThemeDefinition } = await resetThemeModule()
    const def = getThemeDefinition('custom-theme')

    expect(def?.metadata.name).toBe('custom-theme')
    expect(def?.colors.primary).toBe('#FF0000')
  })
})

// ============================================================================
// isValidTheme 测试
// ============================================================================

describe('isValidTheme', () => {
  it('内置主题应该返回 true', async () => {
    const { isValidTheme } = await resetThemeModule()

    expect(isValidTheme('dark')).toBe(true)
    expect(isValidTheme('light')).toBe(true)
    expect(isValidTheme('nord')).toBe(true)
    expect(isValidTheme('dracula')).toBe(true)
    expect(isValidTheme('retro')).toBe(true)
    expect(isValidTheme('contrast')).toBe(true)
    expect(isValidTheme('monokai')).toBe(true)
  })

  it('不存在的主题应该返回 false', async () => {
    mockFs.existsSync.mockReturnValue(false)

    const { isValidTheme } = await resetThemeModule()

    expect(isValidTheme('nonexistent')).toBe(false)
  })

  it('存在的自定义主题文件应该返回 true', async () => {
    mockFs.existsSync.mockImplementation((path: any) => {
      if (path.includes('custom-theme.json')) return true
      return false
    })

    const { isValidTheme } = await resetThemeModule()

    expect(isValidTheme('custom-theme')).toBe(true)
  })
})

// ============================================================================
// isBuiltinTheme 测试
// ============================================================================

describe('isBuiltinTheme', () => {
  it('内置主题应该返回 true', async () => {
    const { isBuiltinTheme } = await resetThemeModule()

    expect(isBuiltinTheme('dark')).toBe(true)
    expect(isBuiltinTheme('light')).toBe(true)
    expect(isBuiltinTheme('nord')).toBe(true)
    expect(isBuiltinTheme('dracula')).toBe(true)
    expect(isBuiltinTheme('retro')).toBe(true)
    expect(isBuiltinTheme('contrast')).toBe(true)
    expect(isBuiltinTheme('monokai')).toBe(true)
  })

  it('自定义主题应该返回 false', async () => {
    const { isBuiltinTheme } = await resetThemeModule()

    expect(isBuiltinTheme('custom-theme')).toBe(false)
    expect(isBuiltinTheme('my-theme')).toBe(false)
  })

  it('不存在的主题应该返回 false', async () => {
    const { isBuiltinTheme } = await resetThemeModule()

    expect(isBuiltinTheme('nonexistent')).toBe(false)
  })
})

// ============================================================================
// validateTheme 测试
// ============================================================================

describe('validateTheme', () => {
  it('有效的主题定义应该返回 true', async () => {
    const { validateTheme } = await resetThemeModule()

    expect(validateTheme(validThemeDefinition)).toBe(true)
  })

  it('null 应该返回 false', async () => {
    const { validateTheme } = await resetThemeModule()

    expect(validateTheme(null)).toBe(false)
  })

  it('undefined 应该返回 false', async () => {
    const { validateTheme } = await resetThemeModule()

    expect(validateTheme(undefined)).toBe(false)
  })

  it('非对象应该返回 false', async () => {
    const { validateTheme } = await resetThemeModule()

    expect(validateTheme('string')).toBe(false)
    expect(validateTheme(123)).toBe(false)
    expect(validateTheme([])).toBe(false)
  })

  it('缺少 metadata 应该返回 false', async () => {
    const { validateTheme } = await resetThemeModule()

    expect(validateTheme({ colors: validThemeDefinition.colors })).toBe(false)
  })

  it('缺少 metadata.name 应该返回 false', async () => {
    const { validateTheme } = await resetThemeModule()

    const invalid = {
      metadata: { displayName: 'Test', category: 'dark' },
      colors: validThemeDefinition.colors,
    }
    expect(validateTheme(invalid)).toBe(false)
  })

  it('缺少 metadata.displayName 应该返回 false', async () => {
    const { validateTheme } = await resetThemeModule()

    const invalid = {
      metadata: { name: 'test', category: 'dark' },
      colors: validThemeDefinition.colors,
    }
    expect(validateTheme(invalid)).toBe(false)
  })

  it('缺少 metadata.category 应该返回 false', async () => {
    const { validateTheme } = await resetThemeModule()

    const invalid = {
      metadata: { name: 'test', displayName: 'Test' },
      colors: validThemeDefinition.colors,
    }
    expect(validateTheme(invalid)).toBe(false)
  })

  it('无效的 metadata.category 应该返回 false', async () => {
    const { validateTheme } = await resetThemeModule()

    const invalid = {
      metadata: { name: 'test', displayName: 'Test', category: 'invalid' },
      colors: validThemeDefinition.colors,
    }
    expect(validateTheme(invalid)).toBe(false)
  })

  it('缺少 colors 应该返回 false', async () => {
    const { validateTheme } = await resetThemeModule()

    expect(validateTheme({ metadata: validThemeDefinition.metadata })).toBe(false)
  })

  it('缺少 colors.primary 应该返回 false', async () => {
    const { validateTheme } = await resetThemeModule()

    const invalid = {
      metadata: validThemeDefinition.metadata,
      colors: { ...validThemeDefinition.colors, primary: undefined },
    }
    expect(validateTheme(invalid)).toBe(false)
  })

  it('缺少 colors.text.primary 应该返回 false', async () => {
    const { validateTheme } = await resetThemeModule()

    const invalid = {
      metadata: validThemeDefinition.metadata,
      colors: {
        ...validThemeDefinition.colors,
        text: { ...validThemeDefinition.colors.text, primary: undefined },
      },
    }
    expect(validateTheme(invalid)).toBe(false)
  })

  it('无效的颜色格式应该返回 false', async () => {
    const { validateTheme } = await resetThemeModule()

    const invalid = {
      metadata: validThemeDefinition.metadata,
      colors: { ...validThemeDefinition.colors, primary: 'red' }, // 不是 hex 格式
    }
    expect(validateTheme(invalid)).toBe(false)
  })

  it('3 位 hex 格式应该返回 false', async () => {
    const { validateTheme } = await resetThemeModule()

    const invalid = {
      metadata: validThemeDefinition.metadata,
      colors: { ...validThemeDefinition.colors, primary: '#F00' },
    }
    expect(validateTheme(invalid)).toBe(false)
  })

  it('8 位 hex 格式（含 alpha）应该返回 false', async () => {
    const { validateTheme } = await resetThemeModule()

    const invalid = {
      metadata: validThemeDefinition.metadata,
      colors: { ...validThemeDefinition.colors, primary: '#FF0000FF' },
    }
    expect(validateTheme(invalid)).toBe(false)
  })
})

// ============================================================================
// validateThemeWithDetails 测试
// ============================================================================

describe('validateThemeWithDetails', () => {
  it('有效的主题应该返回 valid: true 和空 errors', async () => {
    const { validateThemeWithDetails } = await resetThemeModule()

    const result = validateThemeWithDetails(validThemeDefinition)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('null 应该返回详细错误', async () => {
    const { validateThemeWithDetails } = await resetThemeModule()

    const result = validateThemeWithDetails(null)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('主题必须是一个 JSON 对象')
  })

  it('缺少 metadata 应该报告错误', async () => {
    const { validateThemeWithDetails } = await resetThemeModule()

    const result = validateThemeWithDetails({ colors: validThemeDefinition.colors })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('缺少 metadata 字段')
  })

  it('缺少 metadata.name 应该报告错误', async () => {
    const { validateThemeWithDetails } = await resetThemeModule()

    const invalid = {
      metadata: { displayName: 'Test', category: 'dark' },
      colors: validThemeDefinition.colors,
    }
    const result = validateThemeWithDetails(invalid)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('缺少 metadata.name')
  })

  it('无效的 category 应该报告错误', async () => {
    const { validateThemeWithDetails } = await resetThemeModule()

    const invalid = {
      metadata: { name: 'test', displayName: 'Test', category: 'invalid' },
      colors: validThemeDefinition.colors,
    }
    const result = validateThemeWithDetails(invalid)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('metadata.category 必须是 "dark" 或 "light"')
  })

  it('缺少 colors 应该报告错误', async () => {
    const { validateThemeWithDetails } = await resetThemeModule()

    const result = validateThemeWithDetails({ metadata: validThemeDefinition.metadata })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('缺少 colors 字段')
  })

  it('缺少多个颜色字段应该报告所有错误', async () => {
    const { validateThemeWithDetails } = await resetThemeModule()

    const invalid = {
      metadata: validThemeDefinition.metadata,
      colors: {
        primary: '#FF0000',
        // 缺少其他必填字段
      },
    }
    const result = validateThemeWithDetails(invalid)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(5)
    expect(result.errors).toContain('缺少 colors.secondary')
    expect(result.errors).toContain('缺少 colors.success')
  })

  it('无效的颜色格式应该报告详细错误', async () => {
    const { validateThemeWithDetails } = await resetThemeModule()

    const invalid = {
      metadata: validThemeDefinition.metadata,
      colors: {
        ...validThemeDefinition.colors,
        primary: 'red',
        secondary: '#GGG',
      },
    }
    const result = validateThemeWithDetails(invalid)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('colors.primary 格式错误（应为 #RRGGBB 格式）')
    expect(result.errors).toContain('colors.secondary 格式错误（应为 #RRGGBB 格式）')
  })

  it('缺少 colors.text 应该报告错误', async () => {
    const { validateThemeWithDetails } = await resetThemeModule()

    const invalid = {
      metadata: validThemeDefinition.metadata,
      colors: {
        ...validThemeDefinition.colors,
        text: undefined,
      },
    }
    const result = validateThemeWithDetails(invalid)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('缺少 colors.text')
  })

  it('缺少 colors.code 应该报告错误', async () => {
    const { validateThemeWithDetails } = await resetThemeModule()

    const invalid = {
      metadata: validThemeDefinition.metadata,
      colors: {
        ...validThemeDefinition.colors,
        code: undefined,
      },
    }
    const result = validateThemeWithDetails(invalid)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('缺少 colors.code')
  })
})

// ============================================================================
// createThemeTemplate 测试
// ============================================================================

describe('createThemeTemplate', () => {
  it('应该创建深色主题模板', async () => {
    const { createThemeTemplate, themeDefinitions } = await resetThemeModule()

    const template = createThemeTemplate('my-theme', '我的主题', 'dark')

    expect(template.metadata.name).toBe('my-theme')
    expect(template.metadata.displayName).toBe('我的主题')
    expect(template.metadata.category).toBe('dark')
    expect(template.metadata.description).toBe('自定义主题')
    expect(template.metadata.author).toBe('testuser')
    expect(template.colors).toEqual(themeDefinitions.dark.colors)
  })

  it('应该创建浅色主题模板', async () => {
    const { createThemeTemplate, themeDefinitions } = await resetThemeModule()

    const template = createThemeTemplate('light-theme', '浅色主题', 'light')

    expect(template.metadata.name).toBe('light-theme')
    expect(template.metadata.displayName).toBe('浅色主题')
    expect(template.metadata.category).toBe('light')
    expect(template.colors).toEqual(themeDefinitions.light.colors)
  })

  it('previewColor 应该与基础主题的 primary 颜色相同', async () => {
    const { createThemeTemplate, themeDefinitions } = await resetThemeModule()

    const darkTemplate = createThemeTemplate('test-dark', 'Test', 'dark')
    expect(darkTemplate.metadata.previewColor).toBe(themeDefinitions.dark.colors.primary)

    const lightTemplate = createThemeTemplate('test-light', 'Test', 'light')
    expect(lightTemplate.metadata.previewColor).toBe(themeDefinitions.light.colors.primary)
  })

  it('author 应该使用当前用户名', async () => {
    mockOs.userInfo.mockReturnValue({ username: 'customuser' } as any)

    const { createThemeTemplate } = await resetThemeModule()
    const template = createThemeTemplate('test', 'Test', 'dark')

    expect(template.metadata.author).toBe('customuser')
  })

  it('userInfo 返回空用户名时应该使用 user', async () => {
    mockOs.userInfo.mockReturnValue({ username: '' } as any)

    const { createThemeTemplate } = await resetThemeModule()
    const template = createThemeTemplate('test', 'Test', 'dark')

    expect(template.metadata.author).toBe('user')
  })
})

// ============================================================================
// 自定义主题加载测试
// ============================================================================

describe('自定义主题加载', () => {
  it('自定义主题 JSON 损坏应该跳过并警告', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('{invalid json')

    const { getThemeMetadata } = await resetThemeModule()
    const meta = getThemeMetadata('broken-theme')

    expect(meta).toBeUndefined()
    expect(warnSpy).toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it('自定义主题格式不正确应该跳过并警告', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ invalid: 'structure' }))

    const { getThemeMetadata } = await resetThemeModule()
    const meta = getThemeMetadata('invalid-theme')

    expect(meta).toBeUndefined()
    expect(warnSpy).toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it('读取主题文件失败应该返回 null', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockImplementation(() => {
      throw new Error('EACCES: permission denied')
    })

    const { getThemeDefinition } = await resetThemeModule()
    const def = getThemeDefinition('permission-denied-theme')

    expect(def).toBeUndefined()
    expect(warnSpy).toHaveBeenCalled()

    warnSpy.mockRestore()
  })
})

// ============================================================================
// theme 导出测试
// ============================================================================

describe('theme 导出', () => {
  it('应该导出 darkTheme 作为默认 theme', async () => {
    const { theme, themeDefinitions } = await resetThemeModule()

    expect(theme).toEqual(themeDefinitions.dark.colors)
  })
})
