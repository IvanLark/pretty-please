/**
 * Shell 检测专项测试
 * 测试各种平台和环境下的 Shell 类型检测
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { detectShell, type ShellType } from '../platform'

describe('Shell Detection - Windows', () => {
  // 保存原始环境
  const originalPlatform = process.platform
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // 清空环境变量
    vi.stubGlobal('process', {
      ...process,
      platform: 'win32',
      env: {},
    })
  })

  afterEach(() => {
    // 恢复原始环境
    vi.unstubAllGlobals()
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    })
    process.env = { ...originalEnv }
  })

  it('应该检测到 PowerShell 7+ (路径包含 PowerShell\\7)', () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'win32',
      env: {
        PSModulePath: 'C:\\Program Files\\PowerShell\\7\\Modules',
      },
    })

    const result = detectShell()
    expect(result).toBe('powershell7')
  })

  it('应该检测到 PowerShell 7+ (路径包含 PowerShell/7)', () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'win32',
      env: {
        PSModulePath: 'C:/Program Files/PowerShell/7/Modules',
      },
    })

    const result = detectShell()
    expect(result).toBe('powershell7')
  })

  it('应该检测到 PowerShell 7+ (大小写不敏感)', () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'win32',
      env: {
        PSModulePath: 'C:\\PROGRAM FILES\\powershell\\7\\modules',
      },
    })

    const result = detectShell()
    expect(result).toBe('powershell7')
  })

  it('应该检测到 PowerShell 5.x (路径包含 WindowsPowerShell)', () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'win32',
      env: {
        PSModulePath: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules',
      },
    })

    const result = detectShell()
    expect(result).toBe('powershell5')
  })

  it('应该检测到 PowerShell 5.x (大小写不敏感)', () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'win32',
      env: {
        PSModulePath: 'C:\\Windows\\System32\\WINDOWSPOWERSHELL\\v1.0\\Modules',
      },
    })

    const result = detectShell()
    expect(result).toBe('powershell5')
  })

  it('应该检测到 CMD (PROMPT 存在且无 PSModulePath)', () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'win32',
      env: {
        PROMPT: '$P$G',
      },
    })

    const result = detectShell()
    expect(result).toBe('cmd')
  })

  it('应该忽略 PROMPT 如果 PSModulePath 存在 (避免 PowerShell 中运行 CMD 的误判)', () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'win32',
      env: {
        PROMPT: '$P$G',
        PSModulePath: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules',
      },
    })

    const result = detectShell()
    expect(result).toBe('powershell5') // 应该是 PowerShell，不是 CMD
  })

  it('应该默认降级到 PowerShell 5 (Windows 环境无明确特征)', () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'win32',
      env: {},
    })

    const result = detectShell()
    expect(result).toBe('powershell5')
  })

  it('应该处理空的 PSModulePath', () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'win32',
      env: {
        PSModulePath: '',
      },
    })

    const result = detectShell()
    expect(result).toBe('powershell5')
  })
})

describe('Shell Detection - Unix', () => {
  const originalPlatform = process.platform
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'darwin',
      env: {},
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    })
    process.env = { ...originalEnv }
  })

  it('应该检测到 Zsh', () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'darwin',
      env: {
        SHELL: '/bin/zsh',
      },
    })

    const result = detectShell()
    expect(result).toBe('zsh')
  })

  it('应该检测到 Bash', () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'linux',
      env: {
        SHELL: '/bin/bash',
      },
    })

    const result = detectShell()
    expect(result).toBe('bash')
  })

  it('应该检测到 Fish', () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'linux',
      env: {
        SHELL: '/usr/bin/fish',
      },
    })

    const result = detectShell()
    expect(result).toBe('fish')
  })

  it('应该处理 SHELL 路径的多种格式 (Zsh)', () => {
    const testCases = [
      '/usr/local/bin/zsh',
      '/opt/homebrew/bin/zsh',
      'zsh',
    ]

    for (const shellPath of testCases) {
      vi.stubGlobal('process', {
        ...process,
        platform: 'darwin',
        env: {
          SHELL: shellPath,
        },
      })

      const result = detectShell()
      expect(result).toBe('zsh')
    }
  })

  it('应该处理 SHELL 路径的多种格式 (Bash)', () => {
    const testCases = [
      '/usr/local/bin/bash',
      '/opt/homebrew/bin/bash',
      'bash',
    ]

    for (const shellPath of testCases) {
      vi.stubGlobal('process', {
        ...process,
        platform: 'linux',
        env: {
          SHELL: shellPath,
        },
      })

      const result = detectShell()
      expect(result).toBe('bash')
    }
  })

  it('应该降级到 unknown (SHELL 为空)', () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'linux',
      env: {
        SHELL: '',
      },
    })

    const result = detectShell()
    expect(result).toBe('unknown')
  })

  it('应该降级到 unknown (SHELL 不匹配)', () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'linux',
      env: {
        SHELL: '/usr/bin/tcsh',
      },
    })

    const result = detectShell()
    expect(result).toBe('unknown')
  })

  it('应该降级到 unknown (无 SHELL 环境变量)', () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'linux',
      env: {},
    })

    const result = detectShell()
    expect(result).toBe('unknown')
  })
})

describe('Shell Detection - Edge Cases', () => {
  const originalPlatform = process.platform
  const originalEnv = { ...process.env }

  afterEach(() => {
    vi.unstubAllGlobals()
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    })
    process.env = { ...originalEnv }
  })

  it('应该正确处理 macOS 平台', () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'darwin',
      env: {
        SHELL: '/bin/zsh',
      },
    })

    const result = detectShell()
    expect(result).toBe('zsh')
  })

  it('应该正确处理 Linux 平台', () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'linux',
      env: {
        SHELL: '/bin/bash',
      },
    })

    const result = detectShell()
    expect(result).toBe('bash')
  })

  it('应该正确处理 Windows 平台', () => {
    vi.stubGlobal('process', {
      ...process,
      platform: 'win32',
      env: {
        PSModulePath: 'C:\\Program Files\\PowerShell\\7\\Modules',
      },
    })

    const result = detectShell()
    expect(result).toBe('powershell7')
  })
})
