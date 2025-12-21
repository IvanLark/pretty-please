/**
 * 远程服务器历史管理模块测试
 * 测试远程命令历史的读写、Shell 历史获取、格式化等功能
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock fs 模块
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
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
vi.mock('../config.js', () => ({
  getConfig: vi.fn(() => ({
    commandHistoryLimit: 10,
    shellHistoryLimit: 15,
  })),
  CONFIG_DIR: '/home/testuser/.please',
}))

// Mock remote 模块
vi.mock('../remote.js', () => ({
  sshExec: vi.fn(),
  getRemote: vi.fn(),
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
    dim: vi.fn((s: string) => s),
    hex: vi.fn(() => (s: string) => s),
  },
}))

import fs from 'fs'
import { getConfig, CONFIG_DIR } from '../config.js'
import { sshExec, getRemote } from '../remote.js'

// 获取 mock 函数引用
const mockFs = vi.mocked(fs)
const mockGetConfig = vi.mocked(getConfig)
const mockSshExec = vi.mocked(sshExec)
const mockGetRemote = vi.mocked(getRemote)

// 模块状态重置辅助
async function resetRemoteHistoryModule() {
  vi.resetModules()
  return await import('../remote-history.js')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetConfig.mockReturnValue({
    commandHistoryLimit: 10,
    shellHistoryLimit: 15,
  } as any)
  mockFs.existsSync.mockReturnValue(true)
  mockFs.writeFileSync.mockImplementation(() => {})
  mockGetRemote.mockReturnValue({
    name: 'server1',
    host: '192.168.1.100',
    user: 'root',
  } as any)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ============================================================================
// getRemoteHistory 测试
// ============================================================================

describe('getRemoteHistory', () => {
  it('应该返回远程命令历史数组', async () => {
    const mockHistory = [
      {
        userPrompt: '检查磁盘',
        command: 'df -h',
        executed: true,
        exitCode: 0,
        output: '',
        timestamp: '2024-01-01T00:00:00.000Z',
      },
    ]
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(mockHistory))

    const { getRemoteHistory } = await resetRemoteHistoryModule()
    const history = getRemoteHistory('server1')

    expect(history).toHaveLength(1)
    expect(history[0].command).toBe('df -h')
  })

  it('文件不存在时应该返回空数组', async () => {
    mockFs.existsSync.mockReturnValue(false)

    const { getRemoteHistory } = await resetRemoteHistoryModule()
    const history = getRemoteHistory('server1')

    expect(history).toEqual([])
  })

  it('JSON 损坏时应该返回空数组', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('{invalid json')

    const { getRemoteHistory } = await resetRemoteHistoryModule()
    const history = getRemoteHistory('server1')

    expect(history).toEqual([])
  })
})

// ============================================================================
// addRemoteHistory 测试
// ============================================================================

describe('addRemoteHistory', () => {
  it('应该添加远程命令历史记录', async () => {
    mockFs.existsSync.mockReturnValue(false) // 历史文件不存在

    let writtenContent: string = ''
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      writtenContent = content
    })

    const { addRemoteHistory } = await resetRemoteHistoryModule()
    addRemoteHistory('server1', {
      userPrompt: '检查磁盘',
      command: 'df -h',
      executed: true,
      exitCode: 0,
      output: 'Filesystem      Size  Used',
    })

    const saved = JSON.parse(writtenContent)
    expect(saved).toHaveLength(1)
    expect(saved[0].command).toBe('df -h')
    expect(saved[0].timestamp).toBeDefined()
  })

  it('应该创建服务器目录（如果不存在）', async () => {
    mockFs.existsSync.mockReturnValue(false)

    const { addRemoteHistory } = await resetRemoteHistoryModule()
    addRemoteHistory('server1', {
      userPrompt: '测试',
      command: 'test',
      executed: true,
      exitCode: 0,
      output: '',
    })

    expect(mockFs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('server1'),
      { recursive: true }
    )
  })

  it('应该限制历史数量（commandHistoryLimit）', async () => {
    mockGetConfig.mockReturnValue({ commandHistoryLimit: 2 } as any)

    const existingHistory = [
      { userPrompt: '1', command: 'c1', executed: true, exitCode: 0, output: '', timestamp: '2024-01-01' },
      { userPrompt: '2', command: 'c2', executed: true, exitCode: 0, output: '', timestamp: '2024-01-02' },
    ]
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(existingHistory))

    let writtenContent: string = ''
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      writtenContent = content
    })

    const { addRemoteHistory } = await resetRemoteHistoryModule()
    addRemoteHistory('server1', {
      userPrompt: '3',
      command: 'c3',
      executed: true,
      exitCode: 0,
      output: '',
    })

    const saved = JSON.parse(writtenContent)
    expect(saved).toHaveLength(2)
    expect(saved[0].command).toBe('c2') // 最早的被删除
    expect(saved[1].command).toBe('c3')
  })

  it('应该记录 userModified 和 aiGeneratedCommand', async () => {
    mockFs.existsSync.mockReturnValue(false)

    let writtenContent: string = ''
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      writtenContent = content
    })

    const { addRemoteHistory } = await resetRemoteHistoryModule()
    addRemoteHistory('server1', {
      userPrompt: '检查磁盘',
      command: 'df -h /home',
      aiGeneratedCommand: 'df -h',
      userModified: true,
      executed: true,
      exitCode: 0,
      output: '',
    })

    const saved = JSON.parse(writtenContent)
    expect(saved[0].userModified).toBe(true)
    expect(saved[0].aiGeneratedCommand).toBe('df -h')
    expect(saved[0].command).toBe('df -h /home')
  })
})

// ============================================================================
// clearRemoteHistory 测试
// ============================================================================

describe('clearRemoteHistory', () => {
  it('应该删除历史文件', async () => {
    mockFs.existsSync.mockReturnValue(true)

    const { clearRemoteHistory } = await resetRemoteHistoryModule()
    clearRemoteHistory('server1')

    expect(mockFs.unlinkSync).toHaveBeenCalled()
  })

  it('文件不存在时应该不报错', async () => {
    mockFs.existsSync.mockReturnValue(false)

    const { clearRemoteHistory } = await resetRemoteHistoryModule()

    expect(() => clearRemoteHistory('server1')).not.toThrow()
    expect(mockFs.unlinkSync).not.toHaveBeenCalled()
  })
})

// ============================================================================
// formatRemoteHistoryForAI 测试
// ============================================================================

describe('formatRemoteHistoryForAI', () => {
  it('应该格式化远程命令历史供 AI 使用', async () => {
    const history = [
      {
        userPrompt: '检查磁盘',
        command: 'df -h',
        executed: true,
        exitCode: 0,
        output: '',
        timestamp: '2024-01-01',
      },
    ]
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(history))

    const { formatRemoteHistoryForAI } = await resetRemoteHistoryModule()
    const formatted = formatRemoteHistoryForAI('server1')

    expect(formatted).toContain('检查磁盘')
    expect(formatted).toContain('df -h')
    expect(formatted).toContain('✓')
  })

  it('空历史应该返回空字符串', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([]))

    const { formatRemoteHistoryForAI } = await resetRemoteHistoryModule()
    const formatted = formatRemoteHistoryForAI('server1')

    expect(formatted).toBe('')
  })

  it('失败命令应该显示退出码', async () => {
    const history = [
      {
        userPrompt: '测试',
        command: 'false',
        executed: true,
        exitCode: 1,
        output: '',
        timestamp: '2024-01-01',
      },
    ]
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(history))

    const { formatRemoteHistoryForAI } = await resetRemoteHistoryModule()
    const formatted = formatRemoteHistoryForAI('server1')

    expect(formatted).toContain('✗')
    expect(formatted).toContain('退出码:1')
  })

  it('builtin 命令应该标记未执行', async () => {
    const history = [
      {
        userPrompt: '删除文件',
        command: 'rm -rf *',
        executed: false,
        exitCode: null,
        output: '',
        reason: 'builtin',
        timestamp: '2024-01-01',
      },
    ]
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(history))

    const { formatRemoteHistoryForAI } = await resetRemoteHistoryModule()
    const formatted = formatRemoteHistoryForAI('server1')

    expect(formatted).toContain('builtin')
    expect(formatted).toContain('未执行')
  })

  it('用户修改的命令应该显示 AI 生成和用户修改', async () => {
    const history = [
      {
        userPrompt: '检查磁盘',
        command: 'df -h /home',
        aiGeneratedCommand: 'df -h',
        userModified: true,
        executed: true,
        exitCode: 0,
        output: '',
        timestamp: '2024-01-01',
      },
    ]
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(history))

    const { formatRemoteHistoryForAI } = await resetRemoteHistoryModule()
    const formatted = formatRemoteHistoryForAI('server1')

    expect(formatted).toContain('AI 生成')
    expect(formatted).toContain('df -h')
    expect(formatted).toContain('用户修改')
    expect(formatted).toContain('df -h /home')
  })
})

// ============================================================================
// formatRemoteShellHistoryForAI 测试
// ============================================================================

describe('formatRemoteShellHistoryForAI', () => {
  it('应该格式化远程 Shell 历史供 AI 使用', async () => {
    const items = [
      { cmd: 'ls -la', exit: 0, time: '2024-01-01' },
      { cmd: 'cat /etc/hosts', exit: 0, time: '2024-01-01' },
    ]

    const { formatRemoteShellHistoryForAI } = await resetRemoteHistoryModule()
    const formatted = formatRemoteShellHistoryForAI(items)

    expect(formatted).toContain('ls -la')
    expect(formatted).toContain('cat /etc/hosts')
    expect(formatted).toContain('✓')
  })

  it('空历史应该返回空字符串', async () => {
    const { formatRemoteShellHistoryForAI } = await resetRemoteHistoryModule()
    const formatted = formatRemoteShellHistoryForAI([])

    expect(formatted).toBe('')
  })

  it('失败命令应该显示退出码', async () => {
    const items = [{ cmd: 'invalid-cmd', exit: 127, time: '2024-01-01' }]

    const { formatRemoteShellHistoryForAI } = await resetRemoteHistoryModule()
    const formatted = formatRemoteShellHistoryForAI(items)

    expect(formatted).toContain('✗')
    expect(formatted).toContain('退出码:127')
  })
})

// ============================================================================
// fetchRemoteShellHistory 测试
// ============================================================================

// ============================================================================
// displayRemoteHistory 测试
// ============================================================================

describe('displayRemoteHistory', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  it('应该显示远程命令历史', async () => {
    const history = [
      {
        userPrompt: '检查磁盘',
        command: 'df -h',
        executed: true,
        exitCode: 0,
        output: '',
        timestamp: '2024-01-01T00:00:00.000Z',
      },
    ]
    mockFs.readFileSync.mockReturnValue(JSON.stringify(history))

    const { displayRemoteHistory } = await resetRemoteHistoryModule()
    displayRemoteHistory('server1')

    expect(consoleLogSpy).toHaveBeenCalled()
    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('server1')
    expect(allCalls).toContain('df -h')
  })

  it('服务器不存在时应该显示错误', async () => {
    mockGetRemote.mockReturnValue(null)

    const { displayRemoteHistory } = await resetRemoteHistoryModule()
    displayRemoteHistory('nonexistent')

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('不存在')
  })

  it('空历史时应该显示提示信息', async () => {
    mockFs.readFileSync.mockReturnValue(JSON.stringify([]))

    const { displayRemoteHistory } = await resetRemoteHistoryModule()
    displayRemoteHistory('server1')

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('暂无命令历史')
  })

  it('应该显示成功和失败的命令状态', async () => {
    const history = [
      {
        userPrompt: '成功命令',
        command: 'ls',
        executed: true,
        exitCode: 0,
        output: '',
        timestamp: '2024-01-01',
      },
      {
        userPrompt: '失败命令',
        command: 'fail',
        executed: true,
        exitCode: 1,
        output: '',
        timestamp: '2024-01-02',
      },
    ]
    mockFs.readFileSync.mockReturnValue(JSON.stringify(history))

    const { displayRemoteHistory } = await resetRemoteHistoryModule()
    displayRemoteHistory('server1')

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('✓')
    expect(allCalls).toContain('✗')
    expect(allCalls).toContain('退出码:1')
  })

  it('应该显示用户修改的命令', async () => {
    const history = [
      {
        userPrompt: '检查磁盘',
        command: 'df -h /home',
        aiGeneratedCommand: 'df -h',
        userModified: true,
        executed: true,
        exitCode: 0,
        output: '',
        timestamp: '2024-01-01',
      },
    ]
    mockFs.readFileSync.mockReturnValue(JSON.stringify(history))

    const { displayRemoteHistory } = await resetRemoteHistoryModule()
    displayRemoteHistory('server1')

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('AI 生成')
    expect(allCalls).toContain('用户修改')
    expect(allCalls).toContain('已修改')
  })

  it('未执行的命令应该显示为未执行状态', async () => {
    const history = [
      {
        userPrompt: '测试',
        command: 'test',
        executed: false,
        exitCode: null,
        output: '',
        timestamp: '2024-01-01',
      },
    ]
    mockFs.readFileSync.mockReturnValue(JSON.stringify(history))

    const { displayRemoteHistory } = await resetRemoteHistoryModule()
    displayRemoteHistory('server1')

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('未执行')
  })
})

// ============================================================================
// displayRemoteShellHistory 测试
// ============================================================================

describe('displayRemoteShellHistory', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  it('应该显示远程 Shell 历史', async () => {
    const shellHistory = [
      '{"cmd":"ls -la","exit":0,"time":"2024-01-01"}',
      '{"cmd":"pwd","exit":0,"time":"2024-01-02"}',
    ]
    mockSshExec.mockResolvedValue({
      stdout: shellHistory.join('\n'),
      stderr: '',
      exitCode: 0,
    })

    const { displayRemoteShellHistory } = await resetRemoteHistoryModule()
    await displayRemoteShellHistory('server1')

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('ls -la')
    expect(allCalls).toContain('pwd')
  })

  it('服务器不存在时应该显示错误', async () => {
    mockGetRemote.mockReturnValue(null)

    const { displayRemoteShellHistory } = await resetRemoteHistoryModule()
    await displayRemoteShellHistory('nonexistent')

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('不存在')
  })

  it('空历史时应该显示提示安装 hook', async () => {
    mockSshExec.mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 0,
    })

    const { displayRemoteShellHistory } = await resetRemoteHistoryModule()
    await displayRemoteShellHistory('server1')

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('暂无 shell 历史')
    expect(allCalls).toContain('hook')
  })

  it('连接失败但有缓存时应该显示缓存内容', async () => {
    mockSshExec.mockRejectedValue(new Error('Connection refused'))
    // 本地有缓存
    const cachedHistory = '{"cmd":"cached-cmd","exit":0,"time":"2024-01-01"}'
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(cachedHistory)

    const { displayRemoteShellHistory } = await resetRemoteHistoryModule()
    await displayRemoteShellHistory('server1')

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    // 应该显示缓存的命令
    expect(allCalls).toContain('cached-cmd')
  })

  it('应该显示成功和失败的命令状态', async () => {
    const shellHistory = [
      '{"cmd":"success","exit":0,"time":"2024-01-01"}',
      '{"cmd":"fail","exit":1,"time":"2024-01-02"}',
    ]
    mockSshExec.mockResolvedValue({
      stdout: shellHistory.join('\n'),
      stderr: '',
      exitCode: 0,
    })

    const { displayRemoteShellHistory } = await resetRemoteHistoryModule()
    await displayRemoteShellHistory('server1')

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('✓')
    expect(allCalls).toContain('✗')
  })
})

// ============================================================================
// clearRemoteShellHistory 测试
// ============================================================================

describe('clearRemoteShellHistory', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  it('应该清空远程 Shell 历史', async () => {
    mockSshExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })
    mockFs.existsSync.mockReturnValue(true)

    const { clearRemoteShellHistory } = await resetRemoteHistoryModule()
    await clearRemoteShellHistory('server1')

    // 验证执行了远程删除命令
    expect(mockSshExec).toHaveBeenCalledWith(
      'server1',
      'rm -f ~/.please/shell_history.jsonl',
      expect.anything()
    )
    // 验证删除了本地缓存
    expect(mockFs.unlinkSync).toHaveBeenCalled()
    // 验证显示成功消息
    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('已清空')
  })

  it('服务器不存在时应该显示错误', async () => {
    mockGetRemote.mockReturnValue(null)

    const { clearRemoteShellHistory } = await resetRemoteHistoryModule()
    await clearRemoteShellHistory('nonexistent')

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('不存在')
  })

  it('本地缓存不存在时不应该报错', async () => {
    mockSshExec.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 })
    mockFs.existsSync.mockReturnValue(false)

    const { clearRemoteShellHistory } = await resetRemoteHistoryModule()
    await clearRemoteShellHistory('server1')

    expect(mockFs.unlinkSync).not.toHaveBeenCalled()
    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('已清空')
  })

  it('SSH 执行失败时应该显示错误信息', async () => {
    mockSshExec.mockRejectedValue(new Error('Permission denied'))

    const { clearRemoteShellHistory } = await resetRemoteHistoryModule()
    await clearRemoteShellHistory('server1')

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('无法清空')
    expect(allCalls).toContain('Permission denied')
  })
})

// ============================================================================
// fetchRemoteShellHistory 测试
// ============================================================================

describe('fetchRemoteShellHistory', () => {
  it('应该从远程服务器获取 Shell 历史', async () => {
    const shellHistoryLines = [
      '{"cmd":"ls -la","exit":0,"time":"2024-01-01"}',
      '{"cmd":"pwd","exit":0,"time":"2024-01-01"}',
    ]
    mockSshExec.mockResolvedValue({
      stdout: shellHistoryLines.join('\n'),
      stderr: '',
      exitCode: 0,
    })

    const { fetchRemoteShellHistory } = await resetRemoteHistoryModule()
    const history = await fetchRemoteShellHistory('server1')

    expect(history).toHaveLength(2)
    expect(history[0].cmd).toBe('ls -la')
    expect(history[1].cmd).toBe('pwd')
  })

  it('SSH 命令失败时应该返回空数组', async () => {
    mockSshExec.mockResolvedValue({
      stdout: '',
      stderr: 'error',
      exitCode: 1,
    })
    // 本地缓存也不存在
    mockFs.existsSync.mockReturnValue(false)

    const { fetchRemoteShellHistory } = await resetRemoteHistoryModule()
    const history = await fetchRemoteShellHistory('server1')

    expect(history).toEqual([])
  })

  it('应该跳过无效的 JSON 行', async () => {
    const shellHistoryLines = [
      '{"cmd":"ls","exit":0,"time":"2024-01-01"}',
      'invalid json line',
      '{"cmd":"pwd","exit":0,"time":"2024-01-01"}',
    ]
    mockSshExec.mockResolvedValue({
      stdout: shellHistoryLines.join('\n'),
      stderr: '',
      exitCode: 0,
    })

    const { fetchRemoteShellHistory } = await resetRemoteHistoryModule()
    const history = await fetchRemoteShellHistory('server1')

    expect(history).toHaveLength(2)
  })

  it('连接失败时应该返回本地缓存', async () => {
    mockSshExec.mockRejectedValue(new Error('Connection refused'))

    // 本地缓存存在
    const cachedHistory = '{"cmd":"cached","exit":0,"time":"2024-01-01"}'
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(cachedHistory)

    const { fetchRemoteShellHistory } = await resetRemoteHistoryModule()
    const history = await fetchRemoteShellHistory('server1')

    expect(history).toHaveLength(1)
    expect(history[0].cmd).toBe('cached')
  })
})
