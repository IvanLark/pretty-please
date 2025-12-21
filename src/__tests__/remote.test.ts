/**
 * 远程执行器模块测试
 * 测试 SSH 连接管理、远程命令执行、系统信息采集等功能
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock child_process 模块
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))

// Mock fs 模块
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
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
    remotes: {},
    defaultRemote: undefined,
  })),
  saveConfig: vi.fn(),
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

import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import { getConfig, saveConfig, CONFIG_DIR } from '../config.js'
import type { EventEmitter } from 'events'

// 获取 mock 函数引用
const mockSpawn = vi.mocked(spawn)
const mockFs = vi.mocked(fs)
const mockOs = vi.mocked(os)
const mockGetConfig = vi.mocked(getConfig)
const mockSaveConfig = vi.mocked(saveConfig)

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

// 模块状态重置辅助
async function resetRemoteModule() {
  vi.resetModules()
  return await import('../remote.js')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockOs.homedir.mockReturnValue('/home/testuser')
  mockGetConfig.mockReturnValue({
    remotes: {},
    defaultRemote: undefined,
  } as any)
  mockSaveConfig.mockImplementation(() => {})
  mockFs.existsSync.mockReturnValue(true)
  mockFs.writeFileSync.mockImplementation(() => {})
  mockFs.mkdirSync.mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ============================================================================
// 远程服务器管理测试
// ============================================================================

describe('getRemotes', () => {
  it('应该返回所有远程服务器配置', async () => {
    mockGetConfig.mockReturnValue({
      remotes: {
        server1: { host: '192.168.1.100', user: 'root', port: 22 },
        server2: { host: '192.168.1.101', user: 'admin', port: 2222 },
      },
    } as any)

    const { getRemotes } = await resetRemoteModule()
    const remotes = getRemotes()

    expect(Object.keys(remotes)).toHaveLength(2)
    expect(remotes.server1.host).toBe('192.168.1.100')
    expect(remotes.server2.port).toBe(2222)
  })

  it('无远程服务器时应该返回空对象', async () => {
    mockGetConfig.mockReturnValue({} as any)

    const { getRemotes } = await resetRemoteModule()
    const remotes = getRemotes()

    expect(remotes).toEqual({})
  })
})

describe('getRemote', () => {
  it('应该返回指定的远程服务器配置', async () => {
    mockGetConfig.mockReturnValue({
      remotes: {
        myserver: { host: '10.0.0.1', user: 'deploy', port: 22 },
      },
    } as any)

    const { getRemote } = await resetRemoteModule()
    const remote = getRemote('myserver')

    expect(remote).not.toBeNull()
    expect(remote?.host).toBe('10.0.0.1')
    expect(remote?.user).toBe('deploy')
  })

  it('服务器不存在时应该返回 null', async () => {
    mockGetConfig.mockReturnValue({ remotes: {} } as any)

    const { getRemote } = await resetRemoteModule()
    const remote = getRemote('nonexistent')

    expect(remote).toBeNull()
  })
})

// ============================================================================
// addRemote 测试
// ============================================================================

describe('addRemote', () => {
  describe('user@host:port 格式解析', () => {
    it('应该解析 user@host 格式', async () => {
      const { addRemote } = await resetRemoteModule()
      addRemote('test', 'root@192.168.1.100')

      const savedConfig = mockSaveConfig.mock.calls[0][0]
      expect(savedConfig.remotes.test.user).toBe('root')
      expect(savedConfig.remotes.test.host).toBe('192.168.1.100')
      expect(savedConfig.remotes.test.port).toBe(22)
    })

    it('应该解析 user@host:port 格式', async () => {
      const { addRemote } = await resetRemoteModule()
      addRemote('test', 'admin@server.com:2222')

      const savedConfig = mockSaveConfig.mock.calls[0][0]
      expect(savedConfig.remotes.test.user).toBe('admin')
      expect(savedConfig.remotes.test.host).toBe('server.com')
      expect(savedConfig.remotes.test.port).toBe(2222)
    })

    it('应该正确处理 IPv6 地址', async () => {
      const { addRemote } = await resetRemoteModule()
      addRemote('test', 'root@::1:22')

      const savedConfig = mockSaveConfig.mock.calls[0][0]
      expect(savedConfig.remotes.test.host).toBe('::1')
      expect(savedConfig.remotes.test.port).toBe(22)
    })
  })

  describe('验证', () => {
    it('空名称应该抛出错误', async () => {
      const { addRemote } = await resetRemoteModule()

      expect(() => addRemote('', 'root@host'))
        .toThrow('服务器名称不能为空')
    })

    it('无效名称字符应该抛出错误', async () => {
      const { addRemote } = await resetRemoteModule()

      expect(() => addRemote('server name', 'root@host'))
        .toThrow('服务器名称只能包含字母、数字、下划线和连字符')
    })

    it('缺少用户名应该抛出错误', async () => {
      const { addRemote } = await resetRemoteModule()

      expect(() => addRemote('test', 'host.com'))
        .toThrow('用户名不能为空')
    })

    it('缺少主机地址应该抛出错误', async () => {
      const { addRemote } = await resetRemoteModule()

      expect(() => addRemote('test', 'root@'))
        .toThrow('主机地址不能为空')
    })

    it('密钥文件不存在应该抛出错误', async () => {
      mockFs.existsSync.mockImplementation((path: any) => {
        if (path.includes('.ssh/nonexistent')) return false
        return true
      })

      const { addRemote } = await resetRemoteModule()

      expect(() => addRemote('test', 'root@host', { key: '~/.ssh/nonexistent' }))
        .toThrow('密钥文件不存在')
    })

    it('服务器已存在应该抛出错误', async () => {
      mockGetConfig.mockReturnValue({
        remotes: {
          existing: { host: 'host', user: 'root', port: 22 },
        },
      } as any)

      const { addRemote } = await resetRemoteModule()

      expect(() => addRemote('existing', 'root@newhost'))
        .toThrow('服务器 "existing" 已存在')
    })
  })

  describe('选项', () => {
    it('应该保存密钥路径', async () => {
      mockFs.existsSync.mockReturnValue(true)

      const { addRemote } = await resetRemoteModule()
      addRemote('test', 'root@host', { key: '~/.ssh/id_rsa' })

      const savedConfig = mockSaveConfig.mock.calls[0][0]
      expect(savedConfig.remotes.test.key).toBe('~/.ssh/id_rsa')
    })

    it('应该保存密码认证标记', async () => {
      const { addRemote } = await resetRemoteModule()
      addRemote('test', 'root@host', { password: true })

      const savedConfig = mockSaveConfig.mock.calls[0][0]
      expect(savedConfig.remotes.test.password).toBe(true)
    })
  })

  it('应该创建数据目录', async () => {
    mockFs.existsSync.mockReturnValue(false)

    const { addRemote } = await resetRemoteModule()
    addRemote('test', 'root@host')

    expect(mockFs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('test'),
      { recursive: true }
    )
  })
})

// ============================================================================
// removeRemote 测试
// ============================================================================

describe('removeRemote', () => {
  it('应该删除存在的服务器', async () => {
    mockGetConfig.mockReturnValue({
      remotes: {
        myserver: { host: 'host', user: 'root', port: 22 },
      },
    } as any)

    const { removeRemote } = await resetRemoteModule()
    const result = removeRemote('myserver')

    expect(result).toBe(true)
    expect(mockSaveConfig).toHaveBeenCalled()
  })

  it('不存在的服务器应该返回 false', async () => {
    mockGetConfig.mockReturnValue({ remotes: {} } as any)

    const { removeRemote } = await resetRemoteModule()
    const result = removeRemote('nonexistent')

    expect(result).toBe(false)
  })

  it('应该删除数据目录', async () => {
    mockGetConfig.mockReturnValue({
      remotes: {
        myserver: { host: 'host', user: 'root', port: 22 },
      },
    } as any)
    mockFs.existsSync.mockReturnValue(true)

    const { removeRemote } = await resetRemoteModule()
    removeRemote('myserver')

    expect(mockFs.rmSync).toHaveBeenCalledWith(
      expect.stringContaining('myserver'),
      { recursive: true }
    )
  })
})

// ============================================================================
// 工作目录测试
// ============================================================================

describe('setRemoteWorkDir', () => {
  it('应该设置工作目录', async () => {
    mockGetConfig.mockReturnValue({
      remotes: {
        myserver: { host: 'host', user: 'root', port: 22 },
      },
    } as any)

    const { setRemoteWorkDir } = await resetRemoteModule()
    setRemoteWorkDir('myserver', '/home/deploy/app')

    const savedConfig = mockSaveConfig.mock.calls[0][0]
    expect(savedConfig.remotes.myserver.workDir).toBe('/home/deploy/app')
  })

  it('应该清除工作目录（传入空字符串或 -）', async () => {
    mockGetConfig.mockReturnValue({
      remotes: {
        myserver: { host: 'host', user: 'root', port: 22, workDir: '/old' },
      },
    } as any)

    const { setRemoteWorkDir } = await resetRemoteModule()
    setRemoteWorkDir('myserver', '-')

    const savedConfig = mockSaveConfig.mock.calls[0][0]
    expect(savedConfig.remotes.myserver.workDir).toBeUndefined()
  })

  it('服务器不存在应该抛出错误', async () => {
    mockGetConfig.mockReturnValue({ remotes: {} } as any)

    const { setRemoteWorkDir } = await resetRemoteModule()

    expect(() => setRemoteWorkDir('nonexistent', '/path'))
      .toThrow('远程服务器 "nonexistent" 不存在')
  })
})

describe('getRemoteWorkDir', () => {
  it('应该返回工作目录', async () => {
    mockGetConfig.mockReturnValue({
      remotes: {
        myserver: { host: 'host', user: 'root', port: 22, workDir: '/home/app' },
      },
    } as any)

    const { getRemoteWorkDir } = await resetRemoteModule()
    const workDir = getRemoteWorkDir('myserver')

    expect(workDir).toBe('/home/app')
  })

  it('无工作目录应该返回 undefined', async () => {
    mockGetConfig.mockReturnValue({
      remotes: {
        myserver: { host: 'host', user: 'root', port: 22 },
      },
    } as any)

    const { getRemoteWorkDir } = await resetRemoteModule()
    const workDir = getRemoteWorkDir('myserver')

    expect(workDir).toBeUndefined()
  })
})

// ============================================================================
// sshExec 测试
// ============================================================================

describe('sshExec', () => {
  it('服务器不存在应该抛出错误', async () => {
    mockGetConfig.mockReturnValue({ remotes: {} } as any)

    const { sshExec } = await resetRemoteModule()

    await expect(sshExec('nonexistent', 'ls'))
      .rejects.toThrow('远程服务器 "nonexistent" 不存在')
  })

  it('应该执行 SSH 命令并返回结果', async () => {
    mockGetConfig.mockReturnValue({
      remotes: {
        myserver: { host: 'host', user: 'root', port: 22 },
      },
    } as any)
    mockFs.existsSync.mockReturnValue(false) // No ControlMaster socket

    const mockChild = createMockChildProcess({
      stdout: 'command output\n',
      exitCode: 0,
    })
    mockSpawn.mockReturnValue(mockChild as any)

    const { sshExec } = await resetRemoteModule()
    const result = await sshExec('myserver', 'ls -la')

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('command output')
  })

  it('应该处理命令失败', async () => {
    mockGetConfig.mockReturnValue({
      remotes: {
        myserver: { host: 'host', user: 'root', port: 22 },
      },
    } as any)
    mockFs.existsSync.mockReturnValue(false)

    const mockChild = createMockChildProcess({
      stderr: 'command not found',
      exitCode: 127,
    })
    mockSpawn.mockReturnValue(mockChild as any)

    const { sshExec } = await resetRemoteModule()
    const result = await sshExec('myserver', 'invalid-command')

    expect(result.exitCode).toBe(127)
    expect(result.stderr).toContain('command not found')
  })

  it('应该调用 onStdout 回调', async () => {
    mockGetConfig.mockReturnValue({
      remotes: {
        myserver: { host: 'host', user: 'root', port: 22 },
      },
    } as any)
    mockFs.existsSync.mockReturnValue(false)

    const mockChild = createMockChildProcess({
      stdout: 'streaming output',
      exitCode: 0,
    })
    mockSpawn.mockReturnValue(mockChild as any)

    const stdoutData: string[] = []
    const { sshExec } = await resetRemoteModule()
    await sshExec('myserver', 'ls', {
      onStdout: (data) => stdoutData.push(data),
    })

    expect(stdoutData.length).toBeGreaterThan(0)
  })

  it('应该使用自定义端口', async () => {
    mockGetConfig.mockReturnValue({
      remotes: {
        myserver: { host: 'host', user: 'root', port: 2222 },
      },
    } as any)
    mockFs.existsSync.mockReturnValue(false)

    const mockChild = createMockChildProcess({ stdout: '', exitCode: 0 })
    mockSpawn.mockReturnValue(mockChild as any)

    const { sshExec } = await resetRemoteModule()
    await sshExec('myserver', 'ls')

    expect(mockSpawn).toHaveBeenCalledWith(
      'ssh',
      expect.arrayContaining(['-p', '2222']),
      expect.any(Object)
    )
  })

  it('应该使用密钥文件', async () => {
    mockGetConfig.mockReturnValue({
      remotes: {
        myserver: { host: 'host', user: 'root', port: 22, key: '~/.ssh/mykey' },
      },
    } as any)
    mockFs.existsSync.mockReturnValue(false)

    const mockChild = createMockChildProcess({ stdout: '', exitCode: 0 })
    mockSpawn.mockReturnValue(mockChild as any)

    const { sshExec } = await resetRemoteModule()
    await sshExec('myserver', 'ls')

    expect(mockSpawn).toHaveBeenCalledWith(
      'ssh',
      expect.arrayContaining(['-i', '/home/testuser/.ssh/mykey']),
      expect.any(Object)
    )
  })
})

// ============================================================================
// testRemoteConnection 测试
// ============================================================================

describe('testRemoteConnection', () => {
  it('连接成功应该返回 success: true', async () => {
    mockGetConfig.mockReturnValue({
      remotes: {
        myserver: { host: 'host', user: 'root', port: 22 },
      },
    } as any)
    mockFs.existsSync.mockReturnValue(false)

    const mockChild = createMockChildProcess({
      stdout: 'pls-connection-test\n',
      exitCode: 0,
    })
    mockSpawn.mockReturnValue(mockChild as any)

    const { testRemoteConnection } = await resetRemoteModule()
    const result = await testRemoteConnection('myserver')

    expect(result.success).toBe(true)
  })

  it('连接失败应该返回 success: false', async () => {
    mockGetConfig.mockReturnValue({
      remotes: {
        myserver: { host: 'host', user: 'root', port: 22 },
      },
    } as any)
    mockFs.existsSync.mockReturnValue(false)

    const mockChild = createMockChildProcess({
      stderr: 'Connection refused',
      exitCode: 255,
    })
    mockSpawn.mockReturnValue(mockChild as any)

    const { testRemoteConnection } = await resetRemoteModule()
    const result = await testRemoteConnection('myserver')

    expect(result.success).toBe(false)
  })
})

// ============================================================================
// 系统信息采集测试
// ============================================================================

describe('getRemoteSysInfo', () => {
  it('应该返回缓存的系统信息', async () => {
    const cachedInfo = {
      os: 'Linux',
      osVersion: '5.4.0',
      shell: 'bash',
      hostname: 'myhost',
      cachedAt: new Date().toISOString(),
    }
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(cachedInfo))

    const { getRemoteSysInfo } = await resetRemoteModule()
    const info = getRemoteSysInfo('myserver')

    expect(info).not.toBeNull()
    expect(info?.os).toBe('Linux')
    expect(info?.shell).toBe('bash')
  })

  it('缓存不存在应该返回 null', async () => {
    mockFs.existsSync.mockReturnValue(false)

    const { getRemoteSysInfo } = await resetRemoteModule()
    const info = getRemoteSysInfo('myserver')

    expect(info).toBeNull()
  })

  it('JSON 损坏应该返回 null', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('{invalid json')

    const { getRemoteSysInfo } = await resetRemoteModule()
    const info = getRemoteSysInfo('myserver')

    expect(info).toBeNull()
  })
})

describe('collectRemoteSysInfo', () => {
  it('应该使用未过期的缓存', async () => {
    const cachedInfo = {
      os: 'Linux',
      osVersion: '5.4.0',
      shell: 'bash',
      hostname: 'myhost',
      cachedAt: new Date().toISOString(), // 刚刚缓存
    }
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(cachedInfo))

    const { collectRemoteSysInfo } = await resetRemoteModule()
    const info = await collectRemoteSysInfo('myserver')

    expect(info.os).toBe('Linux')
    // 不应该执行 SSH
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('force=true 应该忽略缓存', async () => {
    mockGetConfig.mockReturnValue({
      remotes: {
        myserver: { host: 'host', user: 'root', port: 22 },
      },
    } as any)

    // 有缓存但 force=true
    const cachedInfo = {
      os: 'Linux',
      osVersion: '5.4.0',
      shell: 'bash',
      hostname: 'oldhost',
      cachedAt: new Date().toISOString(),
    }
    mockFs.existsSync.mockImplementation((path: any) => {
      if (path.includes('sysinfo.json')) return true
      if (path.includes('ssh.sock')) return false
      return true
    })
    mockFs.readFileSync.mockReturnValue(JSON.stringify(cachedInfo))

    const mockChild = createMockChildProcess({
      stdout: 'OS:Linux\nOS_VERSION:5.10.0\nSHELL:zsh\nHOSTNAME:newhost\n',
      exitCode: 0,
    })
    mockSpawn.mockReturnValue(mockChild as any)

    const { collectRemoteSysInfo } = await resetRemoteModule()
    const info = await collectRemoteSysInfo('myserver', true)

    expect(info.hostname).toBe('newhost')
    expect(mockSpawn).toHaveBeenCalled()
  })

  it('缓存过期应该重新采集', async () => {
    mockGetConfig.mockReturnValue({
      remotes: {
        myserver: { host: 'host', user: 'root', port: 22 },
      },
    } as any)

    // 缓存 10 天前
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    const cachedInfo = {
      os: 'Linux',
      osVersion: '5.4.0',
      shell: 'bash',
      hostname: 'oldhost',
      cachedAt: oldDate,
    }
    mockFs.existsSync.mockImplementation((path: any) => {
      if (path.includes('sysinfo.json')) return true
      if (path.includes('ssh.sock')) return false
      return true
    })
    mockFs.readFileSync.mockReturnValue(JSON.stringify(cachedInfo))

    const mockChild = createMockChildProcess({
      stdout: 'OS:Linux\nOS_VERSION:5.10.0\nSHELL:zsh\nHOSTNAME:newhost\n',
      exitCode: 0,
    })
    mockSpawn.mockReturnValue(mockChild as any)

    const { collectRemoteSysInfo } = await resetRemoteModule()
    const info = await collectRemoteSysInfo('myserver')

    expect(info.hostname).toBe('newhost')
  })
})

describe('formatRemoteSysInfoForAI', () => {
  it('应该格式化系统信息供 AI 使用', async () => {
    mockGetConfig.mockReturnValue({
      remotes: {
        myserver: { host: '192.168.1.100', user: 'root', port: 22 },
      },
    } as any)

    const sysInfo = {
      os: 'Linux',
      osVersion: '5.4.0',
      shell: 'bash',
      hostname: 'myhost',
      cachedAt: new Date().toISOString(),
    }

    const { formatRemoteSysInfoForAI } = await resetRemoteModule()
    const formatted = formatRemoteSysInfoForAI('myserver', sysInfo)

    expect(formatted).toContain('myserver')
    expect(formatted).toContain('root@192.168.1.100')
    expect(formatted).toContain('Linux 5.4.0')
    expect(formatted).toContain('bash')
  })

  it('应该包含工作目录信息', async () => {
    mockGetConfig.mockReturnValue({
      remotes: {
        myserver: { host: 'host', user: 'root', port: 22, workDir: '/home/app' },
      },
    } as any)

    const sysInfo = {
      os: 'Linux',
      osVersion: '5.4.0',
      shell: 'bash',
      hostname: 'myhost',
      cachedAt: new Date().toISOString(),
    }

    const { formatRemoteSysInfoForAI } = await resetRemoteModule()
    const formatted = formatRemoteSysInfoForAI('myserver', sysInfo)

    expect(formatted).toContain('/home/app')
  })

  it('服务器不存在应该返回空字符串', async () => {
    mockGetConfig.mockReturnValue({ remotes: {} } as any)

    const sysInfo = {
      os: 'Linux',
      osVersion: '5.4.0',
      shell: 'bash',
      hostname: 'myhost',
      cachedAt: new Date().toISOString(),
    }

    const { formatRemoteSysInfoForAI } = await resetRemoteModule()
    const formatted = formatRemoteSysInfoForAI('nonexistent', sysInfo)

    expect(formatted).toBe('')
  })
})

// ============================================================================
// closeControlMaster 测试
// ============================================================================

describe('closeControlMaster', () => {
  it('服务器不存在应该直接返回', async () => {
    mockGetConfig.mockReturnValue({ remotes: {} } as any)

    const { closeControlMaster } = await resetRemoteModule()
    await closeControlMaster('nonexistent')

    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('socket 不存在应该直接返回', async () => {
    mockGetConfig.mockReturnValue({
      remotes: {
        myserver: { host: 'host', user: 'root', port: 22 },
      },
    } as any)
    mockFs.existsSync.mockReturnValue(false)

    const { closeControlMaster } = await resetRemoteModule()
    await closeControlMaster('myserver')

    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('应该执行 ssh -O exit 关闭连接', async () => {
    mockGetConfig.mockReturnValue({
      remotes: {
        myserver: { host: 'host', user: 'root', port: 22 },
      },
    } as any)
    mockFs.existsSync.mockReturnValue(true)

    const mockChild = createMockChildProcess({ exitCode: 0 })
    mockSpawn.mockReturnValue(mockChild as any)

    const { closeControlMaster } = await resetRemoteModule()
    await closeControlMaster('myserver')

    expect(mockSpawn).toHaveBeenCalledWith(
      'ssh',
      expect.arrayContaining(['-O', 'exit']),
      expect.any(Object)
    )
  })
})
