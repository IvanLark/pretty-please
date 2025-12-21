/**
 * Mock 工厂函数库
 * 为测试提供可复用的 Mock 对象
 */

import { vi } from 'vitest'
import type { Mock } from 'vitest'

// ============================================================================
// 文件系统 Mock
// ============================================================================

export interface FsMock {
  existsSync: Mock
  readFileSync: Mock
  writeFileSync: Mock
  appendFileSync: Mock
  unlinkSync: Mock
  mkdirSync: Mock
  copyFileSync: Mock
  statSync: Mock
  readdirSync: Mock
}

export function createFsMock(): FsMock {
  const mockFs: FsMock = {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    mkdirSync: vi.fn(),
    copyFileSync: vi.fn(),
    statSync: vi.fn(),
    readdirSync: vi.fn(),
  }

  // 默认行为：文件不存在
  mockFs.existsSync.mockReturnValue(false)
  mockFs.readFileSync.mockReturnValue('')
  mockFs.readdirSync.mockReturnValue([])

  return mockFs
}

/**
 * 创建文件系统场景 Mock
 */
export const fsScenarios = {
  /** 文件不存在 */
  fileNotExists: {
    existsSync: false,
    readFileSync: new Error('ENOENT: no such file or directory'),
  },

  /** 文件已存在 */
  fileExists: (content: string) => ({
    existsSync: true,
    readFileSync: content,
  }),

  /** 文件损坏（无效 JSON） */
  fileCorrupted: {
    existsSync: true,
    readFileSync: '{invalid json}',
  },

  /** 权限错误 */
  permissionDenied: {
    writeFileSync: new Error('EACCES: permission denied'),
    appendFileSync: new Error('EACCES: permission denied'),
    unlinkSync: new Error('EACCES: permission denied'),
  },

  /** 磁盘空间不足 */
  diskFull: {
    writeFileSync: new Error('ENOSPC: no space left on device'),
    appendFileSync: new Error('ENOSPC: no space left on device'),
  },
}

/**
 * 应用文件系统场景到 Mock
 */
export function applyFsScenario(mockFs: FsMock, scenario: any) {
  if (scenario.existsSync !== undefined) {
    mockFs.existsSync.mockReturnValue(scenario.existsSync)
  }

  if (scenario.readFileSync instanceof Error) {
    mockFs.readFileSync.mockImplementation(() => {
      throw scenario.readFileSync
    })
  } else if (scenario.readFileSync !== undefined) {
    mockFs.readFileSync.mockReturnValue(scenario.readFileSync)
  }

  if (scenario.writeFileSync instanceof Error) {
    mockFs.writeFileSync.mockImplementation(() => {
      throw scenario.writeFileSync
    })
  }

  if (scenario.appendFileSync instanceof Error) {
    mockFs.appendFileSync.mockImplementation(() => {
      throw scenario.appendFileSync
    })
  }

  if (scenario.unlinkSync instanceof Error) {
    mockFs.unlinkSync.mockImplementation(() => {
      throw scenario.unlinkSync
    })
  }
}

// ============================================================================
// 子进程 Mock
// ============================================================================

export interface ChildProcessMock {
  exec: Mock
  spawn: Mock
  execSync: Mock
}

export function createChildProcessMock(): ChildProcessMock {
  return {
    exec: vi.fn(),
    spawn: vi.fn(),
    execSync: vi.fn(),
  }
}

/**
 * 创建命令存在性检测 Mock
 * @param commands 命令名到是否存在的映射
 */
export function mockCommandExists(commands: Record<string, boolean>): Mock {
  return vi.fn((cmd: string, callback?: Function) => {
    // 从命令中提取命令名
    const cmdName = extractCommandName(cmd)
    const exists = commands[cmdName] ?? false

    if (callback) {
      // exec 格式 (callback)
      if (exists) {
        callback(null, `/usr/bin/${cmdName}`, '')
      } else {
        callback(new Error('Command not found'), '', `${cmdName}: command not found`)
      }
    } else {
      // execSync 格式 (throw)
      if (exists) {
        return `/usr/bin/${cmdName}`
      } else {
        throw new Error(`${cmdName}: command not found`)
      }
    }
  })
}

/**
 * 从命令字符串中提取命令名
 */
function extractCommandName(cmd: string): string {
  // 处理不同的命令检测格式
  // Unix: command -v git
  // Windows: where git
  // PowerShell: Get-Command git
  const patterns = [
    /command -v (\w+)/,
    /where (\w+)/,
    /Get-Command (\w+)/,
    /which (\w+)/,
  ]

  for (const pattern of patterns) {
    const match = cmd.match(pattern)
    if (match) {
      return match[1]
    }
  }

  // 如果没有匹配到，返回命令本身（去掉参数）
  return cmd.split(' ')[0]
}

/**
 * 子进程场景
 */
export const childProcessScenarios = {
  /** 命令成功执行 */
  success: (output: string = 'success', exitCode: number = 0) => ({
    stdout: output,
    stderr: '',
    exitCode,
  }),

  /** 命令执行失败 */
  failure: (error: string = 'error', exitCode: number = 1) => ({
    stdout: '',
    stderr: error,
    exitCode,
  }),

  /** 超时 */
  timeout: {
    error: new Error('ETIMEDOUT'),
  },

  /** 命令不存在 */
  commandNotFound: {
    stdout: '',
    stderr: 'command not found',
    exitCode: 127,
  },
}

// ============================================================================
// SSH Mock (远程执行)
// ============================================================================

export interface SshMockResult {
  stdout?: string
  stderr?: string
  exitCode?: number
  error?: Error
}

export function createSshMock() {
  return {
    exec: vi.fn((cmd: string) => {
      return Promise.resolve({
        stdout: 'mock output',
        stderr: '',
        exitCode: 0,
      })
    }),
    connect: vi.fn(() => Promise.resolve()),
    disconnect: vi.fn(() => Promise.resolve()),
  }
}

/**
 * SSH 执行场景
 */
export const sshScenarios = {
  /** 成功执行 */
  success: (output: string = 'ok'): SshMockResult => ({
    stdout: output,
    stderr: '',
    exitCode: 0,
  }),

  /** 执行失败 */
  failure: (error: string = 'error'): SshMockResult => ({
    stdout: '',
    stderr: error,
    exitCode: 1,
  }),

  /** 连接超时 */
  timeout: {
    error: new Error('ETIMEDOUT'),
  },

  /** 认证失败 */
  authFailed: {
    error: new Error('Authentication failed'),
  },

  /** 主机不可达 */
  hostUnreachable: {
    error: new Error('EHOSTUNREACH'),
  },

  /** 连接被拒绝 */
  connectionRefused: {
    error: new Error('ECONNREFUSED'),
  },
}

/**
 * 应用 SSH 场景到 Mock
 */
export function applySshScenario(sshMock: any, scenario: SshMockResult) {
  sshMock.exec.mockImplementation((cmd: string) => {
    if (scenario.error) {
      return Promise.reject(scenario.error)
    }
    return Promise.resolve({
      stdout: scenario.stdout ?? '',
      stderr: scenario.stderr ?? '',
      exitCode: scenario.exitCode ?? 0,
    })
  })
}

// ============================================================================
// Ink 组件 Mock
// ============================================================================

/**
 * Mock Ink Text Input 组件
 */
export function mockInkTextInput() {
  return vi.fn(({ value, onChange, onSubmit }: any) => {
    // 在测试中可以手动触发 onSubmit
    return {
      value,
      onChange,
      onSubmit,
      triggerSubmit: (newValue: string) => onSubmit?.(newValue),
    }
  })
}

/**
 * Mock Ink Spinner 组件
 */
export function mockInkSpinner() {
  return vi.fn(() => 'Loading...')
}

/**
 * Mock Ink Select Input 组件
 */
export function mockInkSelectInput() {
  return vi.fn(({ items, onSelect }: any) => {
    return {
      items,
      onSelect,
      selectItem: (index: number) => onSelect?.(items[index]),
    }
  })
}

// ============================================================================
// 环境变量 Mock
// ============================================================================

/**
 * 保存原始环境变量
 */
export function saveEnv(): NodeJS.ProcessEnv {
  return { ...process.env }
}

/**
 * 恢复环境变量
 */
export function restoreEnv(originalEnv: NodeJS.ProcessEnv) {
  process.env = { ...originalEnv }
}

/**
 * Mock 环境变量
 */
export function mockEnv(env: Record<string, string | undefined>) {
  Object.keys(env).forEach((key) => {
    if (env[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = env[key]
    }
  })
}

/**
 * 清除环境变量
 */
export function clearEnv(keys: string[]) {
  keys.forEach((key) => {
    delete process.env[key]
  })
}

// ============================================================================
// Platform Mock
// ============================================================================

/**
 * Mock process.platform
 */
export function mockPlatform(platform: 'win32' | 'darwin' | 'linux') {
  vi.stubGlobal('process', {
    ...process,
    platform,
  })
}

/**
 * 恢复 process.platform
 */
export function restorePlatform() {
  vi.unstubAllGlobals()
}

// ============================================================================
// 测试辅助函数
// ============================================================================

/**
 * 等待异步操作完成
 */
export async function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 创建临时目录（测试用）
 */
export function createTempDir(): string {
  const os = require('os')
  const fs = require('fs')
  const path = require('path')

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pls-test-'))
  return tempDir
}

/**
 * 清理临时目录
 */
export function cleanupTempDir(dir: string) {
  const fs = require('fs')
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * 创建测试配置文件
 */
export function createTestConfig(config: any): string {
  const fs = require('fs')
  const path = require('path')
  const os = require('os')

  const tempDir = createTempDir()
  const configPath = path.join(tempDir, 'config.json')
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

  return configPath
}
