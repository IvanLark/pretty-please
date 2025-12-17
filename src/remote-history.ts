/**
 * 远程服务器历史管理模块
 * 管理每个远程服务器的命令历史
 */

import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import { CONFIG_DIR, getConfig } from './config.js'
import { getCurrentTheme } from './ui/theme.js'
import { sshExec, getRemote } from './remote.js'

// 获取主题颜色
function getColors() {
  const theme = getCurrentTheme()
  return {
    primary: theme.primary,
    secondary: theme.secondary,
    success: theme.success,
    error: theme.error,
    warning: theme.warning,
    muted: theme.text.muted,
  }
}

// 远程服务器数据目录
const REMOTES_DIR = path.join(CONFIG_DIR, 'remotes')

/**
 * 远程命令历史记录
 */
export interface RemoteHistoryRecord {
  userPrompt: string
  command: string
  aiGeneratedCommand?: string  // AI 原始命令
  userModified?: boolean       // 用户是否修改
  executed: boolean
  exitCode: number | null
  output: string
  timestamp: string
  reason?: string              // 未执行原因
}

/**
 * Shell 历史记录项
 */
export interface RemoteShellHistoryItem {
  cmd: string
  exit: number
  time: string
}

// ================== 命令历史管理 ==================

/**
 * 获取远程服务器历史文件路径
 */
function getRemoteHistoryPath(name: string): string {
  return path.join(REMOTES_DIR, name, 'history.json')
}

/**
 * 获取远程服务器命令历史
 */
export function getRemoteHistory(name: string): RemoteHistoryRecord[] {
  const historyPath = getRemoteHistoryPath(name)

  if (!fs.existsSync(historyPath)) {
    return []
  }

  try {
    const content = fs.readFileSync(historyPath, 'utf-8')
    return JSON.parse(content) as RemoteHistoryRecord[]
  } catch {
    return []
  }
}

/**
 * 添加远程命令历史记录
 */
export function addRemoteHistory(name: string, record: Omit<RemoteHistoryRecord, 'timestamp'>): void {
  const config = getConfig()
  const historyPath = getRemoteHistoryPath(name)

  // 确保目录存在
  const dir = path.dirname(historyPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  let history = getRemoteHistory(name)

  // 添加新记录
  history.push({
    ...record,
    timestamp: new Date().toISOString(),
  })

  // 限制历史数量
  const limit = config.commandHistoryLimit || 10
  if (history.length > limit) {
    history = history.slice(-limit)
  }

  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2))
}

/**
 * 清空远程命令历史
 */
export function clearRemoteHistory(name: string): void {
  const historyPath = getRemoteHistoryPath(name)
  if (fs.existsSync(historyPath)) {
    fs.unlinkSync(historyPath)
  }
}

/**
 * 格式化远程命令历史供 AI 使用
 */
export function formatRemoteHistoryForAI(name: string): string {
  const history = getRemoteHistory(name)

  if (history.length === 0) {
    return ''
  }

  const lines = history.map((record, index) => {
    let status = ''
    if (record.reason === 'builtin') {
      status = '(包含 builtin，未执行)'
    } else if (record.executed) {
      status = record.exitCode === 0 ? '✓' : `✗ 退出码:${record.exitCode}`
    } else {
      status = '(用户取消执行)'
    }

    // 显示用户修改信息
    if (record.userModified && record.aiGeneratedCommand) {
      return `${index + 1}. "${record.userPrompt}" → AI 生成: ${record.aiGeneratedCommand} / 用户修改为: ${record.command} ${status}`
    } else {
      return `${index + 1}. "${record.userPrompt}" → ${record.command} ${status}`
    }
  })

  return `【该服务器最近通过 pls 执行的命令】\n${lines.join('\n')}`
}

/**
 * 显示远程命令历史
 */
export function displayRemoteHistory(name: string): void {
  const remote = getRemote(name)
  const history = getRemoteHistory(name)
  const colors = getColors()

  if (!remote) {
    console.log('')
    console.log(chalk.hex(colors.error)(`✗ 服务器 "${name}" 不存在`))
    console.log('')
    return
  }

  console.log('')

  if (history.length === 0) {
    console.log(chalk.gray(`  服务器 "${name}" 暂无命令历史`))
    console.log('')
    return
  }

  console.log(chalk.bold(`📜 服务器 "${name}" 命令历史:`))
  console.log(chalk.gray('━'.repeat(50)))

  history.forEach((item, index) => {
    const status = item.executed
      ? item.exitCode === 0
        ? chalk.hex(colors.success)('✓')
        : chalk.hex(colors.error)(`✗ 退出码:${item.exitCode}`)
      : chalk.gray('(未执行)')

    console.log(`\n${chalk.gray(`${index + 1}.`)} ${chalk.hex(colors.primary)(item.userPrompt)}`)

    // 显示用户修改信息
    if (item.userModified && item.aiGeneratedCommand) {
      console.log(`   ${chalk.dim('AI 生成:')} ${chalk.gray(item.aiGeneratedCommand)}`)
      console.log(`   ${chalk.dim('用户修改为:')} ${item.command} ${status} ${chalk.hex(colors.warning)('(已修改)')}`)
    } else {
      console.log(`   ${chalk.dim('→')} ${item.command} ${status}`)
    }

    console.log(`   ${chalk.gray(item.timestamp)}`)
  })

  console.log('')
  console.log(chalk.gray('━'.repeat(50)))
  console.log(chalk.gray(`历史文件: ${getRemoteHistoryPath(name)}`))
  console.log('')
}

// ================== Shell 历史管理 ==================

// 远程 shell 历史的本地缓存文件
function getRemoteShellHistoryPath(name: string): string {
  return path.join(REMOTES_DIR, name, 'shell_history.jsonl')
}

/**
 * 从远程服务器读取 shell 历史
 * 读取远程 ~/.please/shell_history.jsonl
 */
export async function fetchRemoteShellHistory(name: string): Promise<RemoteShellHistoryItem[]> {
  const config = getConfig()
  const limit = config.shellHistoryLimit || 15

  try {
    // 读取远程 shell 历史文件
    const result = await sshExec(name, `tail -n ${limit} ~/.please/shell_history.jsonl 2>/dev/null || echo ""`, {
      timeout: 10000,
    })

    if (result.exitCode !== 0 || !result.stdout.trim()) {
      return []
    }

    const lines = result.stdout.trim().split('\n').filter(line => line.trim())
    const items: RemoteShellHistoryItem[] = []

    for (const line of lines) {
      try {
        const item = JSON.parse(line) as RemoteShellHistoryItem
        items.push(item)
      } catch {
        // 跳过无效行
      }
    }

    // 缓存到本地
    saveRemoteShellHistoryCache(name, items)

    return items
  } catch {
    // 如果无法连接，尝试返回缓存
    return getRemoteShellHistoryCache(name)
  }
}

/**
 * 保存远程 shell 历史缓存到本地
 */
function saveRemoteShellHistoryCache(name: string, items: RemoteShellHistoryItem[]): void {
  const cachePath = getRemoteShellHistoryPath(name)

  // 确保目录存在
  const dir = path.dirname(cachePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const content = items.map(item => JSON.stringify(item)).join('\n')
  fs.writeFileSync(cachePath, content)
}

/**
 * 获取本地缓存的远程 shell 历史
 */
function getRemoteShellHistoryCache(name: string): RemoteShellHistoryItem[] {
  const cachePath = getRemoteShellHistoryPath(name)

  if (!fs.existsSync(cachePath)) {
    return []
  }

  try {
    const content = fs.readFileSync(cachePath, 'utf-8')
    const lines = content.trim().split('\n').filter(line => line.trim())

    return lines.map(line => {
      try {
        return JSON.parse(line) as RemoteShellHistoryItem
      } catch {
        return null
      }
    }).filter((item): item is RemoteShellHistoryItem => item !== null)
  } catch {
    return []
  }
}

/**
 * 格式化远程 shell 历史供 AI 使用
 */
export function formatRemoteShellHistoryForAI(items: RemoteShellHistoryItem[]): string {
  if (items.length === 0) {
    return ''
  }

  const lines = items.map((item, index) => {
    const status = item.exit === 0 ? '✓' : `✗ 退出码:${item.exit}`
    return `${index + 1}. ${item.cmd} ${status}`
  })

  return `【该服务器终端最近执行的命令】\n${lines.join('\n')}`
}

/**
 * 显示远程 shell 历史
 */
export async function displayRemoteShellHistory(name: string): Promise<void> {
  const remote = getRemote(name)
  const colors = getColors()

  if (!remote) {
    console.log('')
    console.log(chalk.hex(colors.error)(`✗ 服务器 "${name}" 不存在`))
    console.log('')
    return
  }

  console.log('')
  console.log(chalk.gray(`正在从 ${name} 读取 shell 历史...`))

  try {
    const history = await fetchRemoteShellHistory(name)

    if (history.length === 0) {
      console.log('')
      console.log(chalk.gray(`  服务器 "${name}" 暂无 shell 历史`))
      console.log(chalk.gray('  请先安装远程 hook: pls remote hook install ' + name))
      console.log('')
      return
    }

    console.log('')
    console.log(chalk.bold(`终端历史 - ${name}（最近 ${history.length} 条）:`))
    console.log(chalk.gray('━'.repeat(50)))

    history.forEach((item, index) => {
      const num = index + 1
      const status = item.exit === 0 ? chalk.hex(colors.success)('✓') : chalk.hex(colors.error)(`✗ (${item.exit})`)
      console.log(`  ${chalk.hex(colors.primary)(num.toString().padStart(2, ' '))}. ${item.cmd} ${status}`)
    })

    console.log(chalk.gray('━'.repeat(50)))
    console.log(chalk.gray(`远程文件: ~/.please/shell_history.jsonl`))
    console.log('')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log('')
    console.log(chalk.hex(colors.error)(`✗ 无法读取远程 shell 历史: ${message}`))
    console.log('')
  }
}

/**
 * 清空远程 shell 历史
 */
export async function clearRemoteShellHistory(name: string): Promise<void> {
  const remote = getRemote(name)
  const colors = getColors()

  if (!remote) {
    console.log('')
    console.log(chalk.hex(colors.error)(`✗ 服务器 "${name}" 不存在`))
    console.log('')
    return
  }

  try {
    // 清空远程文件
    await sshExec(name, 'rm -f ~/.please/shell_history.jsonl', { timeout: 10000 })

    // 清空本地缓存
    const cachePath = getRemoteShellHistoryPath(name)
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath)
    }

    console.log('')
    console.log(chalk.hex(colors.success)(`✓ 服务器 "${name}" 的 shell 历史已清空`))
    console.log('')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log('')
    console.log(chalk.hex(colors.error)(`✗ 无法清空远程 shell 历史: ${message}`))
    console.log('')
  }
}
