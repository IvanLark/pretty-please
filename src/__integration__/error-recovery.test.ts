/**
 * 错误恢复集成测试
 * 测试各种错误场景下的恢复机制：文件损坏、权限错误、网络超时、SSH断连等
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock child_process 模块
vi.mock('child_process', () => ({
  exec: vi.fn(),
  execSync: vi.fn(),
  spawn: vi.fn(),
}))

// Mock fs 模块
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
    rmSync: vi.fn(),
    statSync: vi.fn(),
    copyFileSync: vi.fn(),
  },
}))

// Mock os 模块
vi.mock('os', () => ({
  default: {
    homedir: vi.fn(() => '/home/testuser'),
    platform: vi.fn(() => 'linux'),
    type: vi.fn(() => 'Linux'),
    release: vi.fn(() => '5.4.0'),
    arch: vi.fn(() => 'x64'),
    userInfo: vi.fn(() => ({ username: 'testuser' })),
    hostname: vi.fn(() => 'testhost'),
  },
}))

// Mock config 模块
const mockConfig = {
  aliases: {},
  commandHistoryLimit: 50,
  shellHistoryLimit: 20,
  shellHook: false,
  remotes: {},
}

vi.mock('../config.js', () => ({
  getConfig: vi.fn(() => mockConfig),
  saveConfig: vi.fn(),
  CONFIG_DIR: '/home/testuser/.please',
}))

// Mock remote 模块
vi.mock('../remote.js', () => ({
  sshExec: vi.fn(),
  getRemote: vi.fn(),
  getRemotes: vi.fn(() => ({})),
  testRemoteConnection: vi.fn(),
  collectRemoteSysInfo: vi.fn(),
}))

// Mock theme 模块
vi.mock('../ui/theme.js', () => ({
  getCurrentTheme: vi.fn(() => ({
    primary: '#007acc',
    secondary: '#6c757d',
    success: '#4caf50',
    error: '#f44336',
    warning: '#ff9800',
    text: { muted: '#666666' },
  })),
}))

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: vi.fn((s: string) => s),
    gray: vi.fn((s: string) => s),
    dim: vi.fn((s: string) => s),
    hex: vi.fn(() => (s: string) => s),
    green: vi.fn((s: string) => s),
    red: vi.fn((s: string) => s),
    yellow: vi.fn((s: string) => s),
  },
}))

import fs from 'fs'
import os from 'os'
import { spawn } from 'child_process'
import { getConfig, saveConfig } from '../config.js'
import { sshExec, getRemote, testRemoteConnection } from '../remote.js'

const mockFs = vi.mocked(fs)
const mockOs = vi.mocked(os)
const mockSpawn = vi.mocked(spawn)
const mockGetConfig = vi.mocked(getConfig)
const mockSaveConfig = vi.mocked(saveConfig)
const mockSshExec = vi.mocked(sshExec)
const mockGetRemote = vi.mocked(getRemote)
const mockTestRemoteConnection = vi.mocked(testRemoteConnection)

// 创建 mock child process
function createMockChildProcess(options: {
  stdout?: string
  stderr?: string
  exitCode?: number
  error?: Error
}) {
  const stdoutCallbacks: ((data: Buffer) => void)[] = []
  const stderrCallbacks: ((data: Buffer) => void)[] = []
  const closeCallbacks: ((code: number) => void)[] = []
  const errorCallbacks: ((err: Error) => void)[] = []

  const mockChild = {
    stdout: {
      on: vi.fn((event: string, cb: (data: Buffer) => void) => {
        if (event === 'data') stdoutCallbacks.push(cb)
      }),
    },
    stderr: {
      on: vi.fn((event: string, cb: (data: Buffer) => void) => {
        if (event === 'data') stderrCallbacks.push(cb)
      }),
    },
    stdin: {
      write: vi.fn(),
      end: vi.fn(),
    },
    on: vi.fn((event: string, cb: any) => {
      if (event === 'close') closeCallbacks.push(cb)
      if (event === 'error') errorCallbacks.push(cb)
    }),
    kill: vi.fn(),
  }

  // 模拟异步执行
  setTimeout(() => {
    if (options.error) {
      errorCallbacks.forEach(cb => cb(options.error!))
    } else {
      if (options.stdout) {
        stdoutCallbacks.forEach(cb => cb(Buffer.from(options.stdout!)))
      }
      if (options.stderr) {
        stderrCallbacks.forEach(cb => cb(Buffer.from(options.stderr!)))
      }
      closeCallbacks.forEach(cb => cb(options.exitCode ?? 0))
    }
  }, 10)

  return mockChild
}

// 重置模块辅助函数
async function resetModules() {
  vi.resetModules()
  return {
    config: await import('../config.js'),
    history: await import('../history.js'),
    shellHook: await import('../shell-hook.js'),
    remoteHistory: await import('../remote-history.js'),
    chatHistory: await import('../chat-history.js'),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockOs.homedir.mockReturnValue('/home/testuser')
  mockOs.platform.mockReturnValue('linux')
  mockFs.mkdirSync.mockImplementation(() => undefined)
  mockFs.writeFileSync.mockImplementation(() => {})
  mockSaveConfig.mockImplementation(() => {})

  // 重置配置
  Object.assign(mockConfig, {
    aliases: {},
    commandHistoryLimit: 50,
    shellHistoryLimit: 20,
    shellHook: false,
    remotes: {},
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ============================================================================
// 配置文件损坏恢复测试
// ============================================================================

describe('配置文件损坏恢复', () => {
  it('JSON 损坏时应该返回默认配置', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('{invalid json content')

    const { history } = await resetModules()
    const historyData = history.getHistory()

    // 应该返回空数组而不是抛出错误
    expect(historyData).toEqual([])
  })

  it('历史文件部分损坏时应该返回有效部分', async () => {
    mockConfig.shellHook = true
    const partiallyCorruptedJsonl = `{"cmd":"valid1","exit":0,"time":"2024-01-01"}
{invalid line
{"cmd":"valid2","exit":0,"time":"2024-01-01"}`

    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(partiallyCorruptedJsonl)

    const { shellHook } = await resetModules()
    const history = shellHook.getShellHistory()

    // 应该返回有效的记录，跳过损坏的行
    expect(history.length).toBe(2)
  })

  it('聊天历史损坏时应该返回空数组', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('not valid json')

    const { chatHistory } = await resetModules()
    const history = chatHistory.getChatHistory()

    expect(history).toEqual([])
  })

  it('远程历史损坏时应该返回空数组', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('{broken')

    const { remoteHistory } = await resetModules()
    const history = remoteHistory.getRemoteHistory('server1')

    expect(history).toEqual([])
  })
})

// ============================================================================
// 权限错误处理测试
// ============================================================================

describe('权限错误处理', () => {
  it('历史文件无读取权限时应该返回空数组', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockImplementation(() => {
      const error = new Error('EACCES: permission denied') as NodeJS.ErrnoException
      error.code = 'EACCES'
      throw error
    })

    const { history } = await resetModules()
    const historyData = history.getHistory()

    expect(historyData).toEqual([])
  })

  it('配置目录无写入权限时应该抛出错误', async () => {
    mockFs.existsSync.mockReturnValue(false)
    mockFs.mkdirSync.mockImplementation(() => {
      const error = new Error('EACCES: permission denied') as NodeJS.ErrnoException
      error.code = 'EACCES'
      throw error
    })

    const { history } = await resetModules()

    // 尝试添加历史记录时应该处理权限错误
    expect(() => history.addHistory({
      userPrompt: 'test',
      command: 'test',
      executed: true,
      exitCode: 0,
      output: '',
    })).toThrow()
  })

  it('历史文件无写入权限时应该抛出错误', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([]))
    mockFs.writeFileSync.mockImplementation(() => {
      const error = new Error('EACCES: permission denied') as NodeJS.ErrnoException
      error.code = 'EACCES'
      throw error
    })

    const { history } = await resetModules()

    expect(() => history.addHistory({
      userPrompt: 'test',
      command: 'test',
      executed: true,
      exitCode: 0,
      output: '',
    })).toThrow()
  })
})

// ============================================================================
// 文件不存在处理测试
// ============================================================================

describe('文件不存在处理', () => {
  it('历史文件不存在时应该返回空数组', async () => {
    mockFs.existsSync.mockReturnValue(false)

    const { history } = await resetModules()
    const historyData = history.getHistory()

    expect(historyData).toEqual([])
  })

  it('Shell 历史文件不存在时应该返回空数组', async () => {
    mockConfig.shellHook = true
    mockFs.existsSync.mockReturnValue(false)

    const { shellHook } = await resetModules()
    const history = shellHook.getShellHistory()

    expect(history).toEqual([])
  })

  it('添加历史时应该自动创建配置目录', async () => {
    mockFs.existsSync.mockReturnValue(false)
    mockFs.readFileSync.mockReturnValue('[]')

    const { history } = await resetModules()
    history.addHistory({
      userPrompt: 'test',
      command: 'test',
      executed: true,
      exitCode: 0,
      output: '',
    })

    expect(mockFs.mkdirSync).toHaveBeenCalled()
  })

  it('远程历史文件不存在时应该返回空数组', async () => {
    mockFs.existsSync.mockReturnValue(false)

    const { remoteHistory } = await resetModules()
    const history = remoteHistory.getRemoteHistory('server1')

    expect(history).toEqual([])
  })
})

// ============================================================================
// SSH 连接错误处理测试
// ============================================================================

describe('SSH 连接错误处理', () => {
  it('SSH 连接超时应该返回错误', async () => {
    mockGetRemote.mockReturnValue({
      host: '192.168.1.100',
      user: 'root',
      port: 22,
    } as any)
    mockSshExec.mockRejectedValue(new Error('ETIMEDOUT'))

    const { remoteHistory } = await resetModules()

    // fetchRemoteShellHistory 应该优雅处理超时
    const history = await remoteHistory.fetchRemoteShellHistory('server1')

    // 应该返回空数组或缓存数据
    expect(Array.isArray(history)).toBe(true)
  })

  it('SSH 认证失败应该返回错误', async () => {
    mockGetRemote.mockReturnValue({
      host: '192.168.1.100',
      user: 'root',
      port: 22,
    } as any)
    mockSshExec.mockRejectedValue(new Error('Permission denied (publickey)'))

    const { remoteHistory } = await resetModules()
    const history = await remoteHistory.fetchRemoteShellHistory('server1')

    expect(Array.isArray(history)).toBe(true)
  })

  it('SSH 命令执行失败应该返回本地缓存', async () => {
    mockGetRemote.mockReturnValue({
      host: '192.168.1.100',
      user: 'root',
      port: 22,
    } as any)
    mockSshExec.mockRejectedValue(new Error('Connection refused'))

    // 设置本地缓存
    const cachedHistory = '{"cmd":"cached","exit":0,"time":"2024-01-01"}'
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(cachedHistory)

    const { remoteHistory } = await resetModules()
    const history = await remoteHistory.fetchRemoteShellHistory('server1')

    expect(history.length).toBe(1)
    expect(history[0].cmd).toBe('cached')
  })
})

// ============================================================================
// 空数据处理测试
// ============================================================================

describe('空数据处理', () => {
  it('格式化空历史应该返回空字符串', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([]))

    const { history } = await resetModules()
    const formatted = history.formatHistoryForAI()

    expect(formatted).toBe('')
  })

  it('格式化空 Shell 历史应该返回空字符串', async () => {
    mockConfig.shellHook = true
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('')

    const { shellHook } = await resetModules()
    const formatted = shellHook.formatShellHistoryForAI()

    expect(formatted).toBe('')
  })

  it('格式化空远程历史应该返回空字符串', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([]))

    const { remoteHistory } = await resetModules()
    const formatted = remoteHistory.formatRemoteHistoryForAI('server1')

    expect(formatted).toBe('')
  })

  it('格式化空远程 Shell 历史应该返回空字符串', async () => {
    const { remoteHistory } = await resetModules()
    const formatted = remoteHistory.formatRemoteShellHistoryForAI([])

    expect(formatted).toBe('')
  })
})

// ============================================================================
// 边界情况处理测试
// ============================================================================

describe('边界情况处理', () => {
  it('超长命令应该正常保存', async () => {
    const longCommand = 'echo ' + 'x'.repeat(10000)

    let savedHistory: any[] = []
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([]))
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      if (path.toString().includes('history.json')) {
        savedHistory = JSON.parse(content)
      }
    })

    const { history } = await resetModules()
    history.addHistory({
      userPrompt: '测试长命令',
      command: longCommand,
      executed: true,
      exitCode: 0,
      output: '',
    })

    expect(savedHistory[0].command).toBe(longCommand)
  })

  it('特殊字符命令应该正常保存', async () => {
    const specialCommand = 'echo "hello\\nworld" | grep \'test\' && rm -rf /tmp/*'

    let savedHistory: any[] = []
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([]))
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      if (path.toString().includes('history.json')) {
        savedHistory = JSON.parse(content)
      }
    })

    const { history } = await resetModules()
    history.addHistory({
      userPrompt: '测试特殊字符',
      command: specialCommand,
      executed: true,
      exitCode: 0,
      output: '',
    })

    expect(savedHistory[0].command).toBe(specialCommand)
  })

  it('Unicode 字符应该正常处理', async () => {
    const unicodePrompt = '检查中文路径 /home/用户/文档'
    const unicodeCommand = 'ls /home/用户/文档'

    let savedHistory: any[] = []
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([]))
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      if (path.toString().includes('history.json')) {
        savedHistory = JSON.parse(content)
      }
    })

    const { history } = await resetModules()
    history.addHistory({
      userPrompt: unicodePrompt,
      command: unicodeCommand,
      executed: true,
      exitCode: 0,
      output: '',
    })

    expect(savedHistory[0].userPrompt).toBe(unicodePrompt)
    expect(savedHistory[0].command).toBe(unicodeCommand)
  })

  it('空 userPrompt 应该正常处理', async () => {
    let savedHistory: any[] = []
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([]))
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      if (path.toString().includes('history.json')) {
        savedHistory = JSON.parse(content)
      }
    })

    const { history } = await resetModules()
    history.addHistory({
      userPrompt: '',
      command: 'ls',
      executed: true,
      exitCode: 0,
      output: '',
    })

    expect(savedHistory[0].userPrompt).toBe('')
    expect(savedHistory[0].command).toBe('ls')
  })

  it('null exitCode 应该正常处理', async () => {
    let savedHistory: any[] = []
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([]))
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      if (path.toString().includes('history.json')) {
        savedHistory = JSON.parse(content)
      }
    })

    const { history } = await resetModules()
    history.addHistory({
      userPrompt: '测试',
      command: 'test',
      executed: false,
      exitCode: null,
      output: '',
    })

    expect(savedHistory[0].exitCode).toBeNull()
  })
})

// ============================================================================
// 清理操作测试
// ============================================================================

describe('清理操作', () => {
  it('clearHistory 应该清空历史文件', async () => {
    let writtenContent = ''
    mockFs.existsSync.mockReturnValue(true)
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      writtenContent = content
    })

    const { history } = await resetModules()
    history.clearHistory()

    expect(JSON.parse(writtenContent)).toEqual([])
  })

  it('clearChatHistory 应该清空聊天历史', async () => {
    let writtenContent = ''
    mockFs.existsSync.mockReturnValue(true)
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      writtenContent = content
    })

    const { chatHistory } = await resetModules()
    chatHistory.clearChatHistory()

    expect(JSON.parse(writtenContent)).toEqual([])
  })

  it('clearRemoteHistory 文件不存在时不应该报错', async () => {
    mockFs.existsSync.mockReturnValue(false)

    const { remoteHistory } = await resetModules()

    expect(() => remoteHistory.clearRemoteHistory('server1')).not.toThrow()
  })
})
