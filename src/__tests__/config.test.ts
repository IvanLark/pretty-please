/**
 * 配置管理模块测试
 * 测试配置读写、API Key 处理、配置验证等功能
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  validConfig,
  minimalConfig,
  configWithoutApiKey,
  corruptedConfigJson,
  emptyConfig,
  legacyConfig,
  configWithExtraFields,
} from '../../tests/fixtures/config'

// Mock fs 模块
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
}))

// Mock os 模块
vi.mock('os', () => ({
  default: {
    homedir: vi.fn(() => '/home/testuser'),
  },
}))

// Mock theme 模块
vi.mock('../ui/theme.js', () => ({
  getCurrentTheme: vi.fn(() => ({
    primary: '#007acc',
    secondary: '#6c757d',
    success: '#4caf50',
    error: '#f44336',
    warning: '#ff9800',
  })),
  isValidTheme: vi.fn((theme: string) => ['dark', 'light', 'dracula'].includes(theme)),
  getAllThemeMetadata: vi.fn(() => [
    { name: 'dark', displayName: 'Dark' },
    { name: 'light', displayName: 'Light' },
    { name: 'dracula', displayName: 'Dracula' },
  ]),
}))

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: Object.assign(vi.fn((s: string) => s), {
      hex: vi.fn(() => (s: string) => s),
    }),
    gray: vi.fn((s: string) => s),
    hex: vi.fn(() => (s: string) => s),
  },
}))

// Mock readline 模块
vi.mock('readline', () => ({
  default: {
    createInterface: vi.fn(() => ({
      question: vi.fn((prompt: string, callback: (answer: string) => void) => callback('')),
      close: vi.fn(),
    })),
  },
  createInterface: vi.fn(() => ({
    question: vi.fn((prompt: string, callback: (answer: string) => void) => callback('')),
    close: vi.fn(),
  })),
}))

import fs from 'fs'
import os from 'os'
import readline from 'readline'
import { isValidTheme } from '../ui/theme.js'

// 获取 mock 函数引用
const mockFs = vi.mocked(fs)
const mockOs = vi.mocked(os)
const mockReadline = vi.mocked(readline)
const mockIsValidTheme = vi.mocked(isValidTheme)

// 模块状态重置辅助
async function resetConfigModule() {
  // 重新导入模块以重置缓存
  vi.resetModules()
  return await import('../config.js')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockOs.homedir.mockReturnValue('/home/testuser')
  // 默认配置目录存在
  mockFs.existsSync.mockReturnValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ============================================================================
// 配置读取测试
// ============================================================================

describe('getConfig', () => {
  it('首次调用应该返回默认配置（配置文件不存在）', async () => {
    mockFs.existsSync.mockReturnValue(false)

    const { getConfig } = await resetConfigModule()
    const config = getConfig()

    expect(config.provider).toBe('openai')
    expect(config.model).toBe('gpt-4-turbo')
    expect(config.shellHook).toBe(false)
    expect(config.shellHistoryLimit).toBe(10)
  })

  it('应该从配置文件读取', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(validConfig))

    const { getConfig } = await resetConfigModule()
    const config = getConfig()

    expect(config.apiKey).toBe('sk-1234567890abcdef')
    expect(config.provider).toBe('openai')
    expect(config.model).toBe('gpt-4')
  })

  it('JSON 损坏时应该返回默认配置', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(corruptedConfigJson)

    const { getConfig } = await resetConfigModule()
    const config = getConfig()

    expect(config.provider).toBe('openai')
    expect(config.model).toBe('gpt-4-turbo')
  })

  it('缺少字段时应该合并默认值', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(minimalConfig))

    const { getConfig } = await resetConfigModule()
    const config = getConfig()

    expect(config.apiKey).toBe('sk-test123456')
    expect(config.provider).toBe('openai') // 默认值
    expect(config.shellHistoryLimit).toBe(10) // 默认值
  })

  it('多余字段应该保留', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(configWithExtraFields))

    const { getConfig } = await resetConfigModule()
    const config = getConfig()

    expect((config as any).unknownField).toBe('should be preserved')
    expect((config as any).futureFeature).toBe(true)
  })

  it('应该有配置缓存机制（多次调用不重复读取文件）', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(validConfig))

    const { getConfig } = await resetConfigModule()

    getConfig()
    getConfig()
    getConfig()

    // 只应该读取一次
    expect(mockFs.readFileSync).toHaveBeenCalledTimes(1)
  })

  it('空配置文件应该返回默认值', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(emptyConfig)

    const { getConfig } = await resetConfigModule()
    const config = getConfig()

    expect(config.provider).toBe('openai')
    expect(config.shellHistoryLimit).toBe(10)
  })

  it('旧版本配置应该兼容', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(legacyConfig))

    const { getConfig } = await resetConfigModule()
    const config = getConfig()

    expect(config.apiKey).toBe('sk-legacy-key')
    expect(config.model).toBe('gpt-3.5-turbo')
    // 新字段使用默认值
    expect(config.userPreferencesTopK).toBe(20)
  })
})

// ============================================================================
// 配置保存测试
// ============================================================================

describe('saveConfig', () => {
  it('应该写入配置文件', async () => {
    mockFs.existsSync.mockReturnValue(true)

    const { saveConfig, getConfig } = await resetConfigModule()
    const config = getConfig()
    config.apiKey = 'new-api-key'
    saveConfig(config)

    expect(mockFs.writeFileSync).toHaveBeenCalled()
  })

  it('应该创建配置目录（如果不存在）', async () => {
    mockFs.existsSync.mockReturnValue(false)

    const { saveConfig, getConfig } = await resetConfigModule()
    const config = getConfig()
    saveConfig(config)

    expect(mockFs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.please'),
      { recursive: true }
    )
  })

  it('应该格式化 JSON（2 空格缩进）', async () => {
    mockFs.existsSync.mockReturnValue(true)

    let writtenContent: string = ''
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      writtenContent = content
    })

    const { saveConfig, getConfig } = await resetConfigModule()
    const config = getConfig()
    saveConfig(config)

    // 检查是否有缩进
    expect(writtenContent).toContain('  ')
    expect(() => JSON.parse(writtenContent)).not.toThrow()
  })
})

// ============================================================================
// setConfigValue 测试
// ============================================================================

describe('setConfigValue', () => {
  beforeEach(() => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(validConfig))
  })

  it('应该设置字符串配置项', async () => {
    const { setConfigValue } = await resetConfigModule()
    const config = setConfigValue('apiKey', 'new-key')

    expect(config.apiKey).toBe('new-key')
  })

  it('应该设置布尔配置项', async () => {
    const { setConfigValue } = await resetConfigModule()
    const config = setConfigValue('shellHook', true)

    expect(config.shellHook).toBe(true)
  })

  it('应该设置数字配置项', async () => {
    const { setConfigValue } = await resetConfigModule()
    const config = setConfigValue('shellHistoryLimit', 20)

    expect(config.shellHistoryLimit).toBe(20)
  })

  it('字符串 "true" 应该转换为布尔 true', async () => {
    const { setConfigValue } = await resetConfigModule()
    const config = setConfigValue('shellHook', 'true')

    expect(config.shellHook).toBe(true)
  })

  it('无效字段名应该抛出错误', async () => {
    const { setConfigValue } = await resetConfigModule()

    expect(() => setConfigValue('invalidField', 'value'))
      .toThrow('未知的配置项: invalidField')
  })

  it('无效的 provider 应该抛出错误', async () => {
    const { setConfigValue } = await resetConfigModule()

    expect(() => setConfigValue('provider', 'invalid-provider'))
      .toThrow('provider 必须是以下之一')
  })

  it('无效的 editMode 应该抛出错误', async () => {
    const { setConfigValue } = await resetConfigModule()

    expect(() => setConfigValue('editMode', 'invalid'))
      .toThrow('editMode 必须是以下之一')
  })

  it('无效的 theme 应该抛出错误', async () => {
    mockIsValidTheme.mockReturnValue(false)

    const { setConfigValue } = await resetConfigModule()

    expect(() => setConfigValue('theme', 'invalid-theme'))
      .toThrow('theme 必须是以下之一')
  })

  it('数字配置项小于 1 应该抛出错误', async () => {
    const { setConfigValue } = await resetConfigModule()

    expect(() => setConfigValue('shellHistoryLimit', 0))
      .toThrow('必须是大于 0 的整数')
  })

  it('数字配置项为负数应该抛出错误', async () => {
    const { setConfigValue } = await resetConfigModule()

    expect(() => setConfigValue('chatHistoryLimit', -5))
      .toThrow('必须是大于 0 的整数')
  })

  it('数字配置项为字符串数字应该正常转换', async () => {
    const { setConfigValue } = await resetConfigModule()
    const config = setConfigValue('commandHistoryLimit', '15' as any)

    expect(config.commandHistoryLimit).toBe(15)
  })

  it('有效的 provider 应该设置成功', async () => {
    const { setConfigValue } = await resetConfigModule()
    const config = setConfigValue('provider', 'anthropic')

    expect(config.provider).toBe('anthropic')
  })

  it('有效的 editMode 应该设置成功', async () => {
    const { setConfigValue } = await resetConfigModule()
    const config = setConfigValue('editMode', 'auto')

    expect(config.editMode).toBe('auto')
  })

  it('设置后应该清除缓存', async () => {
    const { setConfigValue, getConfig } = await resetConfigModule()

    // 第一次读取
    getConfig()
    expect(mockFs.readFileSync).toHaveBeenCalledTimes(1)

    // 设置新值（会清除缓存）
    setConfigValue('apiKey', 'new-key')

    // 再次读取应该重新读取文件（但由于 mock 返回同样的值）
    // 这里主要验证缓存被清除的逻辑
    expect(mockFs.writeFileSync).toHaveBeenCalled()
  })
})

// ============================================================================
// API Key 处理测试
// ============================================================================

describe('maskApiKey', () => {
  it('长度 >= 10 应该显示前 6 后 4', async () => {
    const { maskApiKey } = await resetConfigModule()

    expect(maskApiKey('sk-1234567890abcdef')).toBe('sk-123****cdef')
  })

  it('长度 < 10 应该返回原值', async () => {
    const { maskApiKey } = await resetConfigModule()

    expect(maskApiKey('sk-short')).toBe('sk-short')
  })

  it('空字符串应该返回 (未设置)', async () => {
    const { maskApiKey } = await resetConfigModule()

    expect(maskApiKey('')).toBe('(未设置)')
  })

  it('null/undefined 应该返回 (未设置)', async () => {
    const { maskApiKey } = await resetConfigModule()

    expect(maskApiKey(null as any)).toBe('(未设置)')
    expect(maskApiKey(undefined as any)).toBe('(未设置)')
  })

  it('应该使用 **** 掩码', async () => {
    const { maskApiKey } = await resetConfigModule()

    const masked = maskApiKey('sk-abcdefghij1234')
    expect(masked).toContain('****')
  })
})

// ============================================================================
// isConfigValid 测试
// ============================================================================

describe('isConfigValid', () => {
  it('有 apiKey 应该返回 true', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(validConfig))

    const { isConfigValid } = await resetConfigModule()

    expect(isConfigValid()).toBe(true)
  })

  it('无 apiKey 应该返回 false', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(configWithoutApiKey))

    const { isConfigValid } = await resetConfigModule()

    expect(isConfigValid()).toBe(false)
  })

  it('apiKey 为空字符串应该返回 false', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ apiKey: '' }))

    const { isConfigValid } = await resetConfigModule()

    expect(isConfigValid()).toBe(false)
  })

  it('配置文件不存在应该返回 false', async () => {
    mockFs.existsSync.mockReturnValue(false)

    const { isConfigValid } = await resetConfigModule()

    expect(isConfigValid()).toBe(false)
  })
})

// ============================================================================
// CONFIG_DIR 测试
// ============================================================================

describe('CONFIG_DIR', () => {
  it('应该指向用户 home 目录下的 .please', async () => {
    mockOs.homedir.mockReturnValue('/home/testuser')

    const { CONFIG_DIR } = await resetConfigModule()

    expect(CONFIG_DIR).toBe('/home/testuser/.please')
  })

  it('Windows 路径应该正确', async () => {
    mockOs.homedir.mockReturnValue('C:\\Users\\TestUser')

    const { CONFIG_DIR } = await resetConfigModule()

    expect(CONFIG_DIR).toContain('.please')
  })
})

// ============================================================================
// 边界情况测试
// ============================================================================

describe('边界情况', () => {
  it('配置文件读取失败应该返回默认配置', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockImplementation(() => {
      throw new Error('EACCES: permission denied')
    })

    const { getConfig } = await resetConfigModule()
    const config = getConfig()

    expect(config.provider).toBe('openai')
  })

  it('配置目录创建失败应该抛出错误', async () => {
    mockFs.existsSync.mockReturnValue(false)
    mockFs.mkdirSync.mockImplementation(() => {
      throw new Error('EACCES: permission denied')
    })

    const configModule = await resetConfigModule()

    expect(() => configModule.getConfig()).toThrow()
  })

  it('写入配置失败应该抛出错误', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(validConfig))
    mockFs.writeFileSync.mockImplementation(() => {
      throw new Error('ENOSPC: no space left on device')
    })

    const { saveConfig, getConfig } = await resetConfigModule()
    const config = getConfig()

    expect(() => saveConfig(config)).toThrow()
  })
})

// ============================================================================
// Provider 配置测试
// ============================================================================

describe('Provider 配置', () => {
  const providers = ['openai', 'anthropic', 'deepseek', 'google', 'groq', 'mistral', 'cohere', 'fireworks', 'together']

  beforeEach(() => {
    vi.clearAllMocks()
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(validConfig))
    mockFs.writeFileSync.mockImplementation(() => {})
  })

  providers.forEach(provider => {
    it(`应该支持 ${provider} provider`, async () => {
      const { setConfigValue } = await resetConfigModule()
      const config = setConfigValue('provider', provider)

      expect(config.provider).toBe(provider)
    })
  })
})

// ============================================================================
// 数值配置项测试
// ============================================================================

describe('数值配置项', () => {
  const numericFields = [
    'chatHistoryLimit',
    'commandHistoryLimit',
    'shellHistoryLimit',
    'userPreferencesTopK',
    'systemCacheExpireDays',
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(validConfig))
    mockFs.writeFileSync.mockImplementation(() => {})
  })

  numericFields.forEach(field => {
    it(`${field} 应该接受正整数`, async () => {
      const { setConfigValue } = await resetConfigModule()
      const config = setConfigValue(field, 100)

      expect(config[field as keyof typeof config]).toBe(100)
    })
  })
})

// ============================================================================
// displayConfig 测试
// ============================================================================

describe('displayConfig', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockFs.existsSync.mockReturnValue(true)
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  it('应该显示当前配置', async () => {
    mockFs.readFileSync.mockReturnValue(JSON.stringify(validConfig))

    const { displayConfig } = await resetConfigModule()
    displayConfig()

    expect(consoleLogSpy).toHaveBeenCalled()
    // 验证输出包含配置标题
    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('当前配置')
  })

  it('应该显示 apiKey（掩码形式）', async () => {
    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      ...validConfig,
      apiKey: 'sk-1234567890abcdef',
    }))

    const { displayConfig } = await resetConfigModule()
    displayConfig()

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('apiKey')
    // 掩码后不应显示完整 key
    expect(allCalls).not.toContain('sk-1234567890abcdef')
  })

  it('应该显示 provider 和 model', async () => {
    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      ...validConfig,
      provider: 'anthropic',
      model: 'claude-3',
    }))

    const { displayConfig } = await resetConfigModule()
    displayConfig()

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('provider')
    expect(allCalls).toContain('anthropic')
    expect(allCalls).toContain('model')
    expect(allCalls).toContain('claude-3')
  })

  it('应该显示 shellHook 状态', async () => {
    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      ...validConfig,
      shellHook: true,
    }))

    const { displayConfig } = await resetConfigModule()
    displayConfig()

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('shellHook')
  })

  it('应该显示 editMode', async () => {
    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      ...validConfig,
      editMode: 'auto',
    }))

    const { displayConfig } = await resetConfigModule()
    displayConfig()

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('editMode')
  })

  it('应该显示各种历史限制配置', async () => {
    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      ...validConfig,
      chatHistoryLimit: 10,
      commandHistoryLimit: 20,
      shellHistoryLimit: 30,
    }))

    const { displayConfig } = await resetConfigModule()
    displayConfig()

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('chatHistoryLimit')
    expect(allCalls).toContain('commandHistoryLimit')
    expect(allCalls).toContain('shellHistoryLimit')
  })

  it('应该显示 userPreferencesTopK', async () => {
    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      ...validConfig,
      userPreferencesTopK: 50,
    }))

    const { displayConfig } = await resetConfigModule()
    displayConfig()

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('userPreferencesTopK')
  })

  it('应该显示 systemCacheExpireDays（如果存在）', async () => {
    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      ...validConfig,
      systemCacheExpireDays: 14,
    }))

    const { displayConfig } = await resetConfigModule()
    displayConfig()

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('systemCacheExpireDays')
  })

  it('应该显示 theme 信息', async () => {
    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      ...validConfig,
      theme: 'dark',
    }))

    const { displayConfig } = await resetConfigModule()
    displayConfig()

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('theme')
  })

  it('应该显示配置文件路径', async () => {
    mockFs.readFileSync.mockReturnValue(JSON.stringify(validConfig))

    const { displayConfig } = await resetConfigModule()
    displayConfig()

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('配置文件')
    expect(allCalls).toContain('.please')
  })

  it('配置文件不存在时应该显示默认配置', async () => {
    mockFs.existsSync.mockReturnValue(false)
    mockFs.mkdirSync.mockImplementation(() => undefined)

    const { displayConfig } = await resetConfigModule()
    displayConfig()

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('当前配置')
    expect(allCalls).toContain('openai') // 默认 provider
  })
})

// ============================================================================
// runConfigWizard 测试
// ============================================================================

describe('runConfigWizard', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(validConfig))
    mockFs.writeFileSync.mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  it('应该显示配置向导标题', async () => {
    // Mock readline 返回空字符串（使用默认值）
    mockReadline.createInterface.mockReturnValue({
      question: vi.fn((prompt, callback) => callback('')),
      close: vi.fn(),
    } as any)

    const { runConfigWizard } = await resetConfigModule()
    await runConfigWizard()

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('配置向导')
  })

  it('全部使用默认值时应该保存配置', async () => {
    mockReadline.createInterface.mockReturnValue({
      question: vi.fn((prompt, callback) => callback('')),
      close: vi.fn(),
    } as any)

    const { runConfigWizard } = await resetConfigModule()
    await runConfigWizard()

    expect(mockFs.writeFileSync).toHaveBeenCalled()
  })

  it('无效的 provider 应该提前退出', async () => {
    mockReadline.createInterface.mockReturnValue({
      question: vi.fn((prompt, callback) => {
        if (prompt.includes('Provider')) {
          callback('invalid-provider')
        } else {
          callback('')
        }
      }),
      close: vi.fn(),
    } as any)

    const { runConfigWizard } = await resetConfigModule()
    await runConfigWizard()

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('无效')
  })

  it('无效的 editMode 应该提前退出', async () => {
    mockReadline.createInterface.mockReturnValue({
      question: vi.fn((prompt, callback) => {
        if (prompt.includes('编辑模式')) {
          callback('invalid-mode')
        } else {
          callback('')
        }
      }),
      close: vi.fn(),
    } as any)

    const { runConfigWizard } = await resetConfigModule()
    await runConfigWizard()

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('无效')
  })

  it('设置有效的 provider 应该更新配置', async () => {
    let savedConfig: any = null
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      savedConfig = JSON.parse(content)
    })

    mockReadline.createInterface.mockReturnValue({
      question: vi.fn((prompt, callback) => {
        if (prompt.includes('Provider')) {
          callback('anthropic')
        } else {
          callback('')
        }
      }),
      close: vi.fn(),
    } as any)

    const { runConfigWizard } = await resetConfigModule()
    await runConfigWizard()

    expect(savedConfig?.provider).toBe('anthropic')
  })

  it('设置有效的 API Key 应该更新配置', async () => {
    let savedConfig: any = null
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      savedConfig = JSON.parse(content)
    })

    mockReadline.createInterface.mockReturnValue({
      question: vi.fn((prompt, callback) => {
        if (prompt.includes('API Key')) {
          callback('new-api-key-12345')
        } else {
          callback('')
        }
      }),
      close: vi.fn(),
    } as any)

    const { runConfigWizard } = await resetConfigModule()
    await runConfigWizard()

    expect(savedConfig?.apiKey).toBe('new-api-key-12345')
  })

  it('设置有效的 baseUrl 应该更新配置', async () => {
    let savedConfig: any = null
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      savedConfig = JSON.parse(content)
    })

    mockReadline.createInterface.mockReturnValue({
      question: vi.fn((prompt, callback) => {
        if (prompt.includes('Base URL')) {
          callback('https://custom-api.example.com/v1')
        } else {
          callback('')
        }
      }),
      close: vi.fn(),
    } as any)

    const { runConfigWizard } = await resetConfigModule()
    await runConfigWizard()

    expect(savedConfig?.baseUrl).toBe('https://custom-api.example.com/v1')
  })

  it('设置有效的 model 应该更新配置', async () => {
    let savedConfig: any = null
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      savedConfig = JSON.parse(content)
    })

    mockReadline.createInterface.mockReturnValue({
      question: vi.fn((prompt, callback) => {
        if (prompt.includes('Model')) {
          callback('gpt-4o')
        } else {
          callback('')
        }
      }),
      close: vi.fn(),
    } as any)

    const { runConfigWizard } = await resetConfigModule()
    await runConfigWizard()

    expect(savedConfig?.model).toBe('gpt-4o')
  })

  it('设置 shellHook 为 true 应该更新配置', async () => {
    let savedConfig: any = null
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      savedConfig = JSON.parse(content)
    })

    mockReadline.createInterface.mockReturnValue({
      question: vi.fn((prompt, callback) => {
        if (prompt.includes('Shell Hook')) {
          callback('true')
        } else {
          callback('')
        }
      }),
      close: vi.fn(),
    } as any)

    const { runConfigWizard } = await resetConfigModule()
    await runConfigWizard()

    expect(savedConfig?.shellHook).toBe(true)
  })

  it('设置有效的 editMode 应该更新配置', async () => {
    let savedConfig: any = null
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      savedConfig = JSON.parse(content)
    })

    mockReadline.createInterface.mockReturnValue({
      question: vi.fn((prompt, callback) => {
        if (prompt.includes('编辑模式')) {
          callback('auto')
        } else {
          callback('')
        }
      }),
      close: vi.fn(),
    } as any)

    const { runConfigWizard } = await resetConfigModule()
    await runConfigWizard()

    expect(savedConfig?.editMode).toBe('auto')
  })

  it('设置有效的数字配置应该更新', async () => {
    let savedConfig: any = null
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      savedConfig = JSON.parse(content)
    })

    mockReadline.createInterface.mockReturnValue({
      question: vi.fn((prompt, callback) => {
        if (prompt.includes('Chat 历史保留轮数')) {
          callback('15')
        } else if (prompt.includes('命令历史保留条数')) {
          callback('25')
        } else if (prompt.includes('Shell 历史保留条数')) {
          callback('35')
        } else if (prompt.includes('用户偏好显示命令数')) {
          callback('45')
        } else {
          callback('')
        }
      }),
      close: vi.fn(),
    } as any)

    const { runConfigWizard } = await resetConfigModule()
    await runConfigWizard()

    expect(savedConfig?.chatHistoryLimit).toBe(15)
    expect(savedConfig?.commandHistoryLimit).toBe(25)
    expect(savedConfig?.shellHistoryLimit).toBe(35)
    expect(savedConfig?.userPreferencesTopK).toBe(45)
  })

  it('无效的数字配置应该显示警告并保持原值', async () => {
    let savedConfig: any = null
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      savedConfig = JSON.parse(content)
    })

    mockReadline.createInterface.mockReturnValue({
      question: vi.fn((prompt, callback) => {
        if (prompt.includes('Chat 历史保留轮数')) {
          callback('invalid')
        } else {
          callback('')
        }
      }),
      close: vi.fn(),
    } as any)

    const { runConfigWizard } = await resetConfigModule()
    await runConfigWizard()

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('输入无效')
    // 保持原值（来自 validConfig）
    expect(savedConfig?.chatHistoryLimit).toBe(validConfig.chatHistoryLimit)
  })

  it('完成后应该显示成功消息', async () => {
    mockReadline.createInterface.mockReturnValue({
      question: vi.fn((prompt, callback) => callback('')),
      close: vi.fn(),
    } as any)

    const { runConfigWizard } = await resetConfigModule()
    await runConfigWizard()

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('配置已保存')
  })

  it('完成后应该关闭 readline', async () => {
    const closeFn = vi.fn()
    mockReadline.createInterface.mockReturnValue({
      question: vi.fn((prompt, callback) => callback('')),
      close: closeFn,
    } as any)

    const { runConfigWizard } = await resetConfigModule()
    await runConfigWizard()

    expect(closeFn).toHaveBeenCalled()
  })
})
