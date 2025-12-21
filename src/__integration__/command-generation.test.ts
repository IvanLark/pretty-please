/**
 * 命令生成工作流集成测试
 * 测试用户输入 → AI生成 → 确认 → 执行 → 成功/失败 的完整流程
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
    statSync: vi.fn(),
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
import { getConfig, saveConfig } from '../config.js'
import { sshExec, getRemote, testRemoteConnection } from '../remote.js'

const mockFs = vi.mocked(fs)
const mockOs = vi.mocked(os)
const mockGetConfig = vi.mocked(getConfig)
const mockSaveConfig = vi.mocked(saveConfig)
const mockSshExec = vi.mocked(sshExec)
const mockGetRemote = vi.mocked(getRemote)
const mockTestRemoteConnection = vi.mocked(testRemoteConnection)

// 重置模块辅助函数
async function resetModules() {
  vi.resetModules()
  return {
    alias: await import('../alias.js'),
    history: await import('../history.js'),
    remoteHistory: await import('../remote-history.js'),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockOs.homedir.mockReturnValue('/home/testuser')
  mockOs.platform.mockReturnValue('linux')
  mockFs.mkdirSync.mockImplementation(() => undefined)
  mockFs.writeFileSync.mockImplementation(() => {})
  mockFs.existsSync.mockReturnValue(true)
  mockFs.readFileSync.mockReturnValue(JSON.stringify([]))
  mockSaveConfig.mockImplementation(() => {})

  // 重置配置
  Object.assign(mockConfig, {
    aliases: {},
    commandHistoryLimit: 50,
    shellHistoryLimit: 20,
    shellHook: false,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ============================================================================
// 基础命令生成流程测试
// ============================================================================

describe('基础命令生成流程', () => {
  it('用户输入 → 历史记录 → 成功执行', async () => {
    let savedHistory: any[] = []
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      if (path.toString().includes('history.json')) {
        savedHistory = JSON.parse(content)
      }
    })

    const { history } = await resetModules()

    // 模拟完整流程: 用户输入 "检查磁盘" → AI 生成 "df -h" → 执行成功
    history.addHistory({
      userPrompt: '检查磁盘',
      command: 'df -h',
      executed: true,
      exitCode: 0,
      output: 'Filesystem      Size  Used Avail Use%',
    })

    expect(savedHistory.length).toBe(1)
    expect(savedHistory[0].userPrompt).toBe('检查磁盘')
    expect(savedHistory[0].command).toBe('df -h')
    expect(savedHistory[0].executed).toBe(true)
    expect(savedHistory[0].exitCode).toBe(0)
    expect(savedHistory[0].timestamp).toBeDefined()
  })

  it('命令执行失败应该记录退出码', async () => {
    let savedHistory: any[] = []
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      if (path.toString().includes('history.json')) {
        savedHistory = JSON.parse(content)
      }
    })

    const { history } = await resetModules()

    // 模拟执行失败
    history.addHistory({
      userPrompt: '查找文件',
      command: 'find /nonexistent -name "*.txt"',
      executed: true,
      exitCode: 1,
      output: 'find: /nonexistent: No such file or directory',
    })

    expect(savedHistory[0].exitCode).toBe(1)
    expect(savedHistory[0].output).toContain('No such file or directory')
  })

  it('用户拒绝执行应该记录为未执行', async () => {
    let savedHistory: any[] = []
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      if (path.toString().includes('history.json')) {
        savedHistory = JSON.parse(content)
      }
    })

    const { history } = await resetModules()

    // 用户拒绝执行
    history.addHistory({
      userPrompt: '删除所有文件',
      command: 'rm -rf *',
      executed: false,
      exitCode: null,
      output: '',
      reason: 'user_rejected',
    })

    expect(savedHistory[0].executed).toBe(false)
    expect(savedHistory[0].exitCode).toBeNull()
    expect(savedHistory[0].reason).toBe('user_rejected')
  })
})

// ============================================================================
// 用户编辑流程测试
// ============================================================================

describe('用户编辑命令流程', () => {
  it('用户修改命令应该记录 AI 生成和最终命令', async () => {
    let savedHistory: any[] = []
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      if (path.toString().includes('history.json')) {
        savedHistory = JSON.parse(content)
      }
    })

    const { history } = await resetModules()

    // AI 生成 "df -h"，用户修改为 "df -h /home"
    history.addHistory({
      userPrompt: '检查磁盘',
      command: 'df -h /home',
      aiGeneratedCommand: 'df -h',
      userModified: true,
      executed: true,
      exitCode: 0,
      output: '',
    })

    expect(savedHistory[0].userModified).toBe(true)
    expect(savedHistory[0].aiGeneratedCommand).toBe('df -h')
    expect(savedHistory[0].command).toBe('df -h /home')
  })

  it('格式化历史应该区分 AI 生成和用户修改', async () => {
    mockFs.readFileSync.mockReturnValue(JSON.stringify([
      {
        userPrompt: '检查磁盘',
        command: 'df -h /home',
        aiGeneratedCommand: 'df -h',
        userModified: true,
        executed: true,
        exitCode: 0,
        output: '',
        timestamp: '2024-01-01T10:00:00.000Z',
      },
    ]))

    const { history } = await resetModules()
    const formatted = history.formatHistoryForAI()

    expect(formatted).toContain('AI 生成')
    expect(formatted).toContain('df -h')
    expect(formatted).toContain('用户修改')
    expect(formatted).toContain('df -h /home')
  })
})

// ============================================================================
// 别名解析流程测试
// ============================================================================

describe('别名解析流程', () => {
  it('应该解析简单别名', async () => {
    mockConfig.aliases = {
      disk: { prompt: '检查磁盘空间', description: '磁盘检查' },
    }

    const { alias } = await resetModules()
    const result = alias.resolveAlias('@disk')

    expect(result.resolved).toBe(true)
    expect(result.prompt).toBe('检查磁盘空间')
    expect(result.aliasName).toBe('disk')
  })

  it('应该支持模板参数替换', async () => {
    mockConfig.aliases = {
      deploy: { prompt: '部署 {{env}} 环境到 {{server}}' },
    }

    const { alias } = await resetModules()
    const result = alias.resolveAlias('@deploy env=production server=web1')

    expect(result.resolved).toBe(true)
    expect(result.prompt).toBe('部署 production 环境到 web1')
  })

  it('应该使用默认参数值', async () => {
    mockConfig.aliases = {
      deploy: { prompt: '部署 {{env:staging}} 环境' },
    }

    const { alias } = await resetModules()
    const result = alias.resolveAlias('@deploy')

    expect(result.prompt).toBe('部署 staging 环境')
  })

  it('缺少必填参数应该抛出错误', async () => {
    mockConfig.aliases = {
      deploy: { prompt: '部署 {{env}} 环境' },
    }

    const { alias } = await resetModules()

    expect(() => alias.resolveAlias('@deploy'))
      .toThrow('缺少必填参数: env')
  })

  it('额外参数应该追加到 prompt', async () => {
    mockConfig.aliases = {
      list: { prompt: '列出文件' },
    }

    const { alias } = await resetModules()
    const result = alias.resolveAlias('@list -la /home')

    expect(result.prompt).toBe('列出文件 -la /home')
  })
})

// ============================================================================
// 远程执行流程测试
// ============================================================================

describe('远程执行流程', () => {
  it('远程执行成功应该记录到远程历史', async () => {
    mockGetRemote.mockReturnValue({
      host: '192.168.1.100',
      user: 'root',
      port: 22,
    } as any)
    mockSshExec.mockResolvedValue({
      stdout: 'output',
      stderr: '',
      exitCode: 0,
    })

    let savedHistory: any[] = []
    mockFs.existsSync.mockReturnValue(false) // 历史文件不存在
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      savedHistory = JSON.parse(content)
    })

    const { remoteHistory } = await resetModules()

    remoteHistory.addRemoteHistory('server1', {
      userPrompt: '检查磁盘',
      command: 'df -h',
      executed: true,
      exitCode: 0,
      output: 'output',
    })

    expect(savedHistory.length).toBe(1)
    expect(savedHistory[0].command).toBe('df -h')
    expect(savedHistory[0].exitCode).toBe(0)
  })

  it('远程执行失败应该记录错误信息', async () => {
    mockGetRemote.mockReturnValue({
      host: '192.168.1.100',
      user: 'root',
      port: 22,
    } as any)

    let savedHistory: any[] = []
    mockFs.existsSync.mockReturnValue(false)
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      savedHistory = JSON.parse(content)
    })

    const { remoteHistory } = await resetModules()

    remoteHistory.addRemoteHistory('server1', {
      userPrompt: '检查服务状态',
      command: 'systemctl status nginx',
      executed: true,
      exitCode: 3,
      output: 'nginx.service - A high performance web server\n   Active: inactive (dead)',
    })

    expect(savedHistory[0].exitCode).toBe(3)
  })

  it('格式化远程历史应该包含服务器信息', async () => {
    mockGetRemote.mockReturnValue({
      host: '192.168.1.100',
      user: 'root',
      port: 22,
    } as any)

    mockFs.readFileSync.mockReturnValue(JSON.stringify([
      {
        userPrompt: '检查磁盘',
        command: 'df -h',
        executed: true,
        exitCode: 0,
        output: '',
        timestamp: '2024-01-01T10:00:00.000Z',
      },
    ]))

    const { remoteHistory } = await resetModules()
    const formatted = remoteHistory.formatRemoteHistoryForAI('server1')

    expect(formatted).toContain('df -h')
    expect(formatted).toContain('✓')
  })
})

// ============================================================================
// 多步骤命令流程测试
// ============================================================================

describe('多步骤命令流程', () => {
  it('连续命令应该全部记录', async () => {
    let savedHistory: any[] = []
    mockFs.existsSync.mockReturnValue(true)
    // 使用 getter 函数来动态返回当前 savedHistory
    mockFs.readFileSync.mockImplementation(() => JSON.stringify(savedHistory))
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      savedHistory = JSON.parse(content)
    })

    const { history } = await resetModules()

    // 步骤 1: git status
    history.addHistory({
      userPrompt: '查看 git 状态',
      command: 'git status',
      executed: true,
      exitCode: 0,
      output: 'On branch main',
    })

    // 步骤 2: git add
    history.addHistory({
      userPrompt: '添加所有文件',
      command: 'git add .',
      executed: true,
      exitCode: 0,
      output: '',
    })

    // 步骤 3: git commit
    history.addHistory({
      userPrompt: '提交更改',
      command: 'git commit -m "update"',
      executed: true,
      exitCode: 0,
      output: '[main abc1234] update',
    })

    expect(savedHistory.length).toBe(3)
    // 检查是否包含所有命令
    const commands = savedHistory.map((h: any) => h.command)
    expect(commands).toContain('git status')
    expect(commands).toContain('git add .')
    expect(commands).toContain('git commit -m "update"')
  })

  it('成功和失败命令都应该记录', async () => {
    let savedHistory: any[] = []
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockImplementation(() => JSON.stringify(savedHistory))
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      savedHistory = JSON.parse(content)
    })

    const { history } = await resetModules()

    // 步骤 1: 成功
    history.addHistory({
      userPrompt: '编译项目',
      command: 'npm run build',
      executed: true,
      exitCode: 0,
      output: 'Build successful',
    })

    // 步骤 2: 失败
    history.addHistory({
      userPrompt: '运行测试',
      command: 'npm test',
      executed: true,
      exitCode: 1,
      output: 'Test failed: 2 assertions failed',
    })

    expect(savedHistory.length).toBe(2)
    // addHistory 使用 unshift，所以最新的在 index 0
    expect(savedHistory[0].exitCode).toBe(1) // npm test (最新)
    expect(savedHistory[1].exitCode).toBe(0) // npm run build
  })
})

// ============================================================================
// 历史数量限制测试
// ============================================================================

describe('历史数量限制', () => {
  it('应该遵守 commandHistoryLimit 配置', async () => {
    mockConfig.commandHistoryLimit = 3

    // 已有 3 条历史（实际存储顺序：newest first）
    let existingHistory = [
      { userPrompt: '1', command: 'c1', executed: true, exitCode: 0, output: '', timestamp: '2024-01-01' },
      { userPrompt: '2', command: 'c2', executed: true, exitCode: 0, output: '', timestamp: '2024-01-02' },
      { userPrompt: '3', command: 'c3', executed: true, exitCode: 0, output: '', timestamp: '2024-01-03' },
    ]

    let savedHistory: any[] = []
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockImplementation(() => JSON.stringify(existingHistory))
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      savedHistory = JSON.parse(content)
      existingHistory = savedHistory // 更新以便后续读取
    })

    const { history } = await resetModules()

    // 添加第 4 条
    history.addHistory({
      userPrompt: '4',
      command: 'c4',
      executed: true,
      exitCode: 0,
      output: '',
    })

    // addHistory 使用 unshift 添加到开头，然后 truncate 从末尾删除
    // [c1, c2, c3] → unshift c4 → [c4, c1, c2, c3] → truncate → [c4, c1, c2]
    // 所以 c3 被删除，不是 c1
    expect(savedHistory.length).toBe(3)
    expect(savedHistory[0].command).toBe('c4') // 最新的在开头
    expect(savedHistory[2].command).toBe('c2') // c3 被删除
  })
})

// ============================================================================
// builtin 命令处理测试
// ============================================================================

describe('builtin 命令处理', () => {
  it('builtin 命令应该标记为未执行', async () => {
    let savedHistory: any[] = []
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      if (path.toString().includes('history.json')) {
        savedHistory = JSON.parse(content)
      }
    })

    const { history } = await resetModules()

    history.addHistory({
      userPrompt: '删除危险文件',
      command: 'rm -rf /',
      executed: false,
      exitCode: null,
      output: '',
      reason: 'builtin',
    })

    expect(savedHistory[0].executed).toBe(false)
    expect(savedHistory[0].reason).toBe('builtin')
  })

  it('格式化历史应该显示 builtin 标记', async () => {
    mockFs.readFileSync.mockReturnValue(JSON.stringify([
      {
        userPrompt: '删除文件',
        command: 'rm -rf /',
        executed: false,
        exitCode: null,
        output: '',
        reason: 'builtin',
        timestamp: '2024-01-01T10:00:00.000Z',
      },
    ]))

    const { history } = await resetModules()
    const formatted = history.formatHistoryForAI()

    expect(formatted).toContain('builtin')
    expect(formatted).toContain('未执行')
  })
})
