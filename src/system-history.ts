import fs from 'fs'
import path from 'path'
import os from 'os'
import { getConfig } from './config.js'
import type { ShellHistoryItem } from './shell-hook.js'

/**
 * 直接读取系统 shell 历史文件（类似 thefuck）
 * 用于没有安装 shell hook 的情况
 *
 * 限制：系统历史文件不记录退出码，所以 exit 字段都是 0
 */
export function getSystemShellHistory(): ShellHistoryItem[] {
  const shell = process.env.SHELL || ''
  const home = os.homedir()

  let historyFile: string
  let parser: (line: string) => ShellHistoryItem | null

  if (shell.includes('zsh')) {
    // zsh 历史文件
    historyFile = process.env.HISTFILE || path.join(home, '.zsh_history')
    parser = parseZshHistoryLine
  } else if (shell.includes('bash')) {
    // bash 历史文件
    historyFile = process.env.HISTFILE || path.join(home, '.bash_history')
    parser = parseBashHistoryLine
  } else {
    // 不支持的 shell
    return []
  }

  if (!fs.existsSync(historyFile)) {
    return []
  }

  try {
    const content = fs.readFileSync(historyFile, 'utf-8')
    const lines = content.trim().split('\n')
    const limit = getConfig().shellHistoryLimit || 10

    // 只取最后 N 条
    const recentLines = lines.slice(-limit)

    return recentLines
      .map(line => parser(line))
      .filter((item): item is ShellHistoryItem => item !== null)
  } catch {
    return []
  }
}

/**
 * 解析 zsh 历史行
 * 格式: ": 1234567890:0;ls -la"
 * 或者: "ls -la" (简单格式)
 */
function parseZshHistoryLine(line: string): ShellHistoryItem | null {
  // 扩展格式: ": timestamp:duration;command"
  const extendedMatch = line.match(/^:\s*(\d+):\d+;(.+)$/)
  if (extendedMatch) {
    const timestamp = parseInt(extendedMatch[1])
    const cmd = extendedMatch[2].trim()
    return {
      cmd,
      exit: 0,  // 系统历史文件不记录退出码
      time: new Date(timestamp * 1000).toISOString(),
    }
  }

  // 简单格式
  const cmd = line.trim()
  if (cmd) {
    return {
      cmd,
      exit: 0,
      time: new Date().toISOString(),
    }
  }

  return null
}

/**
 * 解析 bash 历史行
 * 格式: "ls -la"
 * bash 历史文件默认不记录时间戳
 */
function parseBashHistoryLine(line: string): ShellHistoryItem | null {
  const cmd = line.trim()
  if (cmd) {
    return {
      cmd,
      exit: 0,  // 系统历史文件不记录退出码
      time: new Date().toISOString(),
    }
  }
  return null
}

/**
 * 从系统历史中获取最近一条命令
 * 排除 pls 命令本身
 */
export function getLastCommandFromSystem(): ShellHistoryItem | null {
  const history = getSystemShellHistory()

  // 从后往前找第一条非 pls 命令
  for (let i = history.length - 1; i >= 0; i--) {
    const item = history[i]
    if (!item.cmd.startsWith('pls') && !item.cmd.startsWith('please')) {
      return item
    }
  }

  return null
}
