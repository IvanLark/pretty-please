/**
 * 平台检测和通用函数测试
 * 测试基础的平台判断函数和其他通用工具
 */

import { describe, it, expect, afterEach } from 'vitest'
import { isWindows, isMacOS, isLinux, getDefaultShell, getConfigDir, getPowerShellConfigDir } from '../platform'

describe('Platform Detection', () => {
  const originalPlatform = process.platform

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      writable: true,
    })
  })

  it('isWindows() 在 Windows 平台应该返回 true', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', writable: true })
    expect(isWindows()).toBe(true)
    expect(isMacOS()).toBe(false)
    expect(isLinux()).toBe(false)
  })

  it('isMacOS() 在 macOS 平台应该返回 true', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', writable: true })
    expect(isWindows()).toBe(false)
    expect(isMacOS()).toBe(true)
    expect(isLinux()).toBe(false)
  })

  it('isLinux() 在 Linux 平台应该返回 true', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true })
    expect(isWindows()).toBe(false)
    expect(isMacOS()).toBe(false)
    expect(isLinux()).toBe(true)
  })

  it('应该只有一个平台为 true', () => {
    // 无论在哪个平台，三个函数应该只有一个返回 true
    const results = [isWindows(), isMacOS(), isLinux()]
    const trueCount = results.filter(r => r === true).length
    expect(trueCount).toBe(1)
  })
})

describe('getDefaultShell', () => {
  const originalPlatform = process.platform
  const originalEnv = { ...process.env }

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    })
    process.env = { ...originalEnv }
  })

  it('Unix 平台应该返回 $SHELL', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true })
    process.env.SHELL = '/bin/zsh'

    const shell = getDefaultShell()
    expect(shell).toBe('/bin/zsh')
  })

  it('Unix 平台无 $SHELL 应该降级到 /bin/bash', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true })
    delete process.env.SHELL

    const shell = getDefaultShell()
    expect(shell).toBe('/bin/bash')
  })

  it('Windows 平台 PowerShell 7 应该返回 pwsh.exe', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', writable: true })
    process.env.PSModulePath = 'C:\\Program Files\\PowerShell\\7\\Modules'

    const shell = getDefaultShell()
    expect(shell).toBe('pwsh.exe')
  })

  it('Windows 平台 PowerShell 5 应该返回 powershell.exe', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', writable: true })
    process.env.PSModulePath = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules'
    delete process.env.PROMPT

    const shell = getDefaultShell()
    expect(shell).toBe('powershell.exe')
  })

  it('Windows 平台 CMD 应该返回 cmd.exe 或 $COMSPEC', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', writable: true })
    process.env.PROMPT = '$P$G'
    delete process.env.PSModulePath
    delete process.env.COMSPEC

    const shell = getDefaultShell()
    expect(shell).toBe('cmd.exe')
  })
})

describe('getConfigDir', () => {
  it('应该返回 ~/.please 目录', () => {
    const configDir = getConfigDir()
    expect(configDir).toContain('.please')
    expect(configDir).toMatch(/[\/\\]\.please$/)
  })

  it('应该使用用户 home 目录', () => {
    const os = require('os')
    const home = os.homedir()
    const configDir = getConfigDir()

    expect(configDir).toContain(home)
  })
})

describe('getPowerShellConfigDir', () => {
  it('应该返回 PowerShell 变量格式', () => {
    const psDir = getPowerShellConfigDir()
    expect(psDir).toBe('$env:USERPROFILE\\.please')
  })

  it('返回值应该是 PowerShell 可识别的路径', () => {
    const psDir = getPowerShellConfigDir()

    // PowerShell 路径应该：
    // 1. 使用 $env:USERPROFILE 而不是硬编码路径
    // 2. 使用反斜杠（Windows 风格）
    expect(psDir).toMatch(/^\$env:USERPROFILE/)
    expect(psDir).toContain('\\')
  })
})

describe('Integration - Platform 和 Shell 检测配合', () => {
  const originalPlatform = process.platform
  const originalEnv = { ...process.env }

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    })
    process.env = { ...originalEnv }
  })

  it('macOS + Zsh 应该正常工作', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', writable: true })
    process.env.SHELL = '/bin/zsh'

    expect(isMacOS()).toBe(true)
    expect(getDefaultShell()).toBe('/bin/zsh')
  })

  it('Linux + Bash 应该正常工作', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', writable: true })
    process.env.SHELL = '/bin/bash'

    expect(isLinux()).toBe(true)
    expect(getDefaultShell()).toBe('/bin/bash')
  })

  it('Windows + PowerShell 7 应该正常工作', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', writable: true })
    process.env.PSModulePath = 'C:\\Program Files\\PowerShell\\7\\Modules'

    expect(isWindows()).toBe(true)
    expect(getDefaultShell()).toBe('pwsh.exe')
  })
})
