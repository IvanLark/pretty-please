/**
 * Shell 能力专项测试
 * 测试各 Shell 的配置文件、历史文件、能力矩阵等
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getShellCapabilities, type ShellType } from '../platform'
import os from 'os'
import path from 'path'

describe('Shell Capabilities - 配置文件路径', () => {
  const originalPlatform = process.platform
  const home = os.homedir()

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    })
  })

  it('Zsh 应该返回 ~/.zshrc', () => {
    const caps = getShellCapabilities('zsh')
    expect(caps.configPath).toBe(path.join(home, '.zshrc'))
  })

  it('Bash 在 macOS 应该返回 ~/.bash_profile', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', writable: true })
    const caps = getShellCapabilities('bash')
    expect(caps.configPath).toBe(path.join(home, '.bash_profile'))
  })

  it('Bash 在 Linux 应该返回 ~/.bashrc', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true })
    const caps = getShellCapabilities('bash')
    expect(caps.configPath).toBe(path.join(home, '.bashrc'))
  })

  it('Fish 应该返回 ~/.config/fish/config.fish', () => {
    const caps = getShellCapabilities('fish')
    expect(caps.configPath).toBe(path.join(home, '.config', 'fish', 'config.fish'))
  })

  it('PowerShell 5 应该返回正确的 profile 路径', () => {
    const caps = getShellCapabilities('powershell5')
    expect(caps.configPath).toBe(
      path.join(home, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1')
    )
  })

  it('PowerShell 7 应该返回正确的 profile 路径', () => {
    const caps = getShellCapabilities('powershell7')
    expect(caps.configPath).toBe(
      path.join(home, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1')
    )
  })

  it('CMD 应该返回 null (不支持配置文件)', () => {
    const caps = getShellCapabilities('cmd')
    expect(caps.configPath).toBeNull()
  })

  it('Unknown 应该返回 null', () => {
    const caps = getShellCapabilities('unknown')
    expect(caps.configPath).toBeNull()
  })
})

describe('Shell Capabilities - 历史文件路径', () => {
  const originalEnv = { ...process.env }
  const home = os.homedir()

  beforeEach(() => {
    // 清空 HISTFILE 环境变量
    delete process.env.HISTFILE
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('Zsh 应该返回 ~/.zsh_history (默认)', () => {
    const caps = getShellCapabilities('zsh')
    expect(caps.historyPath).toBe(path.join(home, '.zsh_history'))
  })

  it('Zsh 应该使用 HISTFILE 环境变量覆盖', () => {
    process.env.HISTFILE = '/custom/path/.zsh_history'
    const caps = getShellCapabilities('zsh')
    expect(caps.historyPath).toBe('/custom/path/.zsh_history')
  })

  it('Bash 应该返回 ~/.bash_history (默认)', () => {
    const caps = getShellCapabilities('bash')
    expect(caps.historyPath).toBe(path.join(home, '.bash_history'))
  })

  it('Bash 应该使用 HISTFILE 环境变量覆盖', () => {
    process.env.HISTFILE = '/custom/path/.bash_history'
    const caps = getShellCapabilities('bash')
    expect(caps.historyPath).toBe('/custom/path/.bash_history')
  })

  it('Fish 应该返回 ~/.local/share/fish/fish_history', () => {
    const caps = getShellCapabilities('fish')
    expect(caps.historyPath).toBe(path.join(home, '.local', 'share', 'fish', 'fish_history'))
  })

  it('PowerShell 应该返回 PSReadLine 历史文件路径', () => {
    const caps = getShellCapabilities('powershell5')
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
    expect(caps.historyPath).toBe(
      path.join(appData, 'Microsoft', 'Windows', 'PowerShell', 'PSReadLine', 'ConsoleHost_history.txt')
    )
  })

  it('PowerShell 5 和 7 应该使用相同的历史文件', () => {
    const caps5 = getShellCapabilities('powershell5')
    const caps7 = getShellCapabilities('powershell7')
    expect(caps5.historyPath).toBe(caps7.historyPath)
  })

  it('CMD 应该返回 null (不持久化历史)', () => {
    const caps = getShellCapabilities('cmd')
    expect(caps.historyPath).toBeNull()
  })

  it('Unknown 应该返回 null', () => {
    const caps = getShellCapabilities('unknown')
    expect(caps.historyPath).toBeNull()
  })
})

describe('Shell Capabilities - 能力矩阵', () => {
  it('Zsh 应该支持 Hook 和历史', () => {
    const caps = getShellCapabilities('zsh')
    expect(caps.supportsHook).toBe(true)
    expect(caps.supportsHistory).toBe(true)
  })

  it('Bash 应该支持 Hook 和历史', () => {
    const caps = getShellCapabilities('bash')
    expect(caps.supportsHook).toBe(true)
    expect(caps.supportsHistory).toBe(true)
  })

  it('Fish 应该支持 Hook 和历史', () => {
    const caps = getShellCapabilities('fish')
    expect(caps.supportsHook).toBe(true)
    expect(caps.supportsHistory).toBe(true)
  })

  it('PowerShell 5 应该支持 Hook 和历史', () => {
    const caps = getShellCapabilities('powershell5')
    expect(caps.supportsHook).toBe(true)
    expect(caps.supportsHistory).toBe(true)
  })

  it('PowerShell 7 应该支持 Hook 和历史', () => {
    const caps = getShellCapabilities('powershell7')
    expect(caps.supportsHook).toBe(true)
    expect(caps.supportsHistory).toBe(true)
  })

  it('CMD 不应该支持 Hook 和历史', () => {
    const caps = getShellCapabilities('cmd')
    expect(caps.supportsHook).toBe(false)
    expect(caps.supportsHistory).toBe(false)
  })

  it('Unknown 不应该支持 Hook 和历史', () => {
    const caps = getShellCapabilities('unknown')
    expect(caps.supportsHook).toBe(false)
    expect(caps.supportsHistory).toBe(false)
  })
})

describe('Shell Capabilities - 可执行文件', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('Zsh 应该返回 $SHELL 或默认路径', () => {
    delete process.env.SHELL
    const caps = getShellCapabilities('zsh')
    expect(caps.executable).toBe('/bin/zsh')
  })

  it('Zsh 应该使用 $SHELL 环境变量', () => {
    process.env.SHELL = '/usr/local/bin/zsh'
    const caps = getShellCapabilities('zsh')
    expect(caps.executable).toBe('/usr/local/bin/zsh')
  })

  it('Bash 应该返回 $SHELL 或默认路径', () => {
    delete process.env.SHELL
    const caps = getShellCapabilities('bash')
    expect(caps.executable).toBe('/bin/bash')
  })

  it('Fish 应该返回 $SHELL 或默认路径', () => {
    delete process.env.SHELL
    const caps = getShellCapabilities('fish')
    expect(caps.executable).toBe('/usr/bin/fish')
  })

  it('PowerShell 5 应该返回 powershell.exe', () => {
    const caps = getShellCapabilities('powershell5')
    expect(caps.executable).toBe('powershell.exe')
  })

  it('PowerShell 7 应该返回 pwsh.exe', () => {
    const caps = getShellCapabilities('powershell7')
    expect(caps.executable).toBe('pwsh.exe')
  })

  it('CMD 应该返回 $COMSPEC 或 cmd.exe', () => {
    delete process.env.COMSPEC
    const caps = getShellCapabilities('cmd')
    expect(caps.executable).toBe('cmd.exe')
  })

  it('CMD 应该使用 $COMSPEC 环境变量', () => {
    process.env.COMSPEC = 'C:\\Windows\\System32\\cmd.exe'
    const caps = getShellCapabilities('cmd')
    expect(caps.executable).toBe('C:\\Windows\\System32\\cmd.exe')
  })
})

describe('Shell Capabilities - 显示名称', () => {
  it('应该返回正确的显示名称', () => {
    expect(getShellCapabilities('zsh').displayName).toBe('Zsh')
    expect(getShellCapabilities('bash').displayName).toBe('Bash')
    expect(getShellCapabilities('fish').displayName).toBe('Fish')
    expect(getShellCapabilities('cmd').displayName).toBe('CMD')
    expect(getShellCapabilities('powershell5').displayName).toBe('PowerShell 5.x')
    expect(getShellCapabilities('powershell7').displayName).toBe('PowerShell 7+')
    expect(getShellCapabilities('unknown').displayName).toBe('Unknown')
  })
})

describe('Shell Capabilities - 完整性检查', () => {
  it('每个 Shell 类型都应该返回完整的能力信息', () => {
    const shells: ShellType[] = ['zsh', 'bash', 'fish', 'cmd', 'powershell5', 'powershell7', 'unknown']

    shells.forEach((shell) => {
      const caps = getShellCapabilities(shell)

      expect(caps).toHaveProperty('supportsHook')
      expect(caps).toHaveProperty('supportsHistory')
      expect(caps).toHaveProperty('configPath')
      expect(caps).toHaveProperty('historyPath')
      expect(caps).toHaveProperty('executable')
      expect(caps).toHaveProperty('displayName')

      expect(typeof caps.supportsHook).toBe('boolean')
      expect(typeof caps.supportsHistory).toBe('boolean')
      expect(typeof caps.executable).toBe('string')
      expect(typeof caps.displayName).toBe('string')
      expect(caps.executable).toBeTruthy()
      expect(caps.displayName).toBeTruthy()
    })
  })
})
