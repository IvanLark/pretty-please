/**
 * 命令执行配置专项测试
 * 测试不同 Shell 的命令执行配置构建
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildShellExecConfig, type ShellType } from '../platform'

describe('Shell Exec Config - Bash', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.SHELL
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('应该为 Bash 添加 pipefail', () => {
    const config = buildShellExecConfig('ls -la', 'bash')

    expect(config.shell).toBe('/bin/bash')
    expect(config.args).toEqual(['-c', 'set -o pipefail; ls -la'])
    expect(config.command).toBe('set -o pipefail; ls -la')
  })

  it('应该使用 $SHELL 环境变量', () => {
    process.env.SHELL = '/usr/local/bin/bash'
    const config = buildShellExecConfig('ls -la', 'bash')

    expect(config.shell).toBe('/usr/local/bin/bash')
  })

  it('应该处理多行命令', () => {
    const command = 'echo "hello"\necho "world"'
    const config = buildShellExecConfig(command, 'bash')

    expect(config.command).toBe(`set -o pipefail; ${command}`)
  })

  it('应该处理包含特殊字符的命令', () => {
    const command = 'echo "test$VAR"; cat file | grep "pattern"'
    const config = buildShellExecConfig(command, 'bash')

    expect(config.command).toBe(`set -o pipefail; ${command}`)
  })
})

describe('Shell Exec Config - Zsh', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.SHELL
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('应该为 Zsh 添加 pipefail', () => {
    const config = buildShellExecConfig('ls -la', 'zsh')

    expect(config.shell).toBe('/bin/zsh')
    expect(config.args).toEqual(['-c', 'setopt pipefail; ls -la'])
    expect(config.command).toBe('setopt pipefail; ls -la')
  })

  it('应该使用 $SHELL 环境变量', () => {
    process.env.SHELL = '/opt/homebrew/bin/zsh'
    const config = buildShellExecConfig('ls -la', 'zsh')

    expect(config.shell).toBe('/opt/homebrew/bin/zsh')
  })
})

describe('Shell Exec Config - Fish', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.SHELL
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('Fish 不应该添加 pipefail', () => {
    delete process.env.SHELL // 确保使用默认路径
    const config = buildShellExecConfig('ls -la', 'fish')

    expect(config.shell).toBe('/usr/bin/fish')
    expect(config.args).toEqual(['-c', 'ls -la'])
    expect(config.command).toBe('ls -la') // 注意：Fish 不需要 pipefail
  })

  it('应该使用 $SHELL 环境变量', () => {
    process.env.SHELL = '/usr/local/bin/fish'
    const config = buildShellExecConfig('ls -la', 'fish')

    expect(config.shell).toBe('/usr/local/bin/fish')
  })
})

describe('Shell Exec Config - PowerShell', () => {
  it('PowerShell 5 应该使用 -NoProfile -Command', () => {
    const config = buildShellExecConfig('Get-Process', 'powershell5')

    expect(config.shell).toBe('powershell.exe')
    expect(config.args).toEqual(['-NoProfile', '-Command', 'Get-Process'])
    expect(config.command).toBe('Get-Process')
  })

  it('PowerShell 7 应该使用 -NoProfile -Command', () => {
    const config = buildShellExecConfig('Get-Process', 'powershell7')

    expect(config.shell).toBe('pwsh.exe')
    expect(config.args).toEqual(['-NoProfile', '-Command', 'Get-Process'])
    expect(config.command).toBe('Get-Process')
  })

  it('应该处理多行 PowerShell 脚本', () => {
    const command = 'Get-Process | Where-Object {$_.CPU -gt 10}'
    const config = buildShellExecConfig(command, 'powershell7')

    expect(config.command).toBe(command)
    expect(config.args).toEqual(['-NoProfile', '-Command', command])
  })
})

describe('Shell Exec Config - CMD', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // 清除 COMSPEC 以确保使用默认值
    delete process.env.COMSPEC
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('CMD 应该使用 /c 参数', () => {
    const config = buildShellExecConfig('dir', 'cmd')

    expect(config.shell).toContain('cmd.exe')
    expect(config.args).toEqual(['/c', 'dir'])
    expect(config.command).toBe('dir')
  })

  it('应该使用 $COMSPEC 环境变量', () => {
    process.env.COMSPEC = 'C:\\Windows\\System32\\cmd.exe'
    const config = buildShellExecConfig('dir', 'cmd')

    expect(config.shell).toBe('C:\\Windows\\System32\\cmd.exe')
  })

  it('应该处理 CMD 批处理命令', () => {
    const command = 'echo hello && dir && cd ..'
    const config = buildShellExecConfig(command, 'cmd')

    expect(config.command).toBe(command)
  })
})

describe('Shell Exec Config - Unknown/Default', () => {
  const originalPlatform = process.platform

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    })
  })

  it('Unix 平台未知 Shell 应该降级到 /bin/sh', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true })
    const config = buildShellExecConfig('ls', 'unknown')

    expect(config.shell).toBe('/bin/sh')
    expect(config.args).toEqual(['-c', 'ls'])
  })

  it('Windows 平台未知 Shell 应该降级到 powershell.exe', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', writable: true })
    const config = buildShellExecConfig('dir', 'unknown')

    expect(config.shell).toBe('powershell.exe')
    expect(config.args).toEqual(['-Command', 'dir'])
  })
})

describe('Shell Exec Config - 自动检测 Shell', () => {
  const originalPlatform = process.platform
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'darwin',
      env: {
        SHELL: '/bin/zsh',
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    })
    process.env = { ...originalEnv }
  })

  it('不指定 Shell 时应该自动检测', () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'darwin',
      env: {
        SHELL: '/bin/zsh',
      },
    })

    const config = buildShellExecConfig('ls -la')

    expect(config.shell).toBe('/bin/zsh')
    expect(config.command).toBe('setopt pipefail; ls -la')
  })

  it('Windows 环境不指定 Shell 时应该自动检测', () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'win32',
      env: {
        PSModulePath: 'C:\\Program Files\\PowerShell\\7\\Modules',
      },
    })

    const config = buildShellExecConfig('Get-Process')

    expect(config.shell).toBe('pwsh.exe')
    expect(config.args).toEqual(['-NoProfile', '-Command', 'Get-Process'])
  })
})

describe('Shell Exec Config - 边界情况', () => {
  it('应该处理空命令', () => {
    const config = buildShellExecConfig('', 'bash')

    expect(config.command).toBe('set -o pipefail; ')
  })

  it('应该处理只有空格的命令', () => {
    const config = buildShellExecConfig('   ', 'bash')

    expect(config.command).toBe('set -o pipefail;    ')
  })

  it('应该处理包含引号的命令', () => {
    const command = 'echo "hello \'world\'"'
    const config = buildShellExecConfig(command, 'bash')

    expect(config.command).toContain(command)
  })

  it('应该处理包含管道的命令', () => {
    const command = 'cat file.txt | grep pattern | wc -l'
    const config = buildShellExecConfig(command, 'bash')

    expect(config.command).toBe(`set -o pipefail; ${command}`)
  })

  it('应该处理包含重定向的命令', () => {
    const command = 'echo "test" > file.txt 2>&1'
    const config = buildShellExecConfig(command, 'bash')

    expect(config.command).toContain(command)
  })
})
