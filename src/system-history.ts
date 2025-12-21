import fs from 'fs'
import path from 'path'
import os from 'os'
import { getConfig } from './config.js'
import type { ShellHistoryItem } from './shell-hook.js'
import { detectShell, getShellCapabilities } from './utils/platform.js'

/**
 * 直接读取系统 shell 历史文件（类似 thefuck）
 * 用于没有安装 shell hook 的情况
 *
 * 限制：系统历史文件不记录退出码，所以 exit 字段都是 0
 *
 * 支持的 Shell：
 * - Unix: zsh, bash, fish
 * - Windows: PowerShell 5.x, PowerShell 7+ (通过 PSReadLine)
 * - 不支持: CMD (无持久化历史)
 */
export function getSystemShellHistory(): ShellHistoryItem[] {
  const shell = detectShell()
  const capabilities = getShellCapabilities(shell)

  // 检查是否支持历史读取
  if (!capabilities.supportsHistory || !capabilities.historyPath) {
    return []
  }

  const historyFile = capabilities.historyPath
  let parser: (line: string) => ShellHistoryItem | null

  switch (shell) {
    case 'zsh':
      parser = parseZshHistoryLine
      break
    case 'bash':
      parser = parseBashHistoryLine
      break
    case 'fish':
      parser = parseFishHistoryLine
      break
    case 'powershell5':
    case 'powershell7':
      parser = parsePowerShellHistoryLine
      break
    default:
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
 * 解析 Fish 历史行
 * Fish 历史文件使用 YAML-like 格式:
 * - cmd: ls -la
 *   when: 1234567890
 */
function parseFishHistoryLine(line: string): ShellHistoryItem | null {
  // Fish 历史格式比较特殊，这里简化处理
  // 实际格式是多行的，这里只处理 cmd 行
  const cmdMatch = line.match(/^- cmd:\s*(.+)$/)
  if (cmdMatch) {
    return {
      cmd: cmdMatch[1].trim(),
      exit: 0,
      time: new Date().toISOString(),
    }
  }
  return null
}

/**
 * 解析 PowerShell 历史行
 * PSReadLine 历史文件格式: 每行一条命令，纯文本
 * 路径: %APPDATA%\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt
 */
function parsePowerShellHistoryLine(line: string): ShellHistoryItem | null {
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
