/**
 * 聊天历史管理模块测试
 * 测试聊天历史的读写、轮数限制等功能
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

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
    chatHistoryLimit: 10,
  })),
}))

// Mock theme 模块
vi.mock('../ui/theme.js', () => ({
  getCurrentTheme: vi.fn(() => ({
    primary: '#007acc',
  })),
}))

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: vi.fn((s: string) => s),
    gray: vi.fn((s: string) => s),
    hex: vi.fn(() => (s: string) => s),
  },
}))

import fs from 'fs'
import os from 'os'
import { getConfig } from '../config.js'

// 获取 mock 函数引用
const mockFs = vi.mocked(fs)
const mockOs = vi.mocked(os)
const mockGetConfig = vi.mocked(getConfig)

// 模块状态重置辅助
async function resetChatHistoryModule() {
  vi.resetModules()
  return await import('../chat-history.js')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockOs.homedir.mockReturnValue('/home/testuser')
  mockGetConfig.mockReturnValue({
    chatHistoryLimit: 10,
  } as any)
  mockFs.existsSync.mockReturnValue(true)
  mockFs.writeFileSync.mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ============================================================================
// getChatHistory 测试
// ============================================================================

describe('getChatHistory', () => {
  it('应该返回聊天历史数组', async () => {
    const mockHistory = [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好！有什么可以帮你的？' },
    ]
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(mockHistory))

    const { getChatHistory } = await resetChatHistoryModule()
    const history = getChatHistory()

    expect(history).toHaveLength(2)
    expect(history[0].role).toBe('user')
    expect(history[1].role).toBe('assistant')
  })

  it('文件不存在时应该返回空数组', async () => {
    mockFs.existsSync.mockImplementation((path: any) => {
      if (path.includes('chat_history.json')) return false
      return true // 目录存在
    })

    const { getChatHistory } = await resetChatHistoryModule()
    const history = getChatHistory()

    expect(history).toEqual([])
  })

  it('JSON 损坏时应该返回空数组', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('{invalid json')

    const { getChatHistory } = await resetChatHistoryModule()
    const history = getChatHistory()

    expect(history).toEqual([])
  })

  it('应该创建配置目录（如果不存在）', async () => {
    mockFs.existsSync.mockReturnValue(false)

    const { getChatHistory } = await resetChatHistoryModule()
    getChatHistory()

    expect(mockFs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.please'),
      { recursive: true }
    )
  })
})

// ============================================================================
// addChatMessage 测试
// ============================================================================

describe('addChatMessage', () => {
  it('应该添加用户消息和助手消息', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([]))

    let writtenContent: string = ''
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      writtenContent = content
    })

    const { addChatMessage } = await resetChatHistoryModule()
    addChatMessage('你好', '你好！有什么可以帮你的？')

    const saved = JSON.parse(writtenContent)
    expect(saved).toHaveLength(2)
    expect(saved[0].role).toBe('user')
    expect(saved[0].content).toBe('你好')
    expect(saved[1].role).toBe('assistant')
    expect(saved[1].content).toBe('你好！有什么可以帮你的？')
  })

  it('应该追加到现有历史', async () => {
    const existingHistory = [
      { role: 'user', content: '第一条' },
      { role: 'assistant', content: '回复第一条' },
    ]
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(existingHistory))

    let writtenContent: string = ''
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      writtenContent = content
    })

    const { addChatMessage } = await resetChatHistoryModule()
    addChatMessage('第二条', '回复第二条')

    const saved = JSON.parse(writtenContent)
    expect(saved).toHaveLength(4)
    expect(saved[2].content).toBe('第二条')
    expect(saved[3].content).toBe('回复第二条')
  })

  it('应该限制历史轮数（chatHistoryLimit）', async () => {
    mockGetConfig.mockReturnValue({ chatHistoryLimit: 2 } as any)

    // 已有 2 轮（4条消息）
    const existingHistory = [
      { role: 'user', content: '1' },
      { role: 'assistant', content: 'r1' },
      { role: 'user', content: '2' },
      { role: 'assistant', content: 'r2' },
    ]
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(existingHistory))

    let writtenContent: string = ''
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      writtenContent = content
    })

    const { addChatMessage } = await resetChatHistoryModule()
    addChatMessage('3', 'r3')

    const saved = JSON.parse(writtenContent)
    // 应该保留最近 2 轮 = 4 条消息
    expect(saved).toHaveLength(4)
    expect(saved[0].content).toBe('2') // 最早的 1 轮被删除
    expect(saved[2].content).toBe('3')
  })

  it('默认 chatHistoryLimit 为 10', async () => {
    mockGetConfig.mockReturnValue({} as any)

    const existingHistory: any[] = []
    // 添加 11 轮
    for (let i = 0; i < 11; i++) {
      existingHistory.push({ role: 'user', content: `u${i}` })
      existingHistory.push({ role: 'assistant', content: `a${i}` })
    }

    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(existingHistory))

    let writtenContent: string = ''
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      writtenContent = content
    })

    const { addChatMessage } = await resetChatHistoryModule()
    addChatMessage('新消息', '新回复')

    const saved = JSON.parse(writtenContent)
    // 应该保留最近 10 轮 = 20 条消息
    expect(saved).toHaveLength(20)
  })
})

// ============================================================================
// clearChatHistory 测试
// ============================================================================

describe('clearChatHistory', () => {
  it('应该清空聊天历史', async () => {
    mockFs.existsSync.mockReturnValue(true)

    let writtenContent: string = ''
    mockFs.writeFileSync.mockImplementation((path: any, content: any) => {
      writtenContent = content
    })

    const { clearChatHistory } = await resetChatHistoryModule()
    clearChatHistory()

    const saved = JSON.parse(writtenContent)
    expect(saved).toEqual([])
  })
})

// ============================================================================
// getChatHistoryFilePath 测试
// ============================================================================

describe('getChatHistoryFilePath', () => {
  it('应该返回正确的历史文件路径', async () => {
    mockOs.homedir.mockReturnValue('/home/testuser')

    const { getChatHistoryFilePath } = await resetChatHistoryModule()
    const filePath = getChatHistoryFilePath()

    expect(filePath).toContain('.please')
    expect(filePath).toContain('chat_history.json')
  })
})

// ============================================================================
// getChatRoundCount 测试
// ============================================================================

describe('getChatRoundCount', () => {
  it('空历史应该返回 0', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([]))

    const { getChatRoundCount } = await resetChatHistoryModule()
    const count = getChatRoundCount()

    expect(count).toBe(0)
  })

  it('应该计算正确的轮数', async () => {
    const history = [
      { role: 'user', content: '1' },
      { role: 'assistant', content: 'r1' },
      { role: 'user', content: '2' },
      { role: 'assistant', content: 'r2' },
      { role: 'user', content: '3' },
      { role: 'assistant', content: 'r3' },
    ]
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(history))

    const { getChatRoundCount } = await resetChatHistoryModule()
    const count = getChatRoundCount()

    expect(count).toBe(3)
  })

  it('奇数消息应该向下取整', async () => {
    const history = [
      { role: 'user', content: '1' },
      { role: 'assistant', content: 'r1' },
      { role: 'user', content: '2' },
      // 缺少 assistant 回复
    ]
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(history))

    const { getChatRoundCount } = await resetChatHistoryModule()
    const count = getChatRoundCount()

    expect(count).toBe(1) // 3 条消息 / 2 = 1（向下取整）
  })
})

// ============================================================================
// displayChatHistory 测试
// ============================================================================

describe('displayChatHistory', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  it('应该显示对话历史', async () => {
    const history = [
      { role: 'user', content: '检查磁盘' },
      { role: 'assistant', content: '好的，我帮你检查' },
      { role: 'user', content: '查看进程' },
      { role: 'assistant', content: '好的，我帮你查看' },
    ]
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(history))

    const { displayChatHistory } = await resetChatHistoryModule()
    displayChatHistory()

    expect(consoleLogSpy).toHaveBeenCalled()
    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('对话历史')
    expect(allCalls).toContain('检查磁盘')
    expect(allCalls).toContain('查看进程')
  })

  it('空历史时应该显示提示信息', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify([]))

    const { displayChatHistory } = await resetChatHistoryModule()
    displayChatHistory()

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('暂无对话历史')
  })

  it('应该只显示用户消息（不显示助手消息）', async () => {
    const history = [
      { role: 'user', content: '用户问题1' },
      { role: 'assistant', content: 'AI回答1' },
      { role: 'user', content: '用户问题2' },
      { role: 'assistant', content: 'AI回答2' },
    ]
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(history))

    const { displayChatHistory } = await resetChatHistoryModule()
    displayChatHistory()

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('用户问题1')
    expect(allCalls).toContain('用户问题2')
    // 助手消息不应该显示
    expect(allCalls).not.toContain('AI回答1')
    expect(allCalls).not.toContain('AI回答2')
  })

  it('应该显示配置信息', async () => {
    mockGetConfig.mockReturnValue({ chatHistoryLimit: 15 } as any)
    const history = [
      { role: 'user', content: '测试' },
      { role: 'assistant', content: '回复' },
    ]
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(history))

    const { displayChatHistory } = await resetChatHistoryModule()
    displayChatHistory()

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('配置')
    expect(allCalls).toContain('15')
  })

  it('应该显示文件路径', async () => {
    const history = [
      { role: 'user', content: '测试' },
      { role: 'assistant', content: '回复' },
    ]
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(history))

    const { displayChatHistory } = await resetChatHistoryModule()
    displayChatHistory()

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    expect(allCalls).toContain('文件')
    expect(allCalls).toContain('chat_history.json')
  })

  it('应该显示正确的轮数', async () => {
    const history = [
      { role: 'user', content: '问题1' },
      { role: 'assistant', content: '回答1' },
      { role: 'user', content: '问题2' },
      { role: 'assistant', content: '回答2' },
      { role: 'user', content: '问题3' },
      { role: 'assistant', content: '回答3' },
    ]
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(history))

    const { displayChatHistory } = await resetChatHistoryModule()
    displayChatHistory()

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    // 应该显示 "最近 3 轮"（3个用户消息）
    expect(allCalls).toContain('3')
  })

  it('应该带编号显示消息', async () => {
    const history = [
      { role: 'user', content: '第一条问题' },
      { role: 'assistant', content: '第一条回答' },
      { role: 'user', content: '第二条问题' },
      { role: 'assistant', content: '第二条回答' },
    ]
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue(JSON.stringify(history))

    const { displayChatHistory } = await resetChatHistoryModule()
    displayChatHistory()

    const allCalls = consoleLogSpy.mock.calls.map(call => call[0]).join('\n')
    // 验证编号存在（1. 和 2.）
    expect(allCalls).toContain('1')
    expect(allCalls).toContain('2')
    expect(allCalls).toContain('第一条问题')
    expect(allCalls).toContain('第二条问题')
  })
})
