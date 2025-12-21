/**
 * 远程 Shell Hook 测试
 * 测试远程服务器上的 Hook 安装/卸载、状态检测等功能
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    hex: vi.fn(() => (s: string) => s),
    gray: vi.fn((s: string) => s),
    bold: vi.fn((s: string) => s),
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
}))

import {
  detectRemoteShell,
  checkRemoteHookInstalled,
  installRemoteShellHook,
  uninstallRemoteShellHook,
  getRemoteHookStatus,
  getRemoteShellConfigPath,
  generateRemoteHookScript,
} from '../shell-hook.js'

// 类型定义
type SshExecFn = (cmd: string) => Promise<{ stdout: string; exitCode: number }>

// 创建 mock SSH 执行函数的工厂
function createMockSshExec(responses: Record<string, { stdout: string; exitCode: number }>): SshExecFn {
  return vi.fn(async (cmd: string) => {
    // 尝试精确匹配
    if (responses[cmd]) {
      return responses[cmd]
    }
    // 尝试部分匹配
    for (const [pattern, response] of Object.entries(responses)) {
      if (cmd.includes(pattern)) {
        return response
      }
    }
    // 默认返回成功
    return { stdout: '', exitCode: 0 }
  })
}

// 创建一个会抛出错误的 mock SSH 执行函数
function createErrorSshExec(error: Error): SshExecFn {
  return vi.fn(async () => {
    throw error
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ============================================================================
// detectRemoteShell 测试
// ============================================================================

describe('detectRemoteShell', () => {
  it('应该正确检测到 zsh', async () => {
    const mockSshExec = createMockSshExec({
      'basename "$SHELL"': { stdout: 'zsh\n', exitCode: 0 },
    })

    const shell = await detectRemoteShell(mockSshExec)

    expect(shell).toBe('zsh')
    expect(mockSshExec).toHaveBeenCalledWith('basename "$SHELL"')
  })

  it('应该正确检测到 bash', async () => {
    const mockSshExec = createMockSshExec({
      'basename "$SHELL"': { stdout: 'bash\n', exitCode: 0 },
    })

    const shell = await detectRemoteShell(mockSshExec)

    expect(shell).toBe('bash')
  })

  it('应该去除 stdout 中的空白字符', async () => {
    const mockSshExec = createMockSshExec({
      'basename "$SHELL"': { stdout: '  zsh  \n', exitCode: 0 },
    })

    const shell = await detectRemoteShell(mockSshExec)

    expect(shell).toBe('zsh')
  })

  it('命令失败时应该返回默认的 bash', async () => {
    const mockSshExec = createMockSshExec({
      'basename "$SHELL"': { stdout: '', exitCode: 1 },
    })

    const shell = await detectRemoteShell(mockSshExec)

    expect(shell).toBe('bash')
  })

  it('未知 shell 应该返回默认的 bash', async () => {
    const mockSshExec = createMockSshExec({
      'basename "$SHELL"': { stdout: 'fish\n', exitCode: 0 },
    })

    const shell = await detectRemoteShell(mockSshExec)

    expect(shell).toBe('bash')
  })

  it('SSH 执行抛出错误时应该返回默认的 bash', async () => {
    const mockSshExec = createErrorSshExec(new Error('Connection refused'))

    const shell = await detectRemoteShell(mockSshExec)

    expect(shell).toBe('bash')
  })

  it('空 stdout 应该返回默认的 bash', async () => {
    const mockSshExec = createMockSshExec({
      'basename "$SHELL"': { stdout: '', exitCode: 0 },
    })

    const shell = await detectRemoteShell(mockSshExec)

    expect(shell).toBe('bash')
  })

  it('应该处理带路径的 shell 名称', async () => {
    // 虽然 basename 命令应该只返回文件名，但测试边界情况
    const mockSshExec = createMockSshExec({
      'basename "$SHELL"': { stdout: '/bin/zsh\n', exitCode: 0 },
    })

    const shell = await detectRemoteShell(mockSshExec)

    // /bin/zsh 不等于 'zsh'，所以返回默认 bash
    expect(shell).toBe('bash')
  })
})

// ============================================================================
// checkRemoteHookInstalled 测试
// ============================================================================

describe('checkRemoteHookInstalled', () => {
  it('已安装时应该返回 true', async () => {
    const mockSshExec = createMockSshExec({
      'grep': { stdout: 'installed\n', exitCode: 0 },
    })

    const installed = await checkRemoteHookInstalled(mockSshExec, '~/.zshrc')

    expect(installed).toBe(true)
  })

  it('未安装时应该返回 false', async () => {
    const mockSshExec = createMockSshExec({
      'grep': { stdout: 'not_installed\n', exitCode: 0 },
    })

    const installed = await checkRemoteHookInstalled(mockSshExec, '~/.zshrc')

    expect(installed).toBe(false)
  })

  it('命令失败时应该返回 false', async () => {
    const mockSshExec = createMockSshExec({
      'grep': { stdout: '', exitCode: 1 },
    })

    const installed = await checkRemoteHookInstalled(mockSshExec, '~/.zshrc')

    expect(installed).toBe(false)
  })

  it('SSH 执行抛出错误时应该返回 false', async () => {
    const mockSshExec = createErrorSshExec(new Error('Connection refused'))

    const installed = await checkRemoteHookInstalled(mockSshExec, '~/.zshrc')

    expect(installed).toBe(false)
  })

  it('应该检查正确的配置文件路径', async () => {
    const mockSshExec = vi.fn().mockResolvedValue({ stdout: 'not_installed\n', exitCode: 0 })

    await checkRemoteHookInstalled(mockSshExec, '~/.bashrc')

    expect(mockSshExec).toHaveBeenCalledWith(expect.stringContaining('~/.bashrc'))
  })

  it('应该检查 Hook 开始标记', async () => {
    const mockSshExec = vi.fn().mockResolvedValue({ stdout: 'not_installed\n', exitCode: 0 })

    await checkRemoteHookInstalled(mockSshExec, '~/.zshrc')

    expect(mockSshExec).toHaveBeenCalledWith(
      expect.stringContaining('pretty-please shell hook')
    )
  })
})

// ============================================================================
// installRemoteShellHook 测试
// ============================================================================

describe('installRemoteShellHook', () => {
  it('zsh 首次安装应该成功', async () => {
    const mockSshExec = vi.fn()
      .mockResolvedValueOnce({ stdout: 'not_installed\n', exitCode: 0 }) // checkRemoteHookInstalled
      .mockResolvedValueOnce({ stdout: '', exitCode: 0 }) // backup
      .mockResolvedValueOnce({ stdout: '', exitCode: 0 }) // install
      .mockResolvedValueOnce({ stdout: '', exitCode: 0 }) // mkdir

    const result = await installRemoteShellHook(mockSshExec, 'zsh')

    expect(result.success).toBe(true)
    expect(result.message).toContain('已安装')
    expect(result.message).toContain('.zshrc')
  })

  it('bash 首次安装应该成功', async () => {
    const mockSshExec = vi.fn()
      .mockResolvedValueOnce({ stdout: 'not_installed\n', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', exitCode: 0 })

    const result = await installRemoteShellHook(mockSshExec, 'bash')

    expect(result.success).toBe(true)
    expect(result.message).toContain('已安装')
    expect(result.message).toContain('.bashrc')
  })

  it('已安装时应该跳过并返回成功', async () => {
    const mockSshExec = vi.fn()
      .mockResolvedValueOnce({ stdout: 'installed\n', exitCode: 0 })

    const result = await installRemoteShellHook(mockSshExec, 'zsh')

    expect(result.success).toBe(true)
    expect(result.message).toContain('已安装')
    expect(result.message).toContain('跳过')
  })

  it('不支持的 shell 类型应该返回失败', async () => {
    const mockSshExec = vi.fn()

    const result = await installRemoteShellHook(mockSshExec, 'powershell')

    expect(result.success).toBe(false)
    expect(result.message).toContain('不支持')
  })

  it('unknown shell 类型应该返回失败', async () => {
    const mockSshExec = vi.fn()

    const result = await installRemoteShellHook(mockSshExec, 'unknown')

    expect(result.success).toBe(false)
    expect(result.message).toContain('不支持')
  })

  it('安装命令失败应该返回失败', async () => {
    const mockSshExec = vi.fn()
      .mockResolvedValueOnce({ stdout: 'not_installed\n', exitCode: 0 }) // check
      .mockResolvedValueOnce({ stdout: '', exitCode: 0 }) // backup
      .mockResolvedValueOnce({ stdout: 'Permission denied', exitCode: 1 }) // install fails

    const result = await installRemoteShellHook(mockSshExec, 'zsh')

    expect(result.success).toBe(false)
    expect(result.message).toContain('安装失败')
  })

  it('SSH 执行抛出错误应该返回失败', async () => {
    const mockSshExec = vi.fn()
      .mockResolvedValueOnce({ stdout: 'not_installed\n', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', exitCode: 0 })
      .mockRejectedValueOnce(new Error('Network error'))

    const result = await installRemoteShellHook(mockSshExec, 'zsh')

    expect(result.success).toBe(false)
    expect(result.message).toContain('安装失败')
    expect(result.message).toContain('Network error')
  })

  it('备份失败不应该阻止安装', async () => {
    const mockSshExec = vi.fn()
      .mockResolvedValueOnce({ stdout: 'not_installed\n', exitCode: 0 })
      .mockRejectedValueOnce(new Error('Backup failed')) // backup fails
      .mockResolvedValueOnce({ stdout: '', exitCode: 0 }) // install
      .mockResolvedValueOnce({ stdout: '', exitCode: 0 }) // mkdir

    const result = await installRemoteShellHook(mockSshExec, 'zsh')

    expect(result.success).toBe(true)
  })

  it('应该创建 ~/.please 目录', async () => {
    const mockSshExec = vi.fn()
      .mockResolvedValueOnce({ stdout: 'not_installed\n', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', exitCode: 0 })

    await installRemoteShellHook(mockSshExec, 'zsh')

    expect(mockSshExec).toHaveBeenCalledWith('mkdir -p ~/.please')
  })

  it('应该备份原配置文件', async () => {
    const mockSshExec = vi.fn()
      .mockResolvedValueOnce({ stdout: 'not_installed\n', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', exitCode: 0 })

    await installRemoteShellHook(mockSshExec, 'zsh')

    expect(mockSshExec).toHaveBeenCalledWith(
      expect.stringContaining('.pls-backup')
    )
  })
})

// ============================================================================
// uninstallRemoteShellHook 测试
// ============================================================================

describe('uninstallRemoteShellHook', () => {
  it('已安装时应该成功卸载', async () => {
    const mockSshExec = vi.fn()
      .mockResolvedValueOnce({ stdout: 'installed\n', exitCode: 0 }) // check
      .mockResolvedValueOnce({ stdout: '', exitCode: 0 }) // sed command

    const result = await uninstallRemoteShellHook(mockSshExec, 'zsh')

    expect(result.success).toBe(true)
    expect(result.message).toContain('已卸载')
  })

  it('未安装时应该跳过并返回成功', async () => {
    const mockSshExec = vi.fn()
      .mockResolvedValueOnce({ stdout: 'not_installed\n', exitCode: 0 })

    const result = await uninstallRemoteShellHook(mockSshExec, 'zsh')

    expect(result.success).toBe(true)
    expect(result.message).toContain('未安装')
    expect(result.message).toContain('跳过')
  })

  it('bash 卸载应该成功', async () => {
    const mockSshExec = vi.fn()
      .mockResolvedValueOnce({ stdout: 'installed\n', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', exitCode: 0 })

    const result = await uninstallRemoteShellHook(mockSshExec, 'bash')

    expect(result.success).toBe(true)
    expect(result.message).toContain('已卸载')
  })

  it('sed 命令失败应该返回失败', async () => {
    const mockSshExec = vi.fn()
      .mockResolvedValueOnce({ stdout: 'installed\n', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'Permission denied', exitCode: 1 })

    const result = await uninstallRemoteShellHook(mockSshExec, 'zsh')

    expect(result.success).toBe(false)
    expect(result.message).toContain('卸载失败')
  })

  it('SSH 执行抛出错误应该返回失败', async () => {
    const mockSshExec = vi.fn()
      .mockResolvedValueOnce({ stdout: 'installed\n', exitCode: 0 })
      .mockRejectedValueOnce(new Error('Connection lost'))

    const result = await uninstallRemoteShellHook(mockSshExec, 'zsh')

    expect(result.success).toBe(false)
    expect(result.message).toContain('卸载失败')
    expect(result.message).toContain('Connection lost')
  })

  it('应该使用 sed 删除 hook 代码块', async () => {
    const mockSshExec = vi.fn()
      .mockResolvedValueOnce({ stdout: 'installed\n', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', exitCode: 0 })

    await uninstallRemoteShellHook(mockSshExec, 'zsh')

    // 验证第二次调用包含 sed 命令
    const sedCall = mockSshExec.mock.calls[1][0]
    expect(sedCall).toContain('sed')
    expect(sedCall).toContain('pretty-please shell hook')
  })

  it('应该处理正确的配置文件路径', async () => {
    const mockSshExec = vi.fn()
      .mockResolvedValueOnce({ stdout: 'installed\n', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', exitCode: 0 })

    await uninstallRemoteShellHook(mockSshExec, 'bash')

    const sedCall = mockSshExec.mock.calls[1][0]
    expect(sedCall).toContain('.bashrc')
  })
})

// ============================================================================
// getRemoteHookStatus 测试
// ============================================================================

describe('getRemoteHookStatus', () => {
  it('应该返回完整的状态信息', async () => {
    const mockSshExec = vi.fn()
      .mockResolvedValueOnce({ stdout: 'zsh\n', exitCode: 0 }) // detectRemoteShell
      .mockResolvedValueOnce({ stdout: 'installed\n', exitCode: 0 }) // checkRemoteHookInstalled

    const status = await getRemoteHookStatus(mockSshExec)

    expect(status.installed).toBe(true)
    expect(status.shellType).toBe('zsh')
    expect(status.configPath).toBe('~/.zshrc')
  })

  it('bash 未安装状态应该正确返回', async () => {
    const mockSshExec = vi.fn()
      .mockResolvedValueOnce({ stdout: 'bash\n', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'not_installed\n', exitCode: 0 })

    const status = await getRemoteHookStatus(mockSshExec)

    expect(status.installed).toBe(false)
    expect(status.shellType).toBe('bash')
    expect(status.configPath).toBe('~/.bashrc')
  })

  it('检测失败时应该使用默认 bash', async () => {
    const mockSshExec = vi.fn()
      .mockResolvedValueOnce({ stdout: '', exitCode: 1 }) // detect fails
      .mockResolvedValueOnce({ stdout: 'not_installed\n', exitCode: 0 })

    const status = await getRemoteHookStatus(mockSshExec)

    expect(status.shellType).toBe('bash')
    expect(status.configPath).toBe('~/.bashrc')
  })

  it('检查安装状态失败应该返回 false', async () => {
    const mockSshExec = vi.fn()
      .mockResolvedValueOnce({ stdout: 'zsh\n', exitCode: 0 })
      .mockRejectedValueOnce(new Error('Connection error'))

    const status = await getRemoteHookStatus(mockSshExec)

    expect(status.installed).toBe(false)
    expect(status.shellType).toBe('zsh')
  })
})

// ============================================================================
// getRemoteShellConfigPath 测试 (补充)
// ============================================================================

describe('getRemoteShellConfigPath', () => {
  it('zsh 应该返回 ~/.zshrc', () => {
    expect(getRemoteShellConfigPath('zsh')).toBe('~/.zshrc')
  })

  it('bash 应该返回 ~/.bashrc', () => {
    expect(getRemoteShellConfigPath('bash')).toBe('~/.bashrc')
  })

  it('powershell 应该返回默认 ~/.bashrc', () => {
    expect(getRemoteShellConfigPath('powershell')).toBe('~/.bashrc')
  })

  it('unknown 应该返回默认 ~/.bashrc', () => {
    expect(getRemoteShellConfigPath('unknown')).toBe('~/.bashrc')
  })
})

// ============================================================================
// generateRemoteHookScript 测试 (补充)
// ============================================================================

describe('generateRemoteHookScript', () => {
  it('zsh 应该生成包含 preexec 和 precmd 的脚本', () => {
    const script = generateRemoteHookScript('zsh')

    expect(script).not.toBeNull()
    expect(script).toContain('__pls_preexec')
    expect(script).toContain('__pls_precmd')
    expect(script).toContain('add-zsh-hook')
  })

  it('bash 应该生成包含 PROMPT_COMMAND 的脚本', () => {
    const script = generateRemoteHookScript('bash')

    expect(script).not.toBeNull()
    expect(script).toContain('PROMPT_COMMAND')
    expect(script).toContain('__pls_prompt_command')
  })

  it('powershell 应该返回 null', () => {
    const script = generateRemoteHookScript('powershell')
    expect(script).toBeNull()
  })

  it('unknown 应该返回 null', () => {
    const script = generateRemoteHookScript('unknown')
    expect(script).toBeNull()
  })

  it('zsh 脚本应该包含 Hook 标记', () => {
    const script = generateRemoteHookScript('zsh')

    expect(script).toContain('>>> pretty-please shell hook >>>')
    expect(script).toContain('<<< pretty-please shell hook <<<')
  })

  it('bash 脚本应该包含 Hook 标记', () => {
    const script = generateRemoteHookScript('bash')

    expect(script).toContain('>>> pretty-please shell hook >>>')
    expect(script).toContain('<<< pretty-please shell hook <<<')
  })

  it('zsh 脚本应该使用 ~/.please 目录', () => {
    const script = generateRemoteHookScript('zsh')

    expect(script).toContain('~/.please')
    expect(script).toContain('shell_history.jsonl')
  })

  it('bash 脚本应该使用 ~/.please 目录', () => {
    const script = generateRemoteHookScript('bash')

    expect(script).toContain('~/.please')
    expect(script).toContain('shell_history.jsonl')
  })

  it('zsh 脚本应该记录命令、退出码和时间戳', () => {
    const script = generateRemoteHookScript('zsh')

    expect(script).toContain('exit_code')
    expect(script).toContain('timestamp')
  })

  it('bash 脚本应该记录命令、退出码和时间戳', () => {
    const script = generateRemoteHookScript('bash')

    expect(script).toContain('exit_code')
    expect(script).toContain('timestamp')
  })
})

// ============================================================================
// 集成场景测试
// ============================================================================

describe('远程 Hook 集成场景', () => {
  it('完整安装流程：检测 → 安装 → 验证', async () => {
    const callLog: string[] = []
    const mockSshExec = vi.fn(async (cmd: string) => {
      callLog.push(cmd)
      if (cmd.includes('basename')) {
        return { stdout: 'zsh\n', exitCode: 0 }
      }
      if (cmd.includes('grep') && callLog.length <= 3) {
        return { stdout: 'not_installed\n', exitCode: 0 }
      }
      if (cmd.includes('grep')) {
        return { stdout: 'installed\n', exitCode: 0 }
      }
      return { stdout: '', exitCode: 0 }
    })

    // 1. 检测 shell
    const shell = await detectRemoteShell(mockSshExec)
    expect(shell).toBe('zsh')

    // 2. 安装 hook
    const installResult = await installRemoteShellHook(mockSshExec, shell)
    expect(installResult.success).toBe(true)

    // 3. 验证状态
    const status = await getRemoteHookStatus(mockSshExec)
    expect(status.installed).toBe(true)
    expect(status.shellType).toBe('zsh')
  })

  it('完整卸载流程：检测 → 卸载 → 验证', async () => {
    const callCount = { check: 0 }
    const mockSshExec = vi.fn(async (cmd: string) => {
      if (cmd.includes('basename')) {
        return { stdout: 'bash\n', exitCode: 0 }
      }
      if (cmd.includes('grep')) {
        callCount.check++
        // 第一次检查（卸载时）返回已安装，第二次（验证时）返回未安装
        if (callCount.check <= 1) {
          return { stdout: 'installed\n', exitCode: 0 }
        }
        return { stdout: 'not_installed\n', exitCode: 0 }
      }
      return { stdout: '', exitCode: 0 }
    })

    // 1. 获取当前状态
    const beforeStatus = await getRemoteHookStatus(mockSshExec)
    expect(beforeStatus.installed).toBe(true)

    // 2. 卸载 hook
    const uninstallResult = await uninstallRemoteShellHook(mockSshExec, 'bash')
    expect(uninstallResult.success).toBe(true)

    // 3. 验证状态
    const afterStatus = await getRemoteHookStatus(mockSshExec)
    expect(afterStatus.installed).toBe(false)
  })

  it('网络错误恢复场景', async () => {
    let callCount = 0
    const mockSshExec = vi.fn(async () => {
      callCount++
      if (callCount === 1) {
        throw new Error('ETIMEDOUT')
      }
      return { stdout: 'bash\n', exitCode: 0 }
    })

    // 第一次调用失败
    const shell1 = await detectRemoteShell(mockSshExec)
    expect(shell1).toBe('bash') // 默认值

    // 第二次调用成功
    const shell2 = await detectRemoteShell(mockSshExec)
    expect(shell2).toBe('bash')
  })

  it('权限错误场景', async () => {
    const mockSshExec = vi.fn()
      .mockResolvedValueOnce({ stdout: 'not_installed\n', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', exitCode: 0 }) // backup
      .mockResolvedValueOnce({ stdout: 'Permission denied: ~/.zshrc', exitCode: 1 })

    const result = await installRemoteShellHook(mockSshExec, 'zsh')

    expect(result.success).toBe(false)
    expect(result.message).toContain('安装失败')
  })
})
