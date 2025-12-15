import fs from 'fs'
import path from 'path'
import os from 'os'
import chalk from 'chalk'
import { getConfig } from './config.js'

const CONFIG_DIR = path.join(os.homedir(), '.please')
const CHAT_HISTORY_FILE = path.join(CONFIG_DIR, 'chat_history.json')

/**
 * 聊天消息
 */
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * 确保配置目录存在
 */
function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

/**
 * 读取对话历史
 */
export function getChatHistory(): ChatMessage[] {
  ensureConfigDir()

  if (!fs.existsSync(CHAT_HISTORY_FILE)) {
    return []
  }

  try {
    const content = fs.readFileSync(CHAT_HISTORY_FILE, 'utf-8')
    return JSON.parse(content) as ChatMessage[]
  } catch {
    return []
  }
}

/**
 * 保存对话历史
 */
function saveChatHistory(history: ChatMessage[]): void {
  ensureConfigDir()
  fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify(history, null, 2))
}

/**
 * 添加一轮对话（用户问题 + AI 回答）
 */
export function addChatMessage(userMessage: string, assistantMessage: string): void {
  const config = getConfig()
  const history = getChatHistory()

  // 添加新的对话
  history.push({ role: 'user', content: userMessage })
  history.push({ role: 'assistant', content: assistantMessage })

  // 计算当前轮数（每 2 条消息 = 1 轮）
  const currentRounds = Math.floor(history.length / 2)
  const maxRounds = config.chatHistoryLimit || 10

  // 如果超出限制，移除最早的对话
  if (currentRounds > maxRounds) {
    // 需要移除的轮数
    const removeRounds = currentRounds - maxRounds
    // 移除最早的 N 轮（N*2 条消息）
    history.splice(0, removeRounds * 2)
  }

  saveChatHistory(history)
}

/**
 * 清空对话历史
 */
export function clearChatHistory(): void {
  saveChatHistory([])
}

/**
 * 获取对话历史文件路径
 */
export function getChatHistoryFilePath(): string {
  return CHAT_HISTORY_FILE
}

/**
 * 获取当前对话轮数
 */
export function getChatRoundCount(): number {
  const history = getChatHistory()
  return Math.floor(history.length / 2)
}

/**
 * 显示对话历史（只显示用户的 prompt）
 */
export function displayChatHistory(): void {
  const history = getChatHistory()
  const config = getConfig()

  if (history.length === 0) {
    console.log('\n' + chalk.gray('暂无对话历史'))
    console.log('')
    return
  }

  // 只提取用户消息
  const userMessages = history.filter((msg) => msg.role === 'user')

  console.log('')
  console.log(chalk.bold(`对话历史（最近 ${userMessages.length} 轮）:`))
  console.log(chalk.gray('━'.repeat(50)))

  userMessages.forEach((msg, index) => {
    const num = index + 1
    console.log(`  ${chalk.cyan(num.toString().padStart(2, ' '))}. ${msg.content}`)
  })

  console.log(chalk.gray('━'.repeat(50)))
  console.log(chalk.gray(`配置: 保留最近 ${config.chatHistoryLimit} 轮对话`))
  console.log(chalk.gray(`文件: ${CHAT_HISTORY_FILE}`))
  console.log('')
}
