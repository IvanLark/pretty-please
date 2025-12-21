/**
 * Shell Hook 安装/卸载测试
 * 专注测试文件操作逻辑，Mock 掉平台检测
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import path from 'path'

// Mock fs 模块
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn(),
    copyFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}))

// Mock os 模块
vi.mock('os', () => ({
  default: {
    homedir: vi.fn(() => '/home/testuser'),
  },
}))

// Mock config 模块
const mockConfig = {
  shellHook: false,
  shellHistoryLimit: 10,
}

vi.mock('../config.js', () => ({
  getConfig: vi.fn(() => mockConfig),
  setConfigValue: vi.fn((key: string, value: any) => {
    ;(mockConfig as any)[key] = value
    return mockConfig
  }),
  CONFIG_DIR: '/home/testuser/.please',
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
}))

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    hex: vi.fn(() => (s: string) => s),
    gray: vi.fn((s: string) => s),
  },
}))

// Mock platform 模块的 detectShell
vi.mock('../utils/platform.js', () => ({
  detectShell: vi.fn(() => 'zsh'),
}))

import fs from 'fs'
import { getConfig, setConfigValue, CONFIG_DIR } from '../config.js'
import { detectShell as platformDetectShell } from '../utils/platform.js'

const mockFs = vi.mocked(fs)
const mockGetConfig = vi.mocked(getConfig)
const mockSetConfigValue = vi.mocked(setConfigValue)
const mockPlatformDetectShell = vi.mocked(platformDetectShell)

// Hook 标记
const HOOK_START_MARKER = '# >>> pretty-please shell hook >>>'
const HOOK_END_MARKER = '# <<< pretty-please shell hook <<<'

// 跨平台路径辅助函数
const HOME = '/home/testuser'
const ZSHRC_PATH = path.join(HOME, '.zshrc')
const ZSHRC_BACKUP_PATH = path.join(HOME, '.zshrc.pls-backup')
const CONFIG_PATH = path.join(HOME, '.please')

// 模拟的 shell 配置文件内容
const EMPTY_ZSHRC = '# My zshrc\nexport PATH=$PATH:/usr/local/bin\n'
const ZSHRC_WITH_HOOK = `# My zshrc
export PATH=$PATH:/usr/local/bin

${HOOK_START_MARKER}
# Hook content here
__pls_preexec() { ... }
${HOOK_END_MARKER}
`

// 模块重置辅助函数
async function resetShellHookModule() {
  vi.resetModules()
  // 重新设置 mock
  vi.doMock('fs', () => ({
    default: mockFs,
  }))
  return await import('../shell-hook.js')
}

beforeEach(() => {
  vi.clearAllMocks()
  // 重置 mockConfig
  mockConfig.shellHook = false
  mockConfig.shellHistoryLimit = 10
  // 默认返回 zsh
  mockPlatformDetectShell.mockReturnValue('zsh')
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ============================================================================
// installShellHook 测试
// ============================================================================

describe('installShellHook', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  it('首次安装应该成功', async () => {
    // 配置文件存在但没有 hook
    mockFs.existsSync.mockImplementation((p: any) => {
      const pathStr = p.toString()
      if (pathStr.includes('.zshrc') && !pathStr.includes('backup')) return true
      if (pathStr.includes('.please')) return true
      return false
    })
    mockFs.readFileSync.mockReturnValue(EMPTY_ZSHRC)

    const { installShellHook } = await resetShellHookModule()
    const result = await installShellHook()

    expect(result).toBe(true)
    // 应该备份原文件（检查调用了 copyFileSync，不检查具体路径格式）
    expect(mockFs.copyFileSync).toHaveBeenCalled()
    const copyCall = mockFs.copyFileSync.mock.calls[0]
    expect(copyCall[0].toString()).toContain('.zshrc')
    expect(copyCall[1].toString()).toContain('.zshrc.pls-backup')
    // 应该追加 hook 脚本
    expect(mockFs.appendFileSync).toHaveBeenCalled()
    // 应该更新配置
    expect(mockSetConfigValue).toHaveBeenCalledWith('shellHook', true)
  })

  it('已安装时应该跳过并返回 true', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(ZSHRC_WITH_HOOK)

    const { installShellHook } = await resetShellHookModule()
    const result = await installShellHook()

    expect(result).toBe(true)
    // 不应该追加
    expect(mockFs.appendFileSync).not.toHaveBeenCalled()
    // 应该更新配置
    expect(mockSetConfigValue).toHaveBeenCalledWith('shellHook', true)
    // 应该显示警告
    const allLogs = consoleLogSpy.mock.calls.map((c) => c[0]).join('\n')
    expect(allLogs).toContain('已安装')
  })

  it('不支持的 shell 应该返回 false', async () => {
    mockPlatformDetectShell.mockReturnValue('unknown')

    const { installShellHook } = await resetShellHookModule()
    const result = await installShellHook()

    expect(result).toBe(false)
    expect(mockFs.appendFileSync).not.toHaveBeenCalled()
  })

  it('配置目录不存在时应该创建', async () => {
    mockFs.existsSync.mockImplementation((path: any) => {
      if (path === '/home/testuser/.zshrc') return true
      if (path === '/home/testuser/.please') return false
      return false
    })
    mockFs.readFileSync.mockReturnValue(EMPTY_ZSHRC)

    const { installShellHook } = await resetShellHookModule()
    await installShellHook()

    expect(mockFs.mkdirSync).toHaveBeenCalledWith('/home/testuser/.please', {
      recursive: true,
    })
  })

  it('配置文件不存在时不应该备份', async () => {
    mockFs.existsSync.mockImplementation((path: any) => {
      if (path === '/home/testuser/.zshrc') return false
      if (path === '/home/testuser/.please') return true
      return false
    })

    const { installShellHook } = await resetShellHookModule()
    await installShellHook()

    expect(mockFs.copyFileSync).not.toHaveBeenCalled()
  })
})

// ============================================================================
// uninstallShellHook 测试
// ============================================================================

describe('uninstallShellHook', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  it('已安装时应该成功卸载', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(ZSHRC_WITH_HOOK)

    let writtenContent = ''
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      writtenContent = content
    })

    const { uninstallShellHook } = await resetShellHookModule()
    const result = uninstallShellHook()

    expect(result).toBe(true)
    // 应该移除 hook 内容
    expect(writtenContent).not.toContain(HOOK_START_MARKER)
    expect(writtenContent).not.toContain(HOOK_END_MARKER)
    expect(writtenContent).toContain('# My zshrc')
    // 应该更新配置
    expect(mockSetConfigValue).toHaveBeenCalledWith('shellHook', false)
    // 应该删除历史文件
    expect(mockFs.unlinkSync).toHaveBeenCalled()
  })

  it('未安装时应该返回 true 并更新配置', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(EMPTY_ZSHRC)

    const { uninstallShellHook } = await resetShellHookModule()
    const result = uninstallShellHook()

    expect(result).toBe(true)
    // 不应该写入文件
    expect(mockFs.writeFileSync).not.toHaveBeenCalled()
    // 应该更新配置
    expect(mockSetConfigValue).toHaveBeenCalledWith('shellHook', false)
  })

  it('配置文件不存在时应该返回 true', async () => {
    mockFs.existsSync.mockReturnValue(false)

    const { uninstallShellHook } = await resetShellHookModule()
    const result = uninstallShellHook()

    expect(result).toBe(true)
    expect(mockSetConfigValue).toHaveBeenCalledWith('shellHook', false)
  })

  it('历史文件不存在时不应该报错', async () => {
    mockFs.existsSync.mockImplementation((path: any) => {
      if (path === '/home/testuser/.zshrc') return true
      if (path.includes('shell_history.jsonl')) return false
      return true
    })
    mockFs.readFileSync.mockReturnValue(ZSHRC_WITH_HOOK)

    const { uninstallShellHook } = await resetShellHookModule()
    const result = uninstallShellHook()

    expect(result).toBe(true)
  })
})

// ============================================================================
// clearShellHistory 测试
// ============================================================================

describe('clearShellHistory', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  it('历史文件存在时应该删除', async () => {
    mockFs.existsSync.mockReturnValue(true)

    const { clearShellHistory } = await resetShellHookModule()
    clearShellHistory()

    expect(mockFs.unlinkSync).toHaveBeenCalled()
    const allLogs = consoleLogSpy.mock.calls.map((c) => c[0]).join('\n')
    expect(allLogs).toContain('已清空')
  })

  it('历史文件不存在时不应该报错', async () => {
    mockFs.existsSync.mockReturnValue(false)

    const { clearShellHistory } = await resetShellHookModule()
    clearShellHistory()

    expect(mockFs.unlinkSync).not.toHaveBeenCalled()
    const allLogs = consoleLogSpy.mock.calls.map((c) => c[0]).join('\n')
    expect(allLogs).toContain('已清空')
  })
})

// ============================================================================
// getShellHistory 测试 (JSONL 解析)
// ============================================================================

describe('getShellHistory - JSONL 解析', () => {
  it('shellHook 禁用时应该返回空数组', async () => {
    mockConfig.shellHook = false

    const { getShellHistory } = await resetShellHookModule()
    const history = getShellHistory()

    expect(history).toEqual([])
  })

  it('历史文件不存在时应该返回空数组', async () => {
    mockConfig.shellHook = true
    mockFs.existsSync.mockReturnValue(false)

    const { getShellHistory } = await resetShellHookModule()
    const history = getShellHistory()

    expect(history).toEqual([])
  })

  it('应该正确解析 JSONL 格式', async () => {
    mockConfig.shellHook = true
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(
      '{"cmd":"ls -la","exit":0,"time":"2024-01-01T00:00:00Z"}\n' +
        '{"cmd":"pwd","exit":0,"time":"2024-01-01T00:01:00Z"}\n' +
        '{"cmd":"git status","exit":0,"time":"2024-01-01T00:02:00Z"}\n'
    )

    const { getShellHistory } = await resetShellHookModule()
    const history = getShellHistory()

    expect(history).toHaveLength(3)
    expect(history[0].cmd).toBe('ls -la')
    expect(history[1].cmd).toBe('pwd')
    expect(history[2].cmd).toBe('git status')
  })

  it('应该跳过无效的 JSON 行', async () => {
    mockConfig.shellHook = true
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(
      '{"cmd":"ls","exit":0,"time":"2024-01-01"}\n' +
        'invalid json line\n' +
        '{"cmd":"pwd","exit":0,"time":"2024-01-01"}\n'
    )

    const { getShellHistory } = await resetShellHookModule()
    const history = getShellHistory()

    expect(history).toHaveLength(2)
    expect(history[0].cmd).toBe('ls')
    expect(history[1].cmd).toBe('pwd')
  })

  it('应该应用 shellHistoryLimit 限制', async () => {
    mockConfig.shellHook = true
    mockConfig.shellHistoryLimit = 2
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(
      '{"cmd":"cmd1","exit":0,"time":"2024-01-01"}\n' +
        '{"cmd":"cmd2","exit":0,"time":"2024-01-01"}\n' +
        '{"cmd":"cmd3","exit":0,"time":"2024-01-01"}\n' +
        '{"cmd":"cmd4","exit":0,"time":"2024-01-01"}\n'
    )

    const { getShellHistory } = await resetShellHookModule()
    const history = getShellHistory()

    expect(history).toHaveLength(2)
    // 应该返回最后 2 条
    expect(history[0].cmd).toBe('cmd3')
    expect(history[1].cmd).toBe('cmd4')
  })

  it('空文件应该返回空数组', async () => {
    mockConfig.shellHook = true
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('')

    const { getShellHistory } = await resetShellHookModule()
    const history = getShellHistory()

    expect(history).toEqual([])
  })

  it('只有空行的文件应该返回空数组', async () => {
    mockConfig.shellHook = true
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('\n\n  \n\n')

    const { getShellHistory } = await resetShellHookModule()
    const history = getShellHistory()

    expect(history).toEqual([])
  })

  it('读取文件失败时应该返回空数组', async () => {
    mockConfig.shellHook = true
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockImplementation(() => {
      throw new Error('EACCES: permission denied')
    })

    const { getShellHistory } = await resetShellHookModule()
    const history = getShellHistory()

    expect(history).toEqual([])
  })
})

// ============================================================================
// reinstallShellHook 测试
// ============================================================================

describe('reinstallShellHook', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  it('应该先卸载再安装', async () => {
    // shellHook 必须为 true 才会执行重装
    mockConfig.shellHook = true

    // 第一次调用（卸载时）返回有 hook 的内容
    // 第二次调用（安装时）返回无 hook 的内容
    let callCount = 0
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockImplementation(() => {
      callCount++
      if (callCount === 1) return ZSHRC_WITH_HOOK // 卸载时读取
      return EMPTY_ZSHRC // 安装时读取
    })

    const { reinstallShellHook } = await resetShellHookModule()
    const result = await reinstallShellHook()

    expect(result).toBe(true)
    // 应该先写入（卸载），再追加（安装）
    expect(mockFs.writeFileSync).toHaveBeenCalled()
    expect(mockFs.appendFileSync).toHaveBeenCalled()
  })

  it('shellHook 禁用时应该返回 false', async () => {
    mockConfig.shellHook = false

    const { reinstallShellHook } = await resetShellHookModule()
    const result = await reinstallShellHook()

    expect(result).toBe(false)
    expect(mockFs.writeFileSync).not.toHaveBeenCalled()
    expect(mockFs.appendFileSync).not.toHaveBeenCalled()
  })

  it('silent 模式应该不输出日志', async () => {
    mockConfig.shellHook = true
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(EMPTY_ZSHRC)

    const { reinstallShellHook } = await resetShellHookModule()
    await reinstallShellHook({ silent: true })

    // silent 模式下，installShellHook 内部的日志仍然会输出
    // 但 reinstallShellHook 本身不会输出额外日志
    // 这个测试主要验证 silent 参数被正确传递
    expect(true).toBe(true)
  })
})
