/**
 * 系统 Shell 历史读取模块测试
 * 测试各种 Shell 历史格式解析和系统历史读取功能
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  zshExtendedHistory,
  zshSimpleHistory,
  bashHistory,
  powerShellHistory,
} from '../../tests/fixtures/shell-history'

// Mock fs 模块
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  },
}))

// Mock config 模块
vi.mock('../config.js', () => ({
  getConfig: vi.fn(() => ({
    shellHistoryLimit: 10,
  })),
}))

// Mock platform 模块
vi.mock('../utils/platform.js', () => ({
  detectShell: vi.fn(),
  getShellCapabilities: vi.fn(),
}))

import fs from 'fs'
import { getConfig } from '../config.js'
import { detectShell, getShellCapabilities } from '../utils/platform.js'

// 获取 mock 函数引用
const mockFs = vi.mocked(fs)
const mockDetectShell = vi.mocked(detectShell)
const mockGetShellCapabilities = vi.mocked(getShellCapabilities)
const mockGetConfig = vi.mocked(getConfig)

beforeEach(() => {
  vi.clearAllMocks()
  // 默认配置
  mockGetConfig.mockReturnValue({
    shellHistoryLimit: 10,
  } as any)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ============================================================================
// Zsh 历史解析测试
// ============================================================================

describe('Zsh 历史解析', () => {
  beforeEach(() => {
    mockDetectShell.mockReturnValue('zsh')
    mockGetShellCapabilities.mockReturnValue({
      supportsHistory: true,
      historyPath: '/home/user/.zsh_history',
      supportsHook: true,
      hookType: 'zsh',
    } as any)
    mockFs.existsSync.mockReturnValue(true)
  })

  it('应该解析扩展格式（: timestamp:duration;command）', async () => {
    mockFs.readFileSync.mockReturnValue(': 1700000000:0;ls -la')

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history).toHaveLength(1)
    expect(history[0].cmd).toBe('ls -la')
    expect(history[0].exit).toBe(0)
    // 时间戳 1700000000 = 2023-11-14T22:13:20.000Z
    expect(history[0].time).toContain('2023-11-14')
  })

  it('应该解析简单格式（纯命令）', async () => {
    mockFs.readFileSync.mockReturnValue('git status')

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history).toHaveLength(1)
    expect(history[0].cmd).toBe('git status')
    expect(history[0].exit).toBe(0)
  })

  it('应该处理多行扩展格式历史', async () => {
    mockFs.readFileSync.mockReturnValue(zshExtendedHistory)

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history).toHaveLength(5)
    expect(history[0].cmd).toBe('ls -la')
    expect(history[1].cmd).toBe('git status')
    expect(history[4].cmd).toBe('cd ~/projects')
  })

  it('应该处理多行简单格式历史', async () => {
    mockFs.readFileSync.mockReturnValue(zshSimpleHistory)

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history).toHaveLength(5)
    expect(history[0].cmd).toBe('ls -la')
    expect(history[4].cmd).toBe('cd ~/projects')
  })

  it('退出码应该默认为 0（系统历史无退出码）', async () => {
    mockFs.readFileSync.mockReturnValue(': 1700000000:0;failed-command')

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history[0].exit).toBe(0)
  })

  it('空行应该被过滤', async () => {
    mockFs.readFileSync.mockReturnValue('ls -la\n\n\ngit status\n\n')

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history).toHaveLength(2)
  })

  it('应该正确转换时间戳为 ISO 8601 格式', async () => {
    // 时间戳 1700000000 对应 2023-11-14T22:13:20.000Z
    mockFs.readFileSync.mockReturnValue(': 1700000000:0;test')

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history[0].time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('duration 字段应该被忽略', async () => {
    // duration 值不同，但结果应该一样
    mockFs.readFileSync.mockReturnValue(': 1700000000:999;test')

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history[0].cmd).toBe('test')
  })

  it('应该保留命令中的特殊字符', async () => {
    mockFs.readFileSync.mockReturnValue(': 1700000000:0;echo "hello $USER" && ls')

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history[0].cmd).toBe('echo "hello $USER" && ls')
  })

  it('简单格式的时间应该使用当前时间', async () => {
    const beforeTime = new Date().toISOString()
    mockFs.readFileSync.mockReturnValue('simple-command')

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()
    const afterTime = new Date().toISOString()

    // 时间应该在测试执行期间
    expect(history[0].time >= beforeTime).toBe(true)
    expect(history[0].time <= afterTime).toBe(true)
  })
})

// ============================================================================
// Bash 历史解析测试
// ============================================================================

describe('Bash 历史解析', () => {
  beforeEach(() => {
    mockDetectShell.mockReturnValue('bash')
    mockGetShellCapabilities.mockReturnValue({
      supportsHistory: true,
      historyPath: '/home/user/.bash_history',
      supportsHook: true,
      hookType: 'bash',
    } as any)
    mockFs.existsSync.mockReturnValue(true)
  })

  it('应该解析纯文本命令', async () => {
    mockFs.readFileSync.mockReturnValue('ls -la')

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history).toHaveLength(1)
    expect(history[0].cmd).toBe('ls -la')
  })

  it('应该处理多行历史', async () => {
    mockFs.readFileSync.mockReturnValue(bashHistory)

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history).toHaveLength(5)
    expect(history[0].cmd).toBe('ls -la')
    expect(history[2].cmd).toBe('npm install')
  })

  it('退出码应该默认为 0', async () => {
    mockFs.readFileSync.mockReturnValue('any-command')

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history[0].exit).toBe(0)
  })

  it('时间应该使用当前时间', async () => {
    const beforeTime = new Date().toISOString()
    mockFs.readFileSync.mockReturnValue('test-command')

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history[0].time >= beforeTime).toBe(true)
  })

  it('空行应该被过滤', async () => {
    mockFs.readFileSync.mockReturnValue('cmd1\n\ncmd2\n\n\ncmd3')

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history).toHaveLength(3)
  })

  it('应该去除首尾空格', async () => {
    mockFs.readFileSync.mockReturnValue('  ls -la  ')

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history[0].cmd).toBe('ls -la')
  })

  it('应该保留命令中的特殊字符', async () => {
    mockFs.readFileSync.mockReturnValue('grep "pattern" file | awk \'{print $1}\'')

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history[0].cmd).toBe('grep "pattern" file | awk \'{print $1}\'')
  })
})

// ============================================================================
// Fish 历史解析测试
// ============================================================================

describe('Fish 历史解析', () => {
  beforeEach(() => {
    mockDetectShell.mockReturnValue('fish')
    mockGetShellCapabilities.mockReturnValue({
      supportsHistory: true,
      historyPath: '/home/user/.local/share/fish/fish_history',
      supportsHook: false,
      hookType: null,
    } as any)
    mockFs.existsSync.mockReturnValue(true)
  })

  it('应该解析 YAML-like 格式（- cmd: ...）', async () => {
    mockFs.readFileSync.mockReturnValue('- cmd: ls -la')

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history).toHaveLength(1)
    expect(history[0].cmd).toBe('ls -la')
  })

  it('非 cmd 行应该被过滤', async () => {
    mockFs.readFileSync.mockReturnValue('- cmd: ls -la\n  when: 1700000000\n- cmd: git status')

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    // 只有 cmd 行被解析
    expect(history).toHaveLength(2)
    expect(history[0].cmd).toBe('ls -la')
    expect(history[1].cmd).toBe('git status')
  })

  it('退出码应该默认为 0', async () => {
    mockFs.readFileSync.mockReturnValue('- cmd: failed-cmd')

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history[0].exit).toBe(0)
  })

  it('时间应该使用当前时间', async () => {
    const beforeTime = new Date().toISOString()
    mockFs.readFileSync.mockReturnValue('- cmd: test')

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history[0].time >= beforeTime).toBe(true)
  })

  it('格式错误的行应该被过滤', async () => {
    mockFs.readFileSync.mockReturnValue('- cmd: valid\ninvalid line\n- cmd: also-valid')

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history).toHaveLength(2)
  })

  it('应该保留命令中的特殊字符', async () => {
    mockFs.readFileSync.mockReturnValue('- cmd: echo "hello $USER"')

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history[0].cmd).toBe('echo "hello $USER"')
  })
})

// ============================================================================
// PowerShell 历史解析测试
// ============================================================================

describe('PowerShell 历史解析', () => {
  beforeEach(() => {
    mockDetectShell.mockReturnValue('powershell7')
    mockGetShellCapabilities.mockReturnValue({
      supportsHistory: true,
      historyPath: 'C:\\Users\\test\\AppData\\Roaming\\Microsoft\\Windows\\PowerShell\\PSReadLine\\ConsoleHost_history.txt',
      supportsHook: true,
      hookType: 'powershell',
    } as any)
    mockFs.existsSync.mockReturnValue(true)
  })

  it('应该解析纯文本命令', async () => {
    mockFs.readFileSync.mockReturnValue('Get-ChildItem')

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history).toHaveLength(1)
    expect(history[0].cmd).toBe('Get-ChildItem')
  })

  it('应该处理多行历史', async () => {
    mockFs.readFileSync.mockReturnValue(powerShellHistory)

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history).toHaveLength(5)
    expect(history[0].cmd).toBe('Get-ChildItem')
    expect(history[1].cmd).toBe('Get-Process')
  })

  it('退出码应该默认为 0', async () => {
    mockFs.readFileSync.mockReturnValue('Get-Process')

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history[0].exit).toBe(0)
  })

  it('时间应该使用当前时间', async () => {
    const beforeTime = new Date().toISOString()
    mockFs.readFileSync.mockReturnValue('Write-Host "test"')

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history[0].time >= beforeTime).toBe(true)
  })

  it('空行应该被过滤', async () => {
    mockFs.readFileSync.mockReturnValue('cmd1\n\ncmd2')

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history).toHaveLength(2)
  })

  it('PowerShell 5 也应该正常工作', async () => {
    mockDetectShell.mockReturnValue('powershell5')
    mockFs.readFileSync.mockReturnValue('Get-Service')

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history).toHaveLength(1)
    expect(history[0].cmd).toBe('Get-Service')
  })
})

// ============================================================================
// 系统历史读取测试
// ============================================================================

describe('getSystemShellHistory', () => {
  it('应该根据 Shell 类型选择正确的解析器', async () => {
    // Zsh
    mockDetectShell.mockReturnValue('zsh')
    mockGetShellCapabilities.mockReturnValue({
      supportsHistory: true,
      historyPath: '/home/user/.zsh_history',
    } as any)
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(': 1700000000:0;zsh-cmd')

    const { getSystemShellHistory } = await import('../system-history.js')
    let history = getSystemShellHistory()
    expect(history[0].cmd).toBe('zsh-cmd')

    // Bash
    mockDetectShell.mockReturnValue('bash')
    mockGetShellCapabilities.mockReturnValue({
      supportsHistory: true,
      historyPath: '/home/user/.bash_history',
    } as any)
    mockFs.readFileSync.mockReturnValue('bash-cmd')

    history = getSystemShellHistory()
    expect(history[0].cmd).toBe('bash-cmd')
  })

  it('文件不存在时应该返回空数组', async () => {
    mockDetectShell.mockReturnValue('zsh')
    mockGetShellCapabilities.mockReturnValue({
      supportsHistory: true,
      historyPath: '/nonexistent/.zsh_history',
    } as any)
    mockFs.existsSync.mockReturnValue(false)

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history).toEqual([])
  })

  it('Shell 不支持历史时应该返回空数组', async () => {
    mockDetectShell.mockReturnValue('cmd')
    mockGetShellCapabilities.mockReturnValue({
      supportsHistory: false,
      historyPath: null,
    } as any)

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history).toEqual([])
  })

  it('应该只返回最后 N 条（shellHistoryLimit）', async () => {
    mockGetConfig.mockReturnValue({ shellHistoryLimit: 3 } as any)
    mockDetectShell.mockReturnValue('bash')
    mockGetShellCapabilities.mockReturnValue({
      supportsHistory: true,
      historyPath: '/home/user/.bash_history',
    } as any)
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('cmd1\ncmd2\ncmd3\ncmd4\ncmd5')

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history).toHaveLength(3)
    expect(history[0].cmd).toBe('cmd3')
    expect(history[2].cmd).toBe('cmd5')
  })

  it('读取失败时应该返回空数组', async () => {
    mockDetectShell.mockReturnValue('zsh')
    mockGetShellCapabilities.mockReturnValue({
      supportsHistory: true,
      historyPath: '/home/user/.zsh_history',
    } as any)
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockImplementation(() => {
      throw new Error('EACCES: permission denied')
    })

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history).toEqual([])
  })

  it('unknown Shell 应该返回空数组', async () => {
    mockDetectShell.mockReturnValue('unknown')
    mockGetShellCapabilities.mockReturnValue({
      supportsHistory: false,
      historyPath: null,
    } as any)

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history).toEqual([])
  })

  it('空文件应该返回空数组', async () => {
    mockDetectShell.mockReturnValue('bash')
    mockGetShellCapabilities.mockReturnValue({
      supportsHistory: true,
      historyPath: '/home/user/.bash_history',
    } as any)
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('')

    const { getSystemShellHistory } = await import('../system-history.js')
    const history = getSystemShellHistory()

    expect(history).toEqual([])
  })
})

// ============================================================================
// getLastCommandFromSystem 测试
// ============================================================================

describe('getLastCommandFromSystem', () => {
  beforeEach(() => {
    mockDetectShell.mockReturnValue('bash')
    mockGetShellCapabilities.mockReturnValue({
      supportsHistory: true,
      historyPath: '/home/user/.bash_history',
    } as any)
    mockFs.existsSync.mockReturnValue(true)
  })

  it('应该返回最近一条非 pls 命令', async () => {
    mockFs.readFileSync.mockReturnValue('git status\npls install git\nls -la')

    const { getLastCommandFromSystem } = await import('../system-history.js')
    const lastCmd = getLastCommandFromSystem()

    expect(lastCmd).not.toBeNull()
    expect(lastCmd!.cmd).toBe('ls -la')
  })

  it('应该排除 pls 命令', async () => {
    mockFs.readFileSync.mockReturnValue('git status\npls fix\npls install')

    const { getLastCommandFromSystem } = await import('../system-history.js')
    const lastCmd = getLastCommandFromSystem()

    expect(lastCmd!.cmd).toBe('git status')
  })

  it('应该排除 please 命令', async () => {
    mockFs.readFileSync.mockReturnValue('npm install\nplease help\nplease run')

    const { getLastCommandFromSystem } = await import('../system-history.js')
    const lastCmd = getLastCommandFromSystem()

    expect(lastCmd!.cmd).toBe('npm install')
  })

  it('所有命令都是 pls/please 时应该返回 null', async () => {
    mockFs.readFileSync.mockReturnValue('pls help\npls config\nplease install')

    const { getLastCommandFromSystem } = await import('../system-history.js')
    const lastCmd = getLastCommandFromSystem()

    expect(lastCmd).toBeNull()
  })

  it('历史为空时应该返回 null', async () => {
    mockFs.readFileSync.mockReturnValue('')

    const { getLastCommandFromSystem } = await import('../system-history.js')
    const lastCmd = getLastCommandFromSystem()

    expect(lastCmd).toBeNull()
  })

  it('文件不存在时应该返回 null', async () => {
    mockFs.existsSync.mockReturnValue(false)

    const { getLastCommandFromSystem } = await import('../system-history.js')
    const lastCmd = getLastCommandFromSystem()

    expect(lastCmd).toBeNull()
  })
})
