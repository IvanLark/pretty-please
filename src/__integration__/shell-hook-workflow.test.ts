/**
 * Shell Hook 工作流集成测试
 * 测试完整的 Hook 安装、命令记录、配置变更、卸载恢复等工作流
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
    copyFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
    rmSync: vi.fn(),
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
  shellHook: false,
  shellHistoryLimit: 20,
  commandHistoryLimit: 50,
}

vi.mock('../config.js', () => ({
  getConfig: vi.fn(() => mockConfig),
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
import { exec } from 'child_process'
import { getConfig, saveConfig, CONFIG_DIR } from '../config.js'

const mockFs = vi.mocked(fs)
const mockOs = vi.mocked(os)
const mockExec = vi.mocked(exec)
const mockGetConfig = vi.mocked(getConfig)
const mockSaveConfig = vi.mocked(saveConfig)

// 重置模块辅助函数
async function resetModules() {
  vi.resetModules()
  return {
    shellHook: await import('../shell-hook.js'),
    history: await import('../history.js'),
  }
}

// 模拟 Shell 配置文件内容
const ZSHRC_TEMPLATE = `# User configuration
export PATH="/usr/local/bin:$PATH"
alias ll="ls -la"
`

const ZSHRC_WITH_HOOK = `# User configuration
export PATH="/usr/local/bin:$PATH"
alias ll="ls -la"

# >>> pretty-please shell hook >>>
# 此代码块由 pls 自动生成，请勿手动修改
autoload -Uz add-zsh-hook
_pls_preexec() {
  export _PLS_LAST_CMD="$1"
  export _PLS_CMD_START=$(date +%s)
}
_pls_precmd() {
  local exit_code=$?
  # Hook code...
}
add-zsh-hook preexec _pls_preexec
add-zsh-hook precmd _pls_precmd
# <<< pretty-please shell hook <<<
`

// 模拟 Shell 历史记录（JSONL 格式）
const SHELL_HISTORY_JSONL = `{"cmd":"ls -la","exit":0,"time":"2024-01-01T10:00:00.000Z"}
{"cmd":"cd /home","exit":0,"time":"2024-01-01T10:01:00.000Z"}
{"cmd":"git status","exit":0,"time":"2024-01-01T10:02:00.000Z"}
{"cmd":"invalid-command","exit":127,"time":"2024-01-01T10:03:00.000Z"}
{"cmd":"pls check disk","exit":0,"time":"2024-01-01T10:04:00.000Z"}
`

beforeEach(() => {
  vi.clearAllMocks()
  mockOs.homedir.mockReturnValue('/home/testuser')
  mockOs.platform.mockReturnValue('linux')
  mockFs.mkdirSync.mockImplementation(() => undefined)
  mockFs.writeFileSync.mockImplementation(() => {})
  mockFs.appendFileSync.mockImplementation(() => {})
  mockFs.copyFileSync.mockImplementation(() => {})
  mockSaveConfig.mockImplementation(() => {})

  // 重置配置状态
  Object.assign(mockConfig, {
    shellHook: false,
    shellHistoryLimit: 20,
    commandHistoryLimit: 50,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ============================================================================
// 完整安装流程测试
// ============================================================================

describe('Shell Hook 完整安装流程', () => {
  it('首次安装应该: 检测Shell → getHookStatus 返回未安装', async () => {
    // 设置环境: Zsh shell, 配置文件存在但无 Hook
    process.env.SHELL = '/bin/zsh'
    mockConfig.shellHook = false
    mockFs.existsSync.mockImplementation((path: any) => {
      if (path.includes('.zshrc')) return true
      if (path.includes('.please')) return true
      if (path.includes('shell_history')) return false
      return false
    })
    mockFs.readFileSync.mockImplementation((path: any) => {
      if (path.toString().includes('.zshrc')) return ZSHRC_TEMPLATE
      return ''
    })

    const { shellHook } = await resetModules()

    // 验证 Hook 状态检测
    const status = shellHook.getHookStatus()

    expect(status.installed).toBe(false)
  })

  it('已安装时 getHookStatus 应该返回 installed: true', async () => {
    process.env.SHELL = '/bin/zsh'
    mockConfig.shellHook = true
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockImplementation((path: any) => {
      if (path.toString().includes('.zshrc')) return ZSHRC_WITH_HOOK
      return ''
    })

    const { shellHook } = await resetModules()

    // 检测是否已安装
    const status = shellHook.getHookStatus()

    expect(status.installed).toBe(true)
  })

  it('Zsh 应该使用 .zshrc 配置文件', async () => {
    const { shellHook } = await resetModules()

    // Zsh (跨平台)
    expect(shellHook.getShellConfigPath('zsh')).toContain('.zshrc')
  })
})

// ============================================================================
// 命令记录流程测试
// ============================================================================

describe('命令记录流程', () => {
  it('应该正确解析 JSONL 格式的 Shell 历史', async () => {
    mockConfig.shellHook = true
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(SHELL_HISTORY_JSONL)

    const { shellHook } = await resetModules()
    const history = shellHook.getShellHistory()

    expect(history.length).toBeGreaterThan(0)
    expect(history[0]).toHaveProperty('cmd')
    expect(history[0]).toHaveProperty('exit')
    expect(history[0]).toHaveProperty('time')
  })

  it('shellHook 未启用时应该返回空数组', async () => {
    mockConfig.shellHook = false

    const { shellHook } = await resetModules()
    const history = shellHook.getShellHistory()

    expect(history).toEqual([])
  })

  it('历史文件不存在时应该返回空数组', async () => {
    mockConfig.shellHook = true
    mockFs.existsSync.mockReturnValue(false)

    const { shellHook } = await resetModules()
    const history = shellHook.getShellHistory()

    expect(history).toEqual([])
  })

  it('应该按 shellHistoryLimit 限制返回数量', async () => {
    mockConfig.shellHook = true
    mockConfig.shellHistoryLimit = 3

    // 创建 10 条历史记录
    const manyRecords = Array.from({ length: 10 }, (_, i) =>
      JSON.stringify({ cmd: `cmd${i}`, exit: 0, time: new Date().toISOString() })
    ).join('\n')

    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(manyRecords)

    const { shellHook } = await resetModules()
    const history = shellHook.getShellHistory()

    expect(history.length).toBeLessThanOrEqual(3)
  })

  it('应该跳过无效的 JSON 行', async () => {
    mockConfig.shellHook = true
    const invalidJsonl = `{"cmd":"valid1","exit":0,"time":"2024-01-01"}
invalid line here
{"cmd":"valid2","exit":0,"time":"2024-01-01"}
{broken json
{"cmd":"valid3","exit":0,"time":"2024-01-01"}`

    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(invalidJsonl)

    const { shellHook } = await resetModules()
    const history = shellHook.getShellHistory()

    expect(history.length).toBe(3) // 只有 3 条有效记录
  })
})

// ============================================================================
// AI 格式化流程测试
// ============================================================================

describe('Shell 历史 AI 格式化', () => {
  it('formatShellHistoryForAI 应该包含命令和状态', async () => {
    mockConfig.shellHook = true
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(SHELL_HISTORY_JSONL)

    const { shellHook } = await resetModules()
    const formatted = shellHook.formatShellHistoryForAI()

    expect(formatted).toContain('ls -la')
    expect(formatted).toContain('git status')
  })

  it('失败命令应该显示退出码', async () => {
    mockConfig.shellHook = true
    const failedCommand = `{"cmd":"invalid-command","exit":127,"time":"2024-01-01"}`
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(failedCommand)

    const { shellHook } = await resetModules()
    const formatted = shellHook.formatShellHistoryForAI()

    expect(formatted).toContain('127')
  })

  it('空历史应该返回空字符串', async () => {
    mockConfig.shellHook = true
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('')

    const { shellHook } = await resetModules()
    const formatted = shellHook.formatShellHistoryForAI()

    expect(formatted).toBe('')
  })
})

// ============================================================================
// pls 命令历史与 Shell 历史关联测试
// ============================================================================

describe('pls 命令历史与 Shell 历史关联', () => {
  it('addHistory 应该记录用户修改标记', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([]))

    let savedHistory: any[] = []
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      if (path.toString().includes('history.json')) {
        savedHistory = JSON.parse(content)
      }
    })

    const { history } = await resetModules()
    history.addHistory({
      userPrompt: '检查磁盘',
      command: 'df -h /home',
      aiGeneratedCommand: 'df -h',
      userModified: true,
      executed: true,
      exitCode: 0,
      output: '',
    })

    expect(savedHistory.length).toBe(1)
    expect(savedHistory[0].userModified).toBe(true)
    expect(savedHistory[0].aiGeneratedCommand).toBe('df -h')
  })

  it('addHistory 应该记录 builtin 原因', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([]))

    let savedHistory: any[] = []
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      if (path.toString().includes('history.json')) {
        savedHistory = JSON.parse(content)
      }
    })

    const { history } = await resetModules()
    history.addHistory({
      userPrompt: '删除文件',
      command: 'rm -rf important',
      executed: false,
      exitCode: null,
      output: '',
      reason: 'builtin',
    })

    expect(savedHistory[0].executed).toBe(false)
    expect(savedHistory[0].reason).toBe('builtin')
  })
})

// ============================================================================
// 配置变更流程测试
// ============================================================================

describe('配置变更影响 Hook 行为', () => {
  it('修改 shellHistoryLimit 应该影响历史返回数量', async () => {
    mockConfig.shellHook = true

    // 创建 50 条记录
    const records = Array.from({ length: 50 }, (_, i) =>
      JSON.stringify({ cmd: `cmd${i}`, exit: 0, time: new Date().toISOString() })
    ).join('\n')
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(records)

    // 限制为 10
    mockConfig.shellHistoryLimit = 10
    const { shellHook } = await resetModules()
    const history10 = shellHook.getShellHistory()
    expect(history10.length).toBeLessThanOrEqual(10)

    // 限制为 30
    mockConfig.shellHistoryLimit = 30
    const { shellHook: shellHook2 } = await resetModules()
    const history30 = shellHook2.getShellHistory()
    expect(history30.length).toBeLessThanOrEqual(30)
  })
})

// ============================================================================
// Shell 检测测试
// ============================================================================

describe('Shell 类型检测', () => {
  it('应该从 SHELL 环境变量检测 Zsh', async () => {
    process.env.SHELL = '/bin/zsh'
    const { shellHook } = await resetModules()

    expect(shellHook.detectShell()).toBe('zsh')
  })

  it('应该从 SHELL 环境变量检测 Bash', async () => {
    process.env.SHELL = '/bin/bash'
    const { shellHook } = await resetModules()

    expect(shellHook.detectShell()).toBe('bash')
  })

  it('getShellConfigPath 对于不支持的 Shell 应该返回 null', async () => {
    const { shellHook } = await resetModules()

    // 'cmd' 不是支持的 shell
    const path = shellHook.getShellConfigPath('cmd' as any)

    expect(path).toBeNull()
  })
})
