/**
 * 命令历史记录模块测试
 * 测试历史记录的读写、格式化等功能
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { plsHistory, emptyHistory } from '../../tests/fixtures/history'

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
    homedir: vi.fn(() => '/home/testuser'),
  },
}))

// Mock config 模块
vi.mock('../config.js', () => ({
  getConfig: vi.fn(() => ({
    commandHistoryLimit: 10,
  })),
}))

import fs from 'fs'
import os from 'os'
import { getConfig } from '../config.js'

// 获取 mock 函数引用
const mockFs = vi.mocked(fs)
const mockOs = vi.mocked(os)
const mockGetConfig = vi.mocked(getConfig)

// 模块状态重置辅助
async function resetHistoryModule() {
  vi.resetModules()
  return await import('../history.js')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockOs.homedir.mockReturnValue('/home/testuser')
  mockGetConfig.mockReturnValue({
    commandHistoryLimit: 10,
  } as any)
  mockFs.existsSync.mockReturnValue(true)
  mockFs.writeFileSync.mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ============================================================================
// getHistory 测试
// ============================================================================

describe('getHistory', () => {
  it('应该返回历史记录数组', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(plsHistory))

    const { getHistory } = await resetHistoryModule()
    const history = getHistory()

    expect(Array.isArray(history)).toBe(true)
    expect(history.length).toBe(plsHistory.length)
  })

  it('历史文件不存在时应该返回空数组', async () => {
    mockFs.existsSync.mockImplementation((path: any) => {
      if (path.includes('history.json')) return false
      return true // 目录存在
    })

    const { getHistory } = await resetHistoryModule()
    const history = getHistory()

    expect(history).toEqual([])
  })

  it('JSON 损坏时应该返回空数组', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('{invalid json')

    const { getHistory } = await resetHistoryModule()
    const history = getHistory()

    expect(history).toEqual([])
  })

  it('应该包含正确的历史记录字段', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(plsHistory))

    const { getHistory } = await resetHistoryModule()
    const history = getHistory()

    expect(history[0].userPrompt).toBe('安装 git')
    expect(history[0].command).toBe('brew install git')
    expect(history[0].executed).toBe(true)
    expect(history[0].exitCode).toBe(0)
  })

  it('应该创建配置目录（如果不存在）', async () => {
    mockFs.existsSync.mockReturnValue(false)

    const { getHistory } = await resetHistoryModule()
    getHistory()

    expect(mockFs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.please'),
      { recursive: true }
    )
  })
})

// ============================================================================
// addHistory 测试
// ============================================================================

describe('addHistory', () => {
  it('应该添加新记录到历史', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([]))

    let writtenContent: string = ''
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      writtenContent = content
    })

    const { addHistory } = await resetHistoryModule()
    addHistory({
      userPrompt: '测试命令',
      command: 'echo test',
      executed: true,
      exitCode: 0,
    })

    const saved = JSON.parse(writtenContent)
    expect(saved.length).toBe(1)
    expect(saved[0].userPrompt).toBe('测试命令')
    expect(saved[0].command).toBe('echo test')
  })

  it('应该添加时间戳', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([]))

    let writtenContent: string = ''
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      writtenContent = content
    })

    const beforeTime = new Date().toISOString()
    const { addHistory } = await resetHistoryModule()
    addHistory({
      userPrompt: '测试',
      command: 'test',
      executed: true,
      exitCode: 0,
    })
    const afterTime = new Date().toISOString()

    const saved = JSON.parse(writtenContent)
    expect(saved[0].timestamp).toBeDefined()
    expect(saved[0].timestamp >= beforeTime).toBe(true)
    expect(saved[0].timestamp <= afterTime).toBe(true)
  })

  it('应该将新记录添加到开头', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([
      { userPrompt: '旧命令', command: 'old', executed: true, exitCode: 0 },
    ]))

    let writtenContent: string = ''
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      writtenContent = content
    })

    const { addHistory } = await resetHistoryModule()
    addHistory({
      userPrompt: '新命令',
      command: 'new',
      executed: true,
      exitCode: 0,
    })

    const saved = JSON.parse(writtenContent)
    expect(saved[0].userPrompt).toBe('新命令')
    expect(saved[1].userPrompt).toBe('旧命令')
  })

  it('应该限制历史记录条数（commandHistoryLimit）', async () => {
    mockGetConfig.mockReturnValue({ commandHistoryLimit: 3 } as any)

    // 已有 3 条记录
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([
      { userPrompt: '1', command: 'c1', executed: true, exitCode: 0 },
      { userPrompt: '2', command: 'c2', executed: true, exitCode: 0 },
      { userPrompt: '3', command: 'c3', executed: true, exitCode: 0 },
    ]))

    let writtenContent: string = ''
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      writtenContent = content
    })

    const { addHistory } = await resetHistoryModule()
    addHistory({
      userPrompt: '新命令',
      command: 'new',
      executed: true,
      exitCode: 0,
    })

    const saved = JSON.parse(writtenContent)
    expect(saved.length).toBe(3) // 限制为 3 条
    expect(saved[0].userPrompt).toBe('新命令')
    expect(saved[2].userPrompt).toBe('2') // 最旧的被删除
  })

  it('应该截断过长的输出', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([]))

    let writtenContent: string = ''
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      writtenContent = content
    })

    const longOutput = 'a'.repeat(1000) // 超过 500 字符

    const { addHistory } = await resetHistoryModule()
    addHistory({
      userPrompt: '测试',
      command: 'test',
      executed: true,
      exitCode: 0,
      output: longOutput,
    })

    const saved = JSON.parse(writtenContent)
    expect(saved[0].output.length).toBeLessThan(longOutput.length)
    expect(saved[0].output).toContain('...(截断)')
  })

  it('应该记录 userModified 标记', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([]))

    let writtenContent: string = ''
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      writtenContent = content
    })

    const { addHistory } = await resetHistoryModule()
    addHistory({
      userPrompt: '查看目录',
      aiGeneratedCommand: 'ls -la',
      command: 'eza -la',
      userModified: true,
      executed: true,
      exitCode: 0,
    })

    const saved = JSON.parse(writtenContent)
    expect(saved[0].userModified).toBe(true)
    expect(saved[0].aiGeneratedCommand).toBe('ls -la')
    expect(saved[0].command).toBe('eza -la')
  })

  it('应该记录 builtin 原因', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([]))

    let writtenContent: string = ''
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      writtenContent = content
    })

    const { addHistory } = await resetHistoryModule()
    addHistory({
      userPrompt: '删除文件',
      command: 'rm -rf *',
      executed: false,
      exitCode: null,
      reason: 'builtin',
    })

    const saved = JSON.parse(writtenContent)
    expect(saved[0].executed).toBe(false)
    expect(saved[0].reason).toBe('builtin')
  })
})

// ============================================================================
// clearHistory 测试
// ============================================================================

describe('clearHistory', () => {
  it('应该清空历史记录', async () => {
    mockFs.existsSync.mockReturnValue(true)

    let writtenContent: string = ''
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      writtenContent = content
    })

    const { clearHistory } = await resetHistoryModule()
    clearHistory()

    const saved = JSON.parse(writtenContent)
    expect(saved).toEqual([])
  })
})

// ============================================================================
// formatHistoryForAI 测试
// ============================================================================

describe('formatHistoryForAI', () => {
  it('应该格式化历史记录为字符串', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([
      {
        userPrompt: '安装 git',
        command: 'brew install git',
        executed: true,
        exitCode: 0,
        timestamp: new Date().toISOString(),
      },
    ]))

    const { formatHistoryForAI } = await resetHistoryModule()
    const formatted = formatHistoryForAI()

    expect(formatted).toContain('安装 git')
    expect(formatted).toContain('brew install git')
    expect(formatted).toContain('✓')
  })

  it('空历史应该返回空字符串', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([]))

    const { formatHistoryForAI } = await resetHistoryModule()
    const formatted = formatHistoryForAI()

    expect(formatted).toBe('')
  })

  it('失败命令应该显示退出码', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([
      {
        userPrompt: '测试',
        command: 'false',
        executed: true,
        exitCode: 1,
        timestamp: new Date().toISOString(),
      },
    ]))

    const { formatHistoryForAI } = await resetHistoryModule()
    const formatted = formatHistoryForAI()

    expect(formatted).toContain('✗')
    expect(formatted).toContain('退出码:1')
  })

  it('builtin 命令应该标记未执行', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([
      {
        userPrompt: '删除文件',
        command: 'rm -rf *',
        executed: false,
        exitCode: null,
        reason: 'builtin',
        timestamp: new Date().toISOString(),
      },
    ]))

    const { formatHistoryForAI } = await resetHistoryModule()
    const formatted = formatHistoryForAI()

    expect(formatted).toContain('builtin')
    expect(formatted).toContain('未执行')
  })

  it('用户修改的命令应该显示 AI 生成和用户修改', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([
      {
        userPrompt: '查看目录',
        aiGeneratedCommand: 'ls -la',
        command: 'eza -la',
        userModified: true,
        executed: true,
        exitCode: 0,
        timestamp: new Date().toISOString(),
      },
    ]))

    const { formatHistoryForAI } = await resetHistoryModule()
    const formatted = formatHistoryForAI()

    expect(formatted).toContain('AI 生成')
    expect(formatted).toContain('ls -la')
    expect(formatted).toContain('用户修改')
    expect(formatted).toContain('eza -la')
  })

  it('用户取消的命令应该正确标记', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([
      {
        userPrompt: '测试',
        command: 'test',
        executed: false,
        exitCode: null,
        timestamp: new Date().toISOString(),
      },
    ]))

    const { formatHistoryForAI } = await resetHistoryModule()
    const formatted = formatHistoryForAI()

    expect(formatted).toContain('用户取消')
  })

  it('应该包含标题', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([
      {
        userPrompt: '测试',
        command: 'test',
        executed: true,
        exitCode: 0,
        timestamp: new Date().toISOString(),
      },
    ]))

    const { formatHistoryForAI } = await resetHistoryModule()
    const formatted = formatHistoryForAI()

    expect(formatted).toContain('最近通过 pls 执行的命令')
  })

  it('失败命令应该附加输出摘要', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([
      {
        userPrompt: '测试',
        command: 'false',
        executed: true,
        exitCode: 1,
        output: 'Error: command failed\nsome details',
        timestamp: new Date().toISOString(),
      },
    ]))

    const { formatHistoryForAI } = await resetHistoryModule()
    const formatted = formatHistoryForAI()

    expect(formatted).toContain('输出:')
    expect(formatted).toContain('Error: command failed')
  })
})

// ============================================================================
// getHistoryFilePath 测试
// ============================================================================

describe('getHistoryFilePath', () => {
  it('应该返回正确的历史文件路径', async () => {
    mockOs.homedir.mockReturnValue('/home/testuser')

    const { getHistoryFilePath } = await resetHistoryModule()
    const path = getHistoryFilePath()

    expect(path).toContain('.please')
    expect(path).toContain('history.json')
  })
})

// ============================================================================
// 时间显示测试
// ============================================================================

describe('时间显示', () => {
  it('刚刚执行的命令应该显示"刚刚"', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([
      {
        userPrompt: '测试',
        command: 'test',
        executed: true,
        exitCode: 0,
        timestamp: new Date().toISOString(),
      },
    ]))

    const { formatHistoryForAI } = await resetHistoryModule()
    const formatted = formatHistoryForAI()

    expect(formatted).toContain('刚刚')
  })

  it('没有时间戳的记录应该显示"未知"', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([
      {
        userPrompt: '测试',
        command: 'test',
        executed: true,
        exitCode: 0,
        // 没有 timestamp
      },
    ]))

    const { formatHistoryForAI } = await resetHistoryModule()
    const formatted = formatHistoryForAI()

    expect(formatted).toContain('未知')
  })
})
