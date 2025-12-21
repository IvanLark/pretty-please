import os from 'os'
import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import { detectProjectContext, formatProjectContext, type ProjectContext } from './project-context.js'
import { getConfig, CONFIG_DIR } from './config.js'
import { getCurrentTheme } from './ui/theme.js'
import {
  detectShell,
  getShellCapabilities,
  commandExists,
  batchCommandExists,
  isWindows,
} from './utils/platform.js'

/**
 * 要检测的命令列表（45 个）
 */
const COMMANDS_TO_CHECK = {
  // 现代 CLI 工具（ls/find/grep/cat 等的替代品）
  modern: [
    'eza', 'lsd', 'exa',           // ls 替代
    'fd', 'fdfind',                 // find 替代
    'rg', 'ag', 'ack',              // grep 替代
    'bat', 'batcat',                // cat 替代
    'fzf', 'skim',                  // 模糊搜索
    'jq', 'yq', 'fx',               // JSON/YAML 处理
    'delta', 'diff-so-fancy',       // diff 替代
    'zoxide', 'z', 'autojump',      // cd 替代
    'tldr', 'tealdeer',             // man 替代
    'dust', 'duf', 'ncdu',          // du 替代
    'procs', 'bottom', 'htop',      // ps/top 替代
    'sd',                           // sed 替代
    'hyperfine',                    // benchmark
  ],

  // 包管理器
  node: ['pnpm', 'yarn', 'bun', 'npm'],
  python: ['uv', 'rye', 'poetry', 'pipenv', 'pip'],
  rust: ['cargo'],
  go: ['go'],
  ruby: ['gem', 'bundle'],
  php: ['composer'],

  // 容器/云工具
  container: ['docker', 'podman', 'nerdctl'],
  k8s: ['kubectl', 'k9s', 'helm'],

  // 版本控制
  vcs: ['git', 'gh', 'glab', 'hg'],

  // 构建工具
  build: ['make', 'cmake', 'ninja', 'just', 'task'],

  // 其他常用工具
  misc: ['curl', 'wget', 'aria2c', 'rsync', 'ssh', 'tmux', 'screen'],
}

/**
 * 静态系统信息（缓存 7 天）
 */
export interface StaticSystemInfo {
  os: string
  arch: string
  shell: string
  user: string
  systemPackageManager: string
  availableCommands: string[]
}

/**
 * 动态系统信息（每次实时获取）
 */
export interface DynamicSystemInfo {
  cwd: string
  project: ProjectContext | null
}

/**
 * 完整系统信息
 */
export interface SystemInfo extends StaticSystemInfo, DynamicSystemInfo {}

/**
 * 缓存文件结构
 */
interface SystemCache {
  version: number
  cachedAt: string
  expiresInDays: number
  static: StaticSystemInfo
}

// 缓存文件路径
const CACHE_FILE = path.join(CONFIG_DIR, 'system_cache.json')

/**
 * 检测系统包管理器
 */
function detectPackageManager(): string {
  // Windows 包管理器
  if (isWindows()) {
    const windowsManagers = ['winget', 'scoop', 'choco']
    for (const mgr of windowsManagers) {
      if (commandExists(mgr)) {
        return mgr
      }
    }
    return 'unknown'
  }

  // Unix 包管理器
  const unixManagers = [
    { name: 'brew', command: 'brew' },
    { name: 'apt', command: 'apt-get' },
    { name: 'dnf', command: 'dnf' },
    { name: 'yum', command: 'yum' },
    { name: 'pacman', command: 'pacman' },
    { name: 'zypper', command: 'zypper' },
    { name: 'apk', command: 'apk' },
  ]

  for (const mgr of unixManagers) {
    if (commandExists(mgr.command)) {
      return mgr.name
    }
  }

  return 'unknown'
}

/**
 * 检测可用命令（跨平台版本）
 * 使用 platform 模块的 batchCommandExists 函数
 */
function detectAvailableCommands(): string[] {
  const allCommands = Object.values(COMMANDS_TO_CHECK).flat()
  return batchCommandExists(allCommands)
}

/**
 * 检测所有静态信息（纯同步，不需要 async）
 */
function detectStaticInfo(): StaticSystemInfo {
  // 使用 platform 模块检测 Shell
  const shell = detectShell()
  const capabilities = getShellCapabilities(shell)

  return {
    os: os.platform(),
    arch: os.arch(),
    shell: capabilities.displayName,
    user: os.userInfo().username,
    systemPackageManager: detectPackageManager(),
    availableCommands: detectAvailableCommands(),
  }
}

/**
 * 获取静态系统信息（带缓存）
 */
export function getStaticSystemInfo(): StaticSystemInfo {
  const config = getConfig()

  // 确保配置目录存在
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }

  if (fs.existsSync(CACHE_FILE)) {
    try {
      const cache: SystemCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))

      // 缓存未过期
      const expireDays = config.systemCacheExpireDays || 7
      const age = Date.now() - new Date(cache.cachedAt).getTime()
      if (age < expireDays * 24 * 60 * 60 * 1000) {
        return cache.static
      }
    } catch {
      // 缓存文件损坏，重新检测
    }
  }

  // 首次或过期，重新检测
  const info = detectStaticInfo()

  // 保存缓存
  const cache: SystemCache = {
    version: 1,
    cachedAt: new Date().toISOString(),
    expiresInDays: config.systemCacheExpireDays || 7,
    static: info,
  }
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2))

  return info
}

/**
 * 获取动态系统信息（每次实时）
 */
export async function getDynamicSystemInfo(): Promise<DynamicSystemInfo> {
  return {
    cwd: process.cwd(),
    project: await detectProjectContext(process.cwd()),
  }
}

/**
 * 获取完整系统信息（主接口）
 */
export async function getSystemInfo(): Promise<SystemInfo> {
  return {
    ...getStaticSystemInfo(),
    ...(await getDynamicSystemInfo()),
  }
}

/**
 * 辅助函数：分类命令
 */
function categorizeCommands(commands: string[]): {
  modern: string[]
  packageManagers: string[]
  containers: string[]
  others: string[]
} {
  const modern = ['eza', 'lsd', 'exa', 'fd', 'fdfind', 'rg', 'ag', 'ack', 'bat', 'batcat', 'fzf', 'jq', 'yq', 'delta']
  const packageManagers = ['pnpm', 'yarn', 'bun', 'npm', 'uv', 'poetry', 'cargo', 'go']
  const containers = ['docker', 'podman', 'kubectl', 'k9s', 'helm']

  return {
    modern: commands.filter(cmd => modern.includes(cmd)),
    packageManagers: commands.filter(cmd => packageManagers.includes(cmd)),
    containers: commands.filter(cmd => containers.includes(cmd)),
    others: commands.filter(cmd =>
      !modern.includes(cmd) &&
      !packageManagers.includes(cmd) &&
      !containers.includes(cmd)
    ),
  }
}

/**
 * 格式化系统信息为字符串（供 AI 使用）
 */
export function formatSystemInfo(info: SystemInfo): string {
  const parts: string[] = []

  // 基础信息
  parts.push(`OS: ${info.os}, Arch: ${info.arch}, Shell: ${info.shell}, User: ${info.user}`)
  parts.push(`Package Manager: ${info.systemPackageManager}, CWD: ${info.cwd}`)

  // 可用工具（分类展示）
  if (info.availableCommands.length > 0) {
    const categorized = categorizeCommands(info.availableCommands)
    const lines: string[] = []

    if (categorized.modern.length > 0) {
      lines.push(`现代工具: ${categorized.modern.join(', ')}`)
    }
    if (categorized.packageManagers.length > 0) {
      lines.push(`包管理器: ${categorized.packageManagers.join(', ')}`)
    }
    if (categorized.containers.length > 0) {
      lines.push(`容器工具: ${categorized.containers.join(', ')}`)
    }
    if (categorized.others.length > 0) {
      lines.push(`其他: ${categorized.others.join(', ')}`)
    }

    if (lines.length > 0) {
      parts.push(`【用户终端可用工具】（非完整列表）`)
      parts.push(...lines)
      //parts.push(`注: 为确保兼容性和输出捕获，建议优先使用标准命令（ls/find/grep/cat/ps）`)
    }
  }

  // 项目上下文
  if (info.project && info.project.types.length > 0) {
    parts.push(formatProjectContext(info.project))
  }

  return parts.join('\n')
}

/**
 * 显示系统信息（CLI 美化版）
 */
export function displaySystemInfo(info: SystemInfo): void {
  const theme = getCurrentTheme()

  console.log(chalk.bold('\n系统信息:'))
  console.log(chalk.hex(theme.text.muted)('━'.repeat(50)))

  // 基础信息
  console.log(`  ${chalk.hex(theme.primary)('操作系统')}:          ${info.os}`)
  console.log(`  ${chalk.hex(theme.primary)('架构')}:              ${info.arch}`)
  console.log(`  ${chalk.hex(theme.primary)('Shell')}:             ${info.shell}`)
  console.log(`  ${chalk.hex(theme.primary)('用户')}:              ${info.user}`)
  console.log(`  ${chalk.hex(theme.primary)('系统包管理器')}:      ${info.systemPackageManager}`)
  console.log(`  ${chalk.hex(theme.primary)('当前目录')}:          ${chalk.hex(theme.text.secondary)(info.cwd)}`)

  // 可用工具
  if (info.availableCommands.length > 0) {
    console.log(`  ${chalk.hex(theme.primary)('可用命令数')}:        ${chalk.hex(theme.success)(info.availableCommands.length)}`)

    const categorized = categorizeCommands(info.availableCommands)

    if (categorized.modern.length > 0) {
      console.log(`    ${chalk.hex(theme.text.secondary)('现代工具')}: ${categorized.modern.join(', ')}`)
    }
    if (categorized.packageManagers.length > 0) {
      console.log(`    ${chalk.hex(theme.text.secondary)('包管理器')}: ${categorized.packageManagers.join(', ')}`)
    }
    if (categorized.containers.length > 0) {
      console.log(`    ${chalk.hex(theme.text.secondary)('容器工具')}: ${categorized.containers.join(', ')}`)
    }
    if (categorized.others.length > 0) {
      console.log(`    ${chalk.hex(theme.text.secondary)('其他工具')}: ${categorized.others.join(', ')}`)
    }
  }

  // 项目信息
  if (info.project && info.project.types.length > 0) {
    console.log(chalk.hex(theme.text.muted)('  ──────────────────────────────────────────────────'))
    console.log(`  ${chalk.hex(theme.primary)('项目类型')}:          ${info.project.types.join(', ')}`)

    if (info.project.packageManager) {
      console.log(`  ${chalk.hex(theme.primary)('包管理器')}:          ${info.project.packageManager}`)
    }

    if (info.project.git) {
      const statusColor = info.project.git.status === 'clean' ? theme.success : theme.warning
      const statusText = info.project.git.status === 'clean' ? '干净' : info.project.git.status === 'dirty' ? '有改动' : '未知'
      console.log(`  ${chalk.hex(theme.primary)('Git 分支')}:          ${info.project.git.branch} (${chalk.hex(statusColor)(statusText)})`)
    }

    if (info.project.scripts && info.project.scripts.length > 0) {
      console.log(`  ${chalk.hex(theme.primary)('可用脚本')}:          ${info.project.scripts.join(', ')}`)
    }
  }

  console.log(chalk.hex(theme.text.muted)('━'.repeat(50)))
  console.log(chalk.hex(theme.text.muted)(`缓存文件: ${CACHE_FILE}\n`))
}

/**
 * 强制刷新缓存
 */
export function refreshSystemCache(): void {
  const config = getConfig()
  const info = detectStaticInfo()

  const cache: SystemCache = {
    version: 1,
    cachedAt: new Date().toISOString(),
    expiresInDays: config.systemCacheExpireDays || 7,
    static: info,
  }

  // 确保配置目录存在
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }

  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2))
  console.log('✓ 系统信息缓存已刷新')
}
