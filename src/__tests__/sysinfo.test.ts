/**
 * 系统信息检测模块测试
 * 测试命令检测、包管理器检测、缓存机制、系统信息集成等功能
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  validSystemCache,
  expiredSystemCache,
  freshSystemCache,
  windowsSystemCache,
  linuxSystemCache,
  corruptedSystemCacheJson,
} from '../../tests/fixtures/system-cache'

// Mock fs 模块
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
}))

// Mock os 模块
vi.mock('os', () => ({
  default: {
    platform: vi.fn(() => 'darwin'),
    arch: vi.fn(() => 'arm64'),
    userInfo: vi.fn(() => ({ username: 'testuser' })),
  },
}))

// Mock config 模块
vi.mock('../config.js', () => ({
  getConfig: vi.fn(() => ({
    systemCacheExpireDays: 7,
  })),
  CONFIG_DIR: '/home/user/.please',
}))

// Mock platform 模块
vi.mock('../utils/platform.js', () => ({
  detectShell: vi.fn(() => 'zsh'),
  getShellCapabilities: vi.fn(() => ({
    displayName: 'Zsh',
    supportsHistory: true,
    supportsHook: true,
  })),
  commandExists: vi.fn(() => false),
  batchCommandExists: vi.fn(() => []),
  isWindows: vi.fn(() => false),
}))

// Mock project-context 模块
vi.mock('../project-context.js', () => ({
  detectProjectContext: vi.fn(() => null),
  formatProjectContext: vi.fn(() => ''),
}))

// Mock theme 模块
vi.mock('../ui/theme.js', () => ({
  getCurrentTheme: vi.fn(() => ({
    primary: '#007acc',
    success: '#4caf50',
    warning: '#ff9800',
    text: {
      muted: '#666666',
      secondary: '#999999',
    },
  })),
}))

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: vi.fn((s: string) => s),
    hex: vi.fn(() => (s: string) => s),
  },
}))

import fs from 'fs'
import os from 'os'
import { getConfig, CONFIG_DIR } from '../config.js'
import {
  detectShell,
  getShellCapabilities,
  commandExists,
  batchCommandExists,
  isWindows,
} from '../utils/platform.js'
import { detectProjectContext } from '../project-context.js'

// 获取 mock 函数引用
const mockFs = vi.mocked(fs)
const mockOs = vi.mocked(os)
const mockDetectShell = vi.mocked(detectShell)
const mockGetShellCapabilities = vi.mocked(getShellCapabilities)
const mockCommandExists = vi.mocked(commandExists)
const mockBatchCommandExists = vi.mocked(batchCommandExists)
const mockIsWindows = vi.mocked(isWindows)
const mockGetConfig = vi.mocked(getConfig)
const mockDetectProjectContext = vi.mocked(detectProjectContext)

beforeEach(() => {
  vi.clearAllMocks()

  // 默认配置
  mockGetConfig.mockReturnValue({
    systemCacheExpireDays: 7,
  } as any)

  // 默认 macOS 环境
  mockOs.platform.mockReturnValue('darwin')
  mockOs.arch.mockReturnValue('arm64')
  mockOs.userInfo.mockReturnValue({ username: 'testuser' } as any)

  mockDetectShell.mockReturnValue('zsh')
  mockGetShellCapabilities.mockReturnValue({
    displayName: 'Zsh',
    supportsHistory: true,
    supportsHook: true,
  } as any)

  mockIsWindows.mockReturnValue(false)
  mockCommandExists.mockReturnValue(false)
  mockBatchCommandExists.mockReturnValue([])

  // 默认配置目录存在
  mockFs.existsSync.mockReturnValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ============================================================================
// 包管理器检测测试
// ============================================================================

describe('包管理器检测', () => {
  describe('Windows 包管理器', () => {
    beforeEach(() => {
      mockIsWindows.mockReturnValue(true)
    })

    it('应该优先检测 winget', async () => {
      mockCommandExists.mockImplementation((cmd: string) => cmd === 'winget')

      const { getStaticSystemInfo } = await import('../sysinfo.js')
      const info = getStaticSystemInfo()

      expect(info.systemPackageManager).toBe('winget')
    })

    it('winget 不存在时应该降级到 scoop', async () => {
      mockCommandExists.mockImplementation((cmd: string) => cmd === 'scoop')

      const { getStaticSystemInfo } = await import('../sysinfo.js')
      const info = getStaticSystemInfo()

      expect(info.systemPackageManager).toBe('scoop')
    })

    it('scoop 不存在时应该降级到 choco', async () => {
      mockCommandExists.mockImplementation((cmd: string) => cmd === 'choco')

      const { getStaticSystemInfo } = await import('../sysinfo.js')
      const info = getStaticSystemInfo()

      expect(info.systemPackageManager).toBe('choco')
    })

    it('都不存在时应该返回 unknown', async () => {
      mockCommandExists.mockReturnValue(false)

      const { getStaticSystemInfo } = await import('../sysinfo.js')
      const info = getStaticSystemInfo()

      expect(info.systemPackageManager).toBe('unknown')
    })
  })

  describe('macOS 包管理器', () => {
    beforeEach(() => {
      mockIsWindows.mockReturnValue(false)
      mockOs.platform.mockReturnValue('darwin')
    })

    it('应该检测到 brew', async () => {
      mockCommandExists.mockImplementation((cmd: string) => cmd === 'brew')

      const { getStaticSystemInfo } = await import('../sysinfo.js')
      const info = getStaticSystemInfo()

      expect(info.systemPackageManager).toBe('brew')
    })
  })

  describe('Linux 包管理器', () => {
    beforeEach(() => {
      mockIsWindows.mockReturnValue(false)
      mockOs.platform.mockReturnValue('linux')
    })

    it('应该检测 apt-get', async () => {
      mockCommandExists.mockImplementation((cmd: string) => cmd === 'apt-get')

      const { getStaticSystemInfo } = await import('../sysinfo.js')
      const info = getStaticSystemInfo()

      expect(info.systemPackageManager).toBe('apt')
    })

    it('应该检测 dnf', async () => {
      mockCommandExists.mockImplementation((cmd: string) => cmd === 'dnf')

      const { getStaticSystemInfo } = await import('../sysinfo.js')
      const info = getStaticSystemInfo()

      expect(info.systemPackageManager).toBe('dnf')
    })

    it('应该检测 pacman', async () => {
      mockCommandExists.mockImplementation((cmd: string) => cmd === 'pacman')

      const { getStaticSystemInfo } = await import('../sysinfo.js')
      const info = getStaticSystemInfo()

      expect(info.systemPackageManager).toBe('pacman')
    })

    it('应该按优先级返回第一个可用的', async () => {
      // apt-get 和 dnf 都存在，应该返回 apt（优先级更高）
      mockCommandExists.mockImplementation((cmd: string) =>
        cmd === 'apt-get' || cmd === 'dnf'
      )

      const { getStaticSystemInfo } = await import('../sysinfo.js')
      const info = getStaticSystemInfo()

      // brew 在 apt-get 之前检测
      expect(info.systemPackageManager).toBe('apt')
    })
  })
})

// ============================================================================
// 命令检测测试
// ============================================================================

describe('命令检测', () => {
  it('应该使用 batchCommandExists 检测所有命令', async () => {
    mockBatchCommandExists.mockReturnValue(['git', 'npm', 'docker'])

    const { getStaticSystemInfo } = await import('../sysinfo.js')
    const info = getStaticSystemInfo()

    expect(mockBatchCommandExists).toHaveBeenCalled()
    expect(info.availableCommands).toEqual(['git', 'npm', 'docker'])
  })

  it('命令都不可用时应该返回空数组', async () => {
    mockBatchCommandExists.mockReturnValue([])

    const { getStaticSystemInfo } = await import('../sysinfo.js')
    const info = getStaticSystemInfo()

    expect(info.availableCommands).toEqual([])
  })

  it('应该返回可用命令列表', async () => {
    mockBatchCommandExists.mockReturnValue(['eza', 'fd', 'rg', 'bat', 'jq'])

    const { getStaticSystemInfo } = await import('../sysinfo.js')
    const info = getStaticSystemInfo()

    expect(info.availableCommands).toContain('eza')
    expect(info.availableCommands).toContain('fd')
    expect(info.availableCommands).toContain('rg')
  })
})

// ============================================================================
// 缓存机制测试
// ============================================================================

describe('缓存机制', () => {
  describe('缓存写入', () => {
    it('首次调用应该生成缓存文件', async () => {
      // 缓存文件不存在
      mockFs.existsSync.mockImplementation((path: any) => {
        if (path === CONFIG_DIR) return true
        return false // 缓存文件不存在
      })

      const { getStaticSystemInfo } = await import('../sysinfo.js')
      getStaticSystemInfo()

      expect(mockFs.writeFileSync).toHaveBeenCalled()
    })

    it('缓存文件应该包含 version/cachedAt/expiresInDays', async () => {
      mockFs.existsSync.mockImplementation((path: any) => {
        if (path === CONFIG_DIR) return true
        return false
      })

      let writtenContent: string = ''
      mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
        writtenContent = content
      })

      const { getStaticSystemInfo } = await import('../sysinfo.js')
      getStaticSystemInfo()

      const cache = JSON.parse(writtenContent)
      expect(cache.version).toBe(1)
      expect(cache.cachedAt).toBeDefined()
      expect(cache.expiresInDays).toBe(7)
      expect(cache.static).toBeDefined()
    })

    it('缓存文件应该是合法 JSON', async () => {
      mockFs.existsSync.mockImplementation((path: any) => {
        if (path === CONFIG_DIR) return true
        return false
      })

      let writtenContent: string = ''
      mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
        writtenContent = content
      })

      const { getStaticSystemInfo } = await import('../sysinfo.js')
      getStaticSystemInfo()

      expect(() => JSON.parse(writtenContent)).not.toThrow()
    })
  })

  describe('缓存读取', () => {
    it('缓存未过期时应该返回缓存数据', async () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        version: 1,
        cachedAt: new Date().toISOString(), // 刚刚创建
        expiresInDays: 7,
        static: {
          os: 'darwin',
          arch: 'arm64',
          shell: 'Zsh',
          user: 'cacheduser',
          systemPackageManager: 'brew',
          availableCommands: ['git', 'cached-cmd'],
        },
      }))

      const { getStaticSystemInfo } = await import('../sysinfo.js')
      const info = getStaticSystemInfo()

      // 应该返回缓存数据
      expect(info.user).toBe('cacheduser')
      expect(info.availableCommands).toContain('cached-cmd')
      // 不应该写入新缓存
      expect(mockFs.writeFileSync).not.toHaveBeenCalled()
    })

    it('缓存过期后应该重新检测', async () => {
      const expiredDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        version: 1,
        cachedAt: expiredDate,
        expiresInDays: 7,
        static: {
          os: 'darwin',
          arch: 'arm64',
          shell: 'Zsh',
          user: 'olduser',
          systemPackageManager: 'brew',
          availableCommands: [],
        },
      }))

      const { getStaticSystemInfo } = await import('../sysinfo.js')
      const info = getStaticSystemInfo()

      // 应该重新检测，返回当前 mock 的用户
      expect(info.user).toBe('testuser')
      // 应该写入新缓存
      expect(mockFs.writeFileSync).toHaveBeenCalled()
    })

    it('缓存文件损坏时应该重新检测', async () => {
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(corruptedSystemCacheJson)

      const { getStaticSystemInfo } = await import('../sysinfo.js')
      const info = getStaticSystemInfo()

      // 应该重新检测
      expect(info.user).toBe('testuser')
      expect(mockFs.writeFileSync).toHaveBeenCalled()
    })

    it('systemCacheExpireDays 配置应该生效', async () => {
      // 配置为 1 天过期
      mockGetConfig.mockReturnValue({ systemCacheExpireDays: 1 } as any)

      // 缓存 2 天前创建
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      mockFs.existsSync.mockReturnValue(true)
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        version: 1,
        cachedAt: twoDaysAgo,
        expiresInDays: 1,
        static: {
          os: 'darwin',
          arch: 'arm64',
          shell: 'Zsh',
          user: 'olduser',
          systemPackageManager: 'brew',
          availableCommands: [],
        },
      }))

      const { getStaticSystemInfo } = await import('../sysinfo.js')
      const info = getStaticSystemInfo()

      // 应该过期并重新检测
      expect(info.user).toBe('testuser')
    })
  })

  describe('目录创建', () => {
    it('CONFIG_DIR 不存在时应该自动创建', async () => {
      mockFs.existsSync.mockImplementation((path: any) => {
        if (path === CONFIG_DIR) return false // 目录不存在
        return false
      })

      const { getStaticSystemInfo } = await import('../sysinfo.js')
      getStaticSystemInfo()

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(CONFIG_DIR, { recursive: true })
    })
  })
})

// ============================================================================
// 系统信息集成测试
// ============================================================================

describe('系统信息集成', () => {
  describe('getStaticSystemInfo', () => {
    beforeEach(() => {
      mockFs.existsSync.mockImplementation((path: any) => {
        if (path === CONFIG_DIR) return true
        return false // 缓存文件不存在
      })
    })

    it('应该返回正确的 OS 信息', async () => {
      mockOs.platform.mockReturnValue('darwin')

      const { getStaticSystemInfo } = await import('../sysinfo.js')
      const info = getStaticSystemInfo()

      expect(info.os).toBe('darwin')
    })

    it('应该返回正确的架构信息', async () => {
      mockOs.arch.mockReturnValue('arm64')

      const { getStaticSystemInfo } = await import('../sysinfo.js')
      const info = getStaticSystemInfo()

      expect(info.arch).toBe('arm64')
    })

    it('应该返回正确的 Shell 信息', async () => {
      mockGetShellCapabilities.mockReturnValue({
        displayName: 'Zsh',
      } as any)

      const { getStaticSystemInfo } = await import('../sysinfo.js')
      const info = getStaticSystemInfo()

      expect(info.shell).toBe('Zsh')
    })

    it('应该返回正确的用户信息', async () => {
      mockOs.userInfo.mockReturnValue({ username: 'myuser' } as any)

      const { getStaticSystemInfo } = await import('../sysinfo.js')
      const info = getStaticSystemInfo()

      expect(info.user).toBe('myuser')
    })
  })

  describe('getDynamicSystemInfo', () => {
    it('应该返回当前工作目录', async () => {
      const originalCwd = process.cwd
      process.cwd = vi.fn(() => '/test/project')

      const { getDynamicSystemInfo } = await import('../sysinfo.js')
      const info = await getDynamicSystemInfo()

      expect(info.cwd).toBe('/test/project')
      process.cwd = originalCwd
    })

    it('应该包含项目上下文', async () => {
      mockDetectProjectContext.mockResolvedValue({
        types: ['node'],
        packageManager: 'pnpm',
        root: '/test/project',
      } as any)

      const { getDynamicSystemInfo } = await import('../sysinfo.js')
      const info = await getDynamicSystemInfo()

      expect(info.project).not.toBeNull()
      expect(info.project?.types).toContain('node')
    })

    it('项目上下文可以为 null', async () => {
      mockDetectProjectContext.mockResolvedValue(null)

      const { getDynamicSystemInfo } = await import('../sysinfo.js')
      const info = await getDynamicSystemInfo()

      expect(info.project).toBeNull()
    })
  })

  describe('getSystemInfo', () => {
    beforeEach(() => {
      mockFs.existsSync.mockImplementation((path: any) => {
        if (path === CONFIG_DIR) return true
        return false
      })
    })

    it('应该合并静态和动态信息', async () => {
      mockDetectProjectContext.mockResolvedValue({
        types: ['node'],
        root: '/test',
      } as any)

      const { getSystemInfo } = await import('../sysinfo.js')
      const info = await getSystemInfo()

      // 静态信息
      expect(info.os).toBeDefined()
      expect(info.arch).toBeDefined()
      expect(info.shell).toBeDefined()

      // 动态信息
      expect(info.cwd).toBeDefined()
      expect(info.project).not.toBeNull()
    })
  })
})

// ============================================================================
// 格式化测试
// ============================================================================

describe('formatSystemInfo', () => {
  it('应该包含基础信息', async () => {
    const { formatSystemInfo } = await import('../sysinfo.js')
    const formatted = formatSystemInfo({
      os: 'darwin',
      arch: 'arm64',
      shell: 'Zsh',
      user: 'testuser',
      systemPackageManager: 'brew',
      availableCommands: [],
      cwd: '/test',
      project: null,
    })

    expect(formatted).toContain('darwin')
    expect(formatted).toContain('arm64')
    expect(formatted).toContain('Zsh')
    expect(formatted).toContain('testuser')
    expect(formatted).toContain('brew')
  })

  it('应该正确分类命令', async () => {
    const { formatSystemInfo } = await import('../sysinfo.js')
    const formatted = formatSystemInfo({
      os: 'darwin',
      arch: 'arm64',
      shell: 'Zsh',
      user: 'testuser',
      systemPackageManager: 'brew',
      availableCommands: ['eza', 'fd', 'pnpm', 'docker'],
      cwd: '/test',
      project: null,
    })

    expect(formatted).toContain('现代工具')
    expect(formatted).toContain('eza')
    expect(formatted).toContain('包管理器')
    expect(formatted).toContain('pnpm')
    expect(formatted).toContain('容器工具')
    expect(formatted).toContain('docker')
  })

  it('空命令列表应该不显示工具部分', async () => {
    const { formatSystemInfo } = await import('../sysinfo.js')
    const formatted = formatSystemInfo({
      os: 'darwin',
      arch: 'arm64',
      shell: 'Zsh',
      user: 'testuser',
      systemPackageManager: 'brew',
      availableCommands: [],
      cwd: '/test',
      project: null,
    })

    expect(formatted).not.toContain('现代工具')
    expect(formatted).not.toContain('【用户终端可用工具】')
  })
})

// ============================================================================
// refreshSystemCache 测试
// ============================================================================

describe('refreshSystemCache', () => {
  it('应该强制写入新缓存', async () => {
    mockFs.existsSync.mockReturnValue(true)

    const { refreshSystemCache } = await import('../sysinfo.js')
    refreshSystemCache()

    expect(mockFs.writeFileSync).toHaveBeenCalled()
  })

  it('应该创建配置目录（如果不存在）', async () => {
    mockFs.existsSync.mockReturnValue(false)

    const { refreshSystemCache } = await import('../sysinfo.js')
    refreshSystemCache()

    expect(mockFs.mkdirSync).toHaveBeenCalledWith(CONFIG_DIR, { recursive: true })
  })

  it('新缓存应该包含当前时间戳', async () => {
    mockFs.existsSync.mockReturnValue(true)

    let writtenContent: string = ''
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      writtenContent = content
    })

    const beforeTime = new Date().toISOString()
    const { refreshSystemCache } = await import('../sysinfo.js')
    refreshSystemCache()
    const afterTime = new Date().toISOString()

    const cache = JSON.parse(writtenContent)
    expect(cache.cachedAt >= beforeTime).toBe(true)
    expect(cache.cachedAt <= afterTime).toBe(true)
  })
})

// ============================================================================
// 边界情况测试
// ============================================================================

describe('边界情况', () => {
  it('Windows 系统上应该正确检测', async () => {
    mockIsWindows.mockReturnValue(true)
    mockOs.platform.mockReturnValue('win32')
    mockOs.arch.mockReturnValue('x64')
    mockDetectShell.mockReturnValue('powershell7')
    mockGetShellCapabilities.mockReturnValue({
      displayName: 'PowerShell 7+',
    } as any)
    mockFs.existsSync.mockImplementation((path: any) => {
      if (path === CONFIG_DIR) return true
      return false
    })

    const { getStaticSystemInfo } = await import('../sysinfo.js')
    const info = getStaticSystemInfo()

    expect(info.os).toBe('win32')
    expect(info.shell).toBe('PowerShell 7+')
  })

  it('Linux 系统上应该正确检测', async () => {
    mockOs.platform.mockReturnValue('linux')
    mockOs.arch.mockReturnValue('x64')
    mockDetectShell.mockReturnValue('bash')
    mockGetShellCapabilities.mockReturnValue({
      displayName: 'Bash',
    } as any)
    mockFs.existsSync.mockImplementation((path: any) => {
      if (path === CONFIG_DIR) return true
      return false
    })

    const { getStaticSystemInfo } = await import('../sysinfo.js')
    const info = getStaticSystemInfo()

    expect(info.os).toBe('linux')
    expect(info.shell).toBe('Bash')
  })
})
