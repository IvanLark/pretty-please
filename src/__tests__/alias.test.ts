/**
 * 别名管理模块测试
 * 测试别名解析、模板参数替换、别名管理等功能
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

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

// Mock config 模块
vi.mock('../config.js', () => ({
  getConfig: vi.fn(() => ({
    aliases: {},
  })),
  saveConfig: vi.fn(),
}))

// Mock theme 模块
vi.mock('../ui/theme.js', () => ({
  getCurrentTheme: vi.fn(() => ({
    primary: '#007acc',
    secondary: '#6c757d',
    success: '#4caf50',
    error: '#f44336',
    warning: '#ff9800',
    text: {
      muted: '#666666',
    },
  })),
}))

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: vi.fn((s: string) => s),
    gray: vi.fn((s: string) => s),
    hex: vi.fn(() => (s: string) => s),
  },
}))

import { getConfig, saveConfig } from '../config.js'

// 获取 mock 函数引用
const mockGetConfig = vi.mocked(getConfig)
const mockSaveConfig = vi.mocked(saveConfig)

// 模块状态重置辅助
async function resetAliasModule() {
  vi.resetModules()
  return await import('../alias.js')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetConfig.mockReturnValue({
    aliases: {},
  } as any)
  mockSaveConfig.mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ============================================================================
// getAliases 测试
// ============================================================================

describe('getAliases', () => {
  it('应该返回空对象（无别名时）', async () => {
    mockGetConfig.mockReturnValue({ aliases: {} } as any)

    const { getAliases } = await resetAliasModule()
    const aliases = getAliases()

    expect(aliases).toEqual({})
  })

  it('应该返回配置中的别名', async () => {
    mockGetConfig.mockReturnValue({
      aliases: {
        disk: { prompt: '检查磁盘空间', description: '磁盘检查' },
        deploy: { prompt: '部署到生产环境' },
      },
    } as any)

    const { getAliases } = await resetAliasModule()
    const aliases = getAliases()

    expect(aliases.disk.prompt).toBe('检查磁盘空间')
    expect(aliases.deploy.prompt).toBe('部署到生产环境')
  })

  it('aliases 为 undefined 时应该返回空对象', async () => {
    mockGetConfig.mockReturnValue({} as any)

    const { getAliases } = await resetAliasModule()
    const aliases = getAliases()

    expect(aliases).toEqual({})
  })
})

// ============================================================================
// addAlias 测试
// ============================================================================

describe('addAlias', () => {
  it('应该添加新别名', async () => {
    mockGetConfig.mockReturnValue({ aliases: {} } as any)

    const { addAlias } = await resetAliasModule()
    addAlias('disk', '检查磁盘空间')

    expect(mockSaveConfig).toHaveBeenCalled()
    const savedConfig = mockSaveConfig.mock.calls[0][0]
    expect(savedConfig.aliases.disk.prompt).toBe('检查磁盘空间')
  })

  it('应该移除 @ 前缀', async () => {
    mockGetConfig.mockReturnValue({ aliases: {} } as any)

    const { addAlias } = await resetAliasModule()
    addAlias('@disk', '检查磁盘空间')

    const savedConfig = mockSaveConfig.mock.calls[0][0]
    expect(savedConfig.aliases.disk).toBeDefined()
    expect(savedConfig.aliases['@disk']).toBeUndefined()
  })

  it('应该保存可选描述', async () => {
    mockGetConfig.mockReturnValue({ aliases: {} } as any)

    const { addAlias } = await resetAliasModule()
    addAlias('disk', '检查磁盘空间', '这是一个磁盘检查命令')

    const savedConfig = mockSaveConfig.mock.calls[0][0]
    expect(savedConfig.aliases.disk.description).toBe('这是一个磁盘检查命令')
  })

  it('空别名名称应该抛出错误', async () => {
    const { addAlias } = await resetAliasModule()

    expect(() => addAlias('', '检查磁盘空间'))
      .toThrow('别名名称不能为空')
  })

  it('空格别名名称应该抛出错误', async () => {
    const { addAlias } = await resetAliasModule()

    expect(() => addAlias('   ', '检查磁盘空间'))
      .toThrow('别名名称不能为空')
  })

  it('空 prompt 应该抛出错误', async () => {
    const { addAlias } = await resetAliasModule()

    expect(() => addAlias('disk', ''))
      .toThrow('prompt 不能为空')
  })

  it('无效字符的别名名称应该抛出错误', async () => {
    const { addAlias } = await resetAliasModule()

    expect(() => addAlias('disk space', '检查磁盘空间'))
      .toThrow('别名名称只能包含字母、数字、下划线和连字符')
  })

  it('包含特殊字符的别名名称应该抛出错误', async () => {
    const { addAlias } = await resetAliasModule()

    expect(() => addAlias('disk!@#', '检查磁盘空间'))
      .toThrow('别名名称只能包含字母、数字、下划线和连字符')
  })

  it('有效的别名名称应该通过验证', async () => {
    mockGetConfig.mockReturnValue({ aliases: {} } as any)

    const { addAlias } = await resetAliasModule()

    // 这些都应该成功
    expect(() => addAlias('disk', '检查磁盘空间')).not.toThrow()
    expect(() => addAlias('disk_check', '检查磁盘空间')).not.toThrow()
    expect(() => addAlias('disk-check', '检查磁盘空间')).not.toThrow()
    expect(() => addAlias('disk123', '检查磁盘空间')).not.toThrow()
    expect(() => addAlias('DiskCheck', '检查磁盘空间')).not.toThrow()
  })

  it('保留命令应该抛出错误', async () => {
    mockGetConfig.mockReturnValue({ aliases: {} } as any)

    const { addAlias } = await resetAliasModule()
    const reservedCommands = ['config', 'history', 'alias']

    expect(() => addAlias('config', '配置命令', undefined, reservedCommands))
      .toThrow('"config" 是保留的子命令，不能用作别名')
  })

  it('应该去除 prompt 的首尾空格', async () => {
    mockGetConfig.mockReturnValue({ aliases: {} } as any)

    const { addAlias } = await resetAliasModule()
    addAlias('disk', '  检查磁盘空间  ')

    const savedConfig = mockSaveConfig.mock.calls[0][0]
    expect(savedConfig.aliases.disk.prompt).toBe('检查磁盘空间')
  })
})

// ============================================================================
// removeAlias 测试
// ============================================================================

describe('removeAlias', () => {
  it('应该删除存在的别名', async () => {
    mockGetConfig.mockReturnValue({
      aliases: {
        disk: { prompt: '检查磁盘空间' },
      },
    } as any)

    const { removeAlias } = await resetAliasModule()
    const result = removeAlias('disk')

    expect(result).toBe(true)
    expect(mockSaveConfig).toHaveBeenCalled()
  })

  it('应该支持 @ 前缀删除', async () => {
    mockGetConfig.mockReturnValue({
      aliases: {
        disk: { prompt: '检查磁盘空间' },
      },
    } as any)

    const { removeAlias } = await resetAliasModule()
    const result = removeAlias('@disk')

    expect(result).toBe(true)
  })

  it('删除不存在的别名应该返回 false', async () => {
    mockGetConfig.mockReturnValue({ aliases: {} } as any)

    const { removeAlias } = await resetAliasModule()
    const result = removeAlias('nonexistent')

    expect(result).toBe(false)
    expect(mockSaveConfig).not.toHaveBeenCalled()
  })

  it('aliases 为空时应该返回 false', async () => {
    mockGetConfig.mockReturnValue({} as any)

    const { removeAlias } = await resetAliasModule()
    const result = removeAlias('disk')

    expect(result).toBe(false)
  })
})

// ============================================================================
// resolveAlias 测试
// ============================================================================

describe('resolveAlias', () => {
  describe('基础解析', () => {
    it('应该解析已知别名', async () => {
      mockGetConfig.mockReturnValue({
        aliases: {
          disk: { prompt: '检查磁盘空间' },
        },
      } as any)

      const { resolveAlias } = await resetAliasModule()
      const result = resolveAlias('disk')

      expect(result.resolved).toBe(true)
      expect(result.prompt).toBe('检查磁盘空间')
      expect(result.aliasName).toBe('disk')
    })

    it('应该支持 @ 前缀', async () => {
      mockGetConfig.mockReturnValue({
        aliases: {
          disk: { prompt: '检查磁盘空间' },
        },
      } as any)

      const { resolveAlias } = await resetAliasModule()
      const result = resolveAlias('@disk')

      expect(result.resolved).toBe(true)
      expect(result.aliasName).toBe('disk')
    })

    it('未知输入应该返回 resolved: false', async () => {
      mockGetConfig.mockReturnValue({ aliases: {} } as any)

      const { resolveAlias } = await resetAliasModule()
      const result = resolveAlias('unknown command')

      expect(result.resolved).toBe(false)
      expect(result.prompt).toBe('unknown command')
    })

    it('空输入应该返回 resolved: false', async () => {
      const { resolveAlias } = await resetAliasModule()
      const result = resolveAlias('   ')

      expect(result.resolved).toBe(false)
    })
  })

  describe('额外参数追加', () => {
    it('应该追加额外参数到 prompt', async () => {
      mockGetConfig.mockReturnValue({
        aliases: {
          disk: { prompt: '检查磁盘空间' },
        },
      } as any)

      const { resolveAlias } = await resetAliasModule()
      const result = resolveAlias('disk /home')

      expect(result.prompt).toBe('检查磁盘空间 /home')
    })

    it('应该追加多个额外参数', async () => {
      mockGetConfig.mockReturnValue({
        aliases: {
          list: { prompt: '列出文件' },
        },
      } as any)

      const { resolveAlias } = await resetAliasModule()
      const result = resolveAlias('list -la /home')

      expect(result.prompt).toBe('列出文件 -la /home')
    })
  })

  describe('模板参数替换', () => {
    it('应该替换 {{param}} 模板参数', async () => {
      mockGetConfig.mockReturnValue({
        aliases: {
          deploy: { prompt: '部署 {{env}} 环境到 {{server}}' },
        },
      } as any)

      const { resolveAlias } = await resetAliasModule()
      const result = resolveAlias('deploy env=production server=web1')

      expect(result.prompt).toBe('部署 production 环境到 web1')
    })

    it('应该支持 --key=value 格式', async () => {
      mockGetConfig.mockReturnValue({
        aliases: {
          deploy: { prompt: '部署 {{env}} 环境' },
        },
      } as any)

      const { resolveAlias } = await resetAliasModule()
      const result = resolveAlias('deploy --env=staging')

      expect(result.prompt).toBe('部署 staging 环境')
    })

    it('应该使用默认值 {{param:default}}', async () => {
      mockGetConfig.mockReturnValue({
        aliases: {
          deploy: { prompt: '部署 {{env:production}} 环境' },
        },
      } as any)

      const { resolveAlias } = await resetAliasModule()
      const result = resolveAlias('deploy')

      expect(result.prompt).toBe('部署 production 环境')
    })

    it('参数值应该覆盖默认值', async () => {
      mockGetConfig.mockReturnValue({
        aliases: {
          deploy: { prompt: '部署 {{env:production}} 环境' },
        },
      } as any)

      const { resolveAlias } = await resetAliasModule()
      const result = resolveAlias('deploy env=staging')

      expect(result.prompt).toBe('部署 staging 环境')
    })

    it('缺少必填参数应该抛出错误', async () => {
      mockGetConfig.mockReturnValue({
        aliases: {
          deploy: { prompt: '部署 {{env}} 环境' },
        },
      } as any)

      const { resolveAlias } = await resetAliasModule()

      expect(() => resolveAlias('deploy'))
        .toThrow('别名 "deploy" 缺少必填参数: env')
    })

    it('应该支持多个必填参数', async () => {
      mockGetConfig.mockReturnValue({
        aliases: {
          deploy: { prompt: '部署 {{app}} 到 {{env}} 环境' },
        },
      } as any)

      const { resolveAlias } = await resetAliasModule()
      const result = resolveAlias('deploy app=myapp env=production')

      expect(result.prompt).toBe('部署 myapp 到 production 环境')
    })

    it('多个缺失参数应该全部列出', async () => {
      mockGetConfig.mockReturnValue({
        aliases: {
          deploy: { prompt: '部署 {{app}} 到 {{env}}' },
        },
      } as any)

      const { resolveAlias } = await resetAliasModule()

      expect(() => resolveAlias('deploy'))
        .toThrow('缺少必填参数: app, env')
    })
  })

  describe('混合参数', () => {
    it('应该追加非 key=value 的额外参数', async () => {
      mockGetConfig.mockReturnValue({
        aliases: {
          deploy: { prompt: '部署 {{env}} 环境' },
        },
      } as any)

      const { resolveAlias } = await resetAliasModule()
      const result = resolveAlias('deploy env=prod --force')

      expect(result.prompt).toBe('部署 prod 环境 --force')
    })

    it('originalInput 应该保留原始输入', async () => {
      mockGetConfig.mockReturnValue({
        aliases: {
          disk: { prompt: '检查磁盘空间' },
        },
      } as any)

      const { resolveAlias } = await resetAliasModule()
      const result = resolveAlias('@disk /home')

      expect(result.originalInput).toBe('@disk /home')
    })
  })
})

// ============================================================================
// getAliasParams 测试
// ============================================================================

describe('getAliasParams', () => {
  it('应该返回模板参数列表', async () => {
    mockGetConfig.mockReturnValue({
      aliases: {
        deploy: { prompt: '部署 {{app}} 到 {{env}} 环境' },
      },
    } as any)

    const { getAliasParams } = await resetAliasModule()
    const params = getAliasParams('deploy')

    expect(params).toEqual(['app', 'env'])
  })

  it('无模板参数应该返回空数组', async () => {
    mockGetConfig.mockReturnValue({
      aliases: {
        disk: { prompt: '检查磁盘空间' },
      },
    } as any)

    const { getAliasParams } = await resetAliasModule()
    const params = getAliasParams('disk')

    expect(params).toEqual([])
  })

  it('不存在的别名应该返回空数组', async () => {
    mockGetConfig.mockReturnValue({ aliases: {} } as any)

    const { getAliasParams } = await resetAliasModule()
    const params = getAliasParams('nonexistent')

    expect(params).toEqual([])
  })

  it('应该忽略默认值部分', async () => {
    mockGetConfig.mockReturnValue({
      aliases: {
        deploy: { prompt: '部署 {{env:production}} 环境' },
      },
    } as any)

    const { getAliasParams } = await resetAliasModule()
    const params = getAliasParams('deploy')

    expect(params).toEqual(['env'])
  })

  it('重复参数应该去重', async () => {
    mockGetConfig.mockReturnValue({
      aliases: {
        test: { prompt: '{{env}} 和 {{env}} 和 {{app}}' },
      },
    } as any)

    const { getAliasParams } = await resetAliasModule()
    const params = getAliasParams('test')

    expect(params).toEqual(['env', 'app'])
  })
})
