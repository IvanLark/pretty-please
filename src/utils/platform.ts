import { execSync } from 'child_process'
import path from 'path'
import os from 'os'

/**
 * 跨平台工具函数
 * 封装所有平台相关的逻辑，优先支持 macOS/Linux，兼容 Windows
 */

// ================== 类型定义 ==================

/**
 * Shell 类型
 */
export type ShellType =
  | 'zsh'
  | 'bash'
  | 'fish'
  | 'cmd'           // Windows CMD
  | 'powershell5'   // Windows PowerShell 5.x
  | 'powershell7'   // PowerShell Core 7+ (pwsh)
  | 'unknown'

/**
 * Shell 能力
 */
export interface ShellCapabilities {
  /** 是否支持 Hook（修改配置文件） */
  supportsHook: boolean
  /** 是否支持历史读取 */
  supportsHistory: boolean
  /** 配置文件路径 */
  configPath: string | null
  /** 历史文件路径 */
  historyPath: string | null
  /** 用于执行命令的 Shell 可执行文件 */
  executable: string
  /** Shell 名称（用于显示） */
  displayName: string
}

// ================== 平台检测 ==================

/**
 * 是否为 Windows 平台
 */
export function isWindows(): boolean {
  return process.platform === 'win32'
}

/**
 * 是否为 macOS 平台
 */
export function isMacOS(): boolean {
  return process.platform === 'darwin'
}

/**
 * 是否为 Linux 平台
 */
export function isLinux(): boolean {
  return process.platform === 'linux'
}

// ================== Shell 检测 ==================

/**
 * 检测 Windows Shell 类型
 */
function detectWindowsShell(): ShellType {
  // 1. 检查 PSModulePath 判断 PowerShell 版本
  const psModulePath = process.env.PSModulePath || ''

  if (psModulePath) {
    // PowerShell 7+ 的 PSModulePath 包含 "PowerShell\7" 或 "PowerShell/7"
    if (/PowerShell[\/\\]7/i.test(psModulePath)) {
      return 'powershell7'
    }
    // Windows PowerShell 5.x 的 PSModulePath 包含 "WindowsPowerShell"
    if (/WindowsPowerShell/i.test(psModulePath)) {
      return 'powershell5'
    }
  }

  // 2. 检查 PROMPT 环境变量（CMD 特有）
  // 注意：在 PowerShell 中运行 CMD 时也可能有 PROMPT
  if (process.env.PROMPT && !psModulePath) {
    return 'cmd'
  }

  // 3. 尝试检测 pwsh 是否可用
  if (commandExists('pwsh')) {
    return 'powershell7'
  }

  // 4. 默认 PowerShell 5（Windows 内置）
  return 'powershell5'
}

/**
 * 检测 Unix Shell 类型
 */
function detectUnixShell(): ShellType {
  const shell = process.env.SHELL || ''

  if (shell.includes('zsh')) return 'zsh'
  if (shell.includes('bash')) return 'bash'
  if (shell.includes('fish')) return 'fish'

  return 'unknown'
}

/**
 * 检测当前 Shell 类型
 */
export function detectShell(): ShellType {
  if (isWindows()) {
    return detectWindowsShell()
  }
  return detectUnixShell()
}

// ================== Shell 能力 ==================

/**
 * 获取 Shell 配置文件路径
 */
function getShellConfigPath(shell: ShellType): string | null {
  const home = os.homedir()

  switch (shell) {
    case 'zsh':
      return path.join(home, '.zshrc')

    case 'bash':
      // macOS 使用 .bash_profile，Linux 使用 .bashrc
      return isMacOS()
        ? path.join(home, '.bash_profile')
        : path.join(home, '.bashrc')

    case 'fish':
      return path.join(home, '.config', 'fish', 'config.fish')

    case 'powershell5':
      return path.join(home, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1')

    case 'powershell7':
      return path.join(home, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1')

    case 'cmd':
      return null  // CMD 不支持配置文件

    default:
      return null
  }
}

/**
 * 获取 Shell 历史文件路径
 */
function getShellHistoryPath(shell: ShellType): string | null {
  const home = os.homedir()

  switch (shell) {
    case 'zsh':
      return process.env.HISTFILE || path.join(home, '.zsh_history')

    case 'bash':
      return process.env.HISTFILE || path.join(home, '.bash_history')

    case 'fish':
      return path.join(home, '.local', 'share', 'fish', 'fish_history')

    case 'powershell5':
    case 'powershell7':
      // PowerShell 历史文件位置（PSReadLine）
      const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
      return path.join(appData, 'Microsoft', 'Windows', 'PowerShell', 'PSReadLine', 'ConsoleHost_history.txt')

    case 'cmd':
      return null  // CMD 不持久化历史

    default:
      return null
  }
}

/**
 * 获取 Shell 可执行文件
 */
function getShellExecutable(shell: ShellType): string {
  switch (shell) {
    case 'zsh':
      return process.env.SHELL || '/bin/zsh'

    case 'bash':
      return process.env.SHELL || '/bin/bash'

    case 'fish':
      return process.env.SHELL || '/usr/bin/fish'

    case 'powershell5':
      return 'powershell.exe'

    case 'powershell7':
      return 'pwsh.exe'

    case 'cmd':
      return process.env.COMSPEC || 'cmd.exe'

    default:
      return isWindows() ? 'powershell.exe' : '/bin/sh'
  }
}

/**
 * 获取 Shell 显示名称
 */
function getShellDisplayName(shell: ShellType): string {
  switch (shell) {
    case 'zsh': return 'Zsh'
    case 'bash': return 'Bash'
    case 'fish': return 'Fish'
    case 'cmd': return 'CMD'
    case 'powershell5': return 'PowerShell 5.x'
    case 'powershell7': return 'PowerShell 7+'
    default: return 'Unknown'
  }
}

/**
 * 获取 Shell 能力信息
 */
export function getShellCapabilities(shell: ShellType): ShellCapabilities {
  return {
    supportsHook: shell !== 'cmd' && shell !== 'unknown',
    supportsHistory: shell !== 'cmd' && shell !== 'unknown',
    configPath: getShellConfigPath(shell),
    historyPath: getShellHistoryPath(shell),
    executable: getShellExecutable(shell),
    displayName: getShellDisplayName(shell),
  }
}

// ================== 命令检测 ==================

/**
 * 检测命令是否存在（跨平台）
 */
export function commandExists(command: string): boolean {
  try {
    if (isWindows()) {
      // Windows: 使用 where 命令
      execSync(`where ${command}`, { stdio: 'ignore' })
    } else {
      // Unix: 使用 command -v（比 which 更可靠）
      execSync(`command -v ${command}`, { stdio: 'ignore', shell: '/bin/sh' })
    }
    return true
  } catch {
    return false
  }
}

/**
 * 批量检测命令是否存在（优化性能）
 * @returns 返回存在的命令列表
 */
export function batchCommandExists(commands: string[]): string[] {
  if (commands.length === 0) return []

  const available: string[] = []

  if (isWindows()) {
    // Windows: 使用 PowerShell 批量检测
    const batchSize = 20
    for (let i = 0; i < commands.length; i += batchSize) {
      const batch = commands.slice(i, i + batchSize)
      try {
        // 使用 Get-Command 批量检测
        const script = batch
          .map(cmd => `if(Get-Command ${cmd} -ErrorAction SilentlyContinue){Write-Output ${cmd}}`)
          .join(';')
        const result = execSync(`powershell -NoProfile -Command "${script}"`, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'ignore'],
          timeout: 5000,
        })
        available.push(...result.trim().split(/\r?\n/).filter(Boolean))
      } catch {
        // 这批失败，逐个检测
        for (const cmd of batch) {
          if (commandExists(cmd)) {
            available.push(cmd)
          }
        }
      }
    }
  } else {
    // Unix: 使用 shell 批量检测
    const batchSize = 20
    for (let i = 0; i < commands.length; i += batchSize) {
      const batch = commands.slice(i, i + batchSize)
      const script = `(${batch
        .map(cmd => `command -v ${cmd} >/dev/null 2>&1 && echo ${cmd}`)
        .join('; ')}) 2>/dev/null || true`

      try {
        const result = execSync(script, {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'ignore'],
          timeout: 500,
        })
        available.push(...result.trim().split('\n').filter(Boolean))
      } catch {
        // 这批失败，跳过
      }
    }
  }

  return available
}

// ================== 命令执行 ==================

/**
 * 命令执行配置
 */
export interface ShellExecConfig {
  /** Shell 可执行文件 */
  shell: string
  /** Shell 参数 */
  args: string[]
  /** 完整的命令字符串（已包含错误处理） */
  command: string
}

/**
 * 构建命令执行配置
 * 处理不同 Shell 的语法差异
 */
export function buildShellExecConfig(command: string, shell?: ShellType): ShellExecConfig {
  const currentShell = shell || detectShell()
  const executable = getShellExecutable(currentShell)

  switch (currentShell) {
    case 'bash':
      return {
        shell: executable,
        args: ['-c', `set -o pipefail; ${command}`],
        command: `set -o pipefail; ${command}`,
      }

    case 'zsh':
      return {
        shell: executable,
        args: ['-c', `setopt pipefail; ${command}`],
        command: `setopt pipefail; ${command}`,
      }

    case 'fish':
      // Fish 不需要特殊处理 pipefail
      return {
        shell: executable,
        args: ['-c', command],
        command,
      }

    case 'powershell5':
    case 'powershell7':
      // PowerShell: 使用 $ErrorActionPreference 处理错误
      // -NoProfile 加快启动速度
      // -Command 执行命令
      return {
        shell: executable,
        args: ['-NoProfile', '-Command', command],
        command,
      }

    case 'cmd':
      return {
        shell: executable,
        args: ['/c', command],
        command,
      }

    default:
      // 默认使用 sh
      return {
        shell: isWindows() ? 'powershell.exe' : '/bin/sh',
        args: [isWindows() ? '-Command' : '-c', command],
        command,
      }
  }
}

/**
 * 获取默认 Shell（用于交互式执行）
 */
export function getDefaultShell(): string {
  if (isWindows()) {
    const shell = detectWindowsShell()
    return getShellExecutable(shell)
  }
  return process.env.SHELL || '/bin/bash'
}

// ================== 路径处理 ==================

/**
 * 获取 pls 配置目录
 * 统一使用 ~/.please
 */
export function getConfigDir(): string {
  return path.join(os.homedir(), '.please')
}

/**
 * 将路径转换为当前平台格式
 */
export function normalizePath(p: string): string {
  return path.normalize(p)
}

/**
 * 获取用于 PowerShell 脚本中的路径
 * 使用 $env:USERPROFILE 而不是硬编码路径
 */
export function getPowerShellConfigDir(): string {
  return '$env:USERPROFILE\\.please'
}
