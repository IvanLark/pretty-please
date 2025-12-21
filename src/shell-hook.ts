import fs from 'fs'
import path from 'path'
import os from 'os'
import chalk from 'chalk'
import { CONFIG_DIR, getConfig, setConfigValue } from './config.js'
import { getHistory } from './history.js'
import { getCurrentTheme } from './ui/theme.js'
import {
  detectShell as platformDetectShell,
  type ShellType as PlatformShellType,
} from './utils/platform.js'

// 获取主题颜色
function getColors() {
  const theme = getCurrentTheme()
  return {
    primary: theme.primary,
    success: theme.success,
    error: theme.error,
    warning: theme.warning,
    secondary: theme.secondary,
  }
}

const SHELL_HISTORY_FILE = path.join(CONFIG_DIR, 'shell_history.jsonl')

// Hook 标记，用于识别我们添加的内容
const HOOK_START_MARKER = '# >>> pretty-please shell hook >>>'
const HOOK_END_MARKER = '# <<< pretty-please shell hook <<<'

// Shell 类型（保持向后兼容，但内部使用更细分的类型）
type ShellType = 'zsh' | 'bash' | 'powershell' | 'unknown'

/**
 * 将 platform 模块的 ShellType 转换为本地 ShellType
 */
function toLocalShellType(platformShell: PlatformShellType): ShellType {
  switch (platformShell) {
    case 'zsh':
      return 'zsh'
    case 'bash':
      return 'bash'
    case 'powershell5':
    case 'powershell7':
      return 'powershell'
    case 'cmd':
    case 'fish':
    case 'unknown':
    default:
      return 'unknown'
  }
}

/**
 * Shell 历史记录项
 */
export interface ShellHistoryItem {
  cmd: string
  exit: number
  time: string
}

/**
 * Hook 状态
 */
export interface HookStatus {
  enabled: boolean
  installed: boolean
  shellType: ShellType
  configPath: string | null
  historyFile: string
}

/**
 * 检测当前 shell 类型
 * 使用 platform 模块进行跨平台检测
 */
export function detectShell(): ShellType {
  const platformShell = platformDetectShell()

  // CMD 不支持 Hook，提示用户
  if (platformShell === 'cmd') {
    return 'unknown'
  }

  return toLocalShellType(platformShell)
}

/**
 * 获取 shell 配置文件路径
 */
export function getShellConfigPath(shellType: ShellType): string | null {
  const home = os.homedir()
  switch (shellType) {
    case 'zsh':
      return path.join(home, '.zshrc')
    case 'bash':
      // macOS 使用 .bash_profile，Linux 使用 .bashrc
      if (process.platform === 'darwin') {
        return path.join(home, '.bash_profile')
      }
      return path.join(home, '.bashrc')
    case 'powershell':
      // PowerShell profile 路径
      return path.join(home, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1')
    default:
      return null
  }
}

/**
 * 生成命令统计的公共 shell 函数
 * 用于 zsh 和 bash，避免代码重复
 */
function generateStatFunction(): string {
  return `
# 统计命令频率（公共函数）
__pls_record_stat() {
  local cmd_name="$1"
  local stats_file="${CONFIG_DIR}/command_stats.txt"

  # 确保文件存在
  touch "$stats_file"

  # 更新统计（纯 shell 实现，不依赖 jq）
  if grep -q "^$cmd_name=" "$stats_file" 2>/dev/null; then
    # 命令已存在，次数 +1
    local count=$(grep "^$cmd_name=" "$stats_file" | cut -d= -f2)
    count=$((count + 1))
    # macOS 和 Linux 的 sed -i 不同，使用临时文件
    sed "s/^$cmd_name=.*/$cmd_name=$count/" "$stats_file" > "$stats_file.tmp" 2>/dev/null
    mv "$stats_file.tmp" "$stats_file" 2>/dev/null
  else
    # 新命令，追加
    echo "$cmd_name=1" >> "$stats_file"
  fi
}
`
}

/**
 * 生成 zsh hook 脚本
 */
function generateZshHook(): string {
  const config = getConfig()
  const limit = config.shellHistoryLimit || 10  // 从配置读取

  return `
${HOOK_START_MARKER}
# 记录命令到 pretty-please 历史
${generateStatFunction()}
__pls_preexec() {
  __PLS_LAST_CMD="$1"
  __PLS_CMD_START=$(date +%s)
}

__pls_precmd() {
  local exit_code=$?
  if [[ -n "$__PLS_LAST_CMD" ]]; then
    local end_time=$(date +%s)
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    # 转义命令中的特殊字符
    local escaped_cmd=$(echo "$__PLS_LAST_CMD" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g')
    echo "{\\"cmd\\":\\"$escaped_cmd\\",\\"exit\\":$exit_code,\\"time\\":\\"$timestamp\\"}" >> "${CONFIG_DIR}/shell_history.jsonl"
    # 保持文件不超过 ${limit} 行（从配置读取）
    tail -n ${limit} "${CONFIG_DIR}/shell_history.jsonl" > "${CONFIG_DIR}/shell_history.jsonl.tmp" && mv "${CONFIG_DIR}/shell_history.jsonl.tmp" "${CONFIG_DIR}/shell_history.jsonl"

    # 统计命令频率
    local cmd_name=$(echo "$__PLS_LAST_CMD" | awk '{print $1}')
    __pls_record_stat "$cmd_name"

    unset __PLS_LAST_CMD
  fi
}

autoload -Uz add-zsh-hook
add-zsh-hook preexec __pls_preexec
add-zsh-hook precmd __pls_precmd
${HOOK_END_MARKER}
`
}

/**
 * 生成 bash hook 脚本
 */
function generateBashHook(): string {
  const config = getConfig()
  const limit = config.shellHistoryLimit || 10  // 从配置读取

  return `
${HOOK_START_MARKER}
# 记录命令到 pretty-please 历史
${generateStatFunction()}
__pls_prompt_command() {
  local exit_code=$?
  local last_cmd=$(history 1 | sed 's/^ *[0-9]* *//')
  if [[ -n "$last_cmd" && "$last_cmd" != "$__PLS_LAST_CMD" ]]; then
    __PLS_LAST_CMD="$last_cmd"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local escaped_cmd=$(echo "$last_cmd" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g')
    echo "{\\"cmd\\":\\"$escaped_cmd\\",\\"exit\\":$exit_code,\\"time\\":\\"$timestamp\\"}" >> "${CONFIG_DIR}/shell_history.jsonl"
    tail -n ${limit} "${CONFIG_DIR}/shell_history.jsonl" > "${CONFIG_DIR}/shell_history.jsonl.tmp" && mv "${CONFIG_DIR}/shell_history.jsonl.tmp" "${CONFIG_DIR}/shell_history.jsonl"

    # 统计命令频率
    local cmd_name=$(echo "$last_cmd" | awk '{print $1}')
    __pls_record_stat "$cmd_name"
  fi
}

if [[ ! "$PROMPT_COMMAND" =~ __pls_prompt_command ]]; then
  PROMPT_COMMAND="__pls_prompt_command;\${PROMPT_COMMAND}"
fi
${HOOK_END_MARKER}
`
}

/**
 * 生成 PowerShell hook 脚本
 * 使用 PowerShell 原生路径处理，避免跨平台路径问题
 */
function generatePowerShellHook(): string {
  const config = getConfig()
  const limit = config.shellHistoryLimit || 10  // 从配置读取

  // 使用 PowerShell 原生路径变量，而不是嵌入 Node.js 路径
  return `
${HOOK_START_MARKER}
# 记录命令到 pretty-please 历史
# 使用 PowerShell 原生路径
$Global:__PlsDir = Join-Path $env:USERPROFILE ".please"
$Global:__PlsHistoryFile = Join-Path $Global:__PlsDir "shell_history.jsonl"
$Global:__PlsStatsFile = Join-Path $Global:__PlsDir "command_stats.txt"
$Global:__PlsLastCmd = ""

# 确保目录存在
if (-not (Test-Path $Global:__PlsDir)) {
    New-Item -Path $Global:__PlsDir -ItemType Directory -Force | Out-Null
}

function __Pls_RecordCommand {
    $lastCmd = (Get-History -Count 1).CommandLine
    if ($lastCmd -and $lastCmd -ne $Global:__PlsLastCmd) {
        $Global:__PlsLastCmd = $lastCmd
        $exitCode = $LASTEXITCODE
        if ($null -eq $exitCode) { $exitCode = 0 }
        $timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        $escapedCmd = $lastCmd -replace '\\\\', '\\\\\\\\' -replace '"', '\\\\"'
        $json = "{\`"cmd\`":\`"$escapedCmd\`",\`"exit\`":$exitCode,\`"time\`":\`"$timestamp\`"}"
        Add-Content -Path $Global:__PlsHistoryFile -Value $json
        # 保持文件不超过 ${limit} 行（从配置读取）
        $content = Get-Content $Global:__PlsHistoryFile -Tail ${limit} -ErrorAction SilentlyContinue
        if ($content) {
            $content | Set-Content $Global:__PlsHistoryFile
        }

        # 统计命令频率
        $cmdName = $lastCmd -split ' ' | Select-Object -First 1

        # 确保统计文件存在
        if (-not (Test-Path $Global:__PlsStatsFile)) {
            New-Item -Path $Global:__PlsStatsFile -ItemType File -Force | Out-Null
        }

        # 更新统计
        $stats = Get-Content $Global:__PlsStatsFile -ErrorAction SilentlyContinue
        $found = $false
        $newStats = @()
        foreach ($line in $stats) {
            if ($line -match "^$cmdName=(\\d+)$") {
                $count = [int]$matches[1] + 1
                $newStats += "$cmdName=$count"
                $found = $true
            } else {
                $newStats += $line
            }
        }
        if (-not $found) {
            $newStats += "$cmdName=1"
        }
        $newStats | Set-Content $Global:__PlsStatsFile
    }
}

if (-not (Get-Variable -Name __PlsPromptBackup -ErrorAction SilentlyContinue)) {
    $Global:__PlsPromptBackup = $function:prompt
    function Global:prompt {
        __Pls_RecordCommand
        & $Global:__PlsPromptBackup
    }
}
${HOOK_END_MARKER}
`
}

/**
 * 生成 hook 脚本
 */
function generateHookScript(shellType: ShellType): string | null {
  switch (shellType) {
    case 'zsh':
      return generateZshHook()
    case 'bash':
      return generateBashHook()
    case 'powershell':
      return generatePowerShellHook()
    default:
      return null
  }
}

/**
 * 安装 shell hook
 */
export async function installShellHook(): Promise<boolean> {
  const shellType = detectShell()
  const configPath = getShellConfigPath(shellType)
  const colors = getColors()

  if (!configPath) {
    console.log(chalk.hex(colors.error)(`❌ 不支持的 shell 类型: ${shellType}`))

    // CMD 特殊提示
    if (shellType === 'unknown') {
      const platformShell = platformDetectShell()
      if (platformShell === 'cmd') {
        console.log('')
        console.log(chalk.hex(colors.warning)('⚠️  CMD 不支持 Shell Hook 功能'))
        console.log(chalk.hex(colors.secondary)('建议使用 PowerShell 获得完整体验：'))
        console.log(chalk.hex(colors.secondary)('  1. 按 Win 键搜索 "PowerShell"'))
        console.log(chalk.hex(colors.secondary)('  2. 在 PowerShell 中运行 pls hook install'))
        console.log('')
      }
    }

    return false
  }

  const hookScript = generateHookScript(shellType)
  if (!hookScript) {
    console.log(chalk.hex(colors.error)(`❌ 无法为 ${shellType} 生成 hook 脚本`))
    return false
  }

  // 检查是否已安装
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf-8')
    if (content.includes(HOOK_START_MARKER)) {
      console.log(chalk.hex(colors.warning)('⚠️  Shell hook 已安装，跳过'))
      setConfigValue('shellHook', true)
      return true
    }
  }

  // 确保配置目录存在
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }

  // 备份原配置文件
  if (fs.existsSync(configPath)) {
    const backupPath = configPath + '.pls-backup'
    fs.copyFileSync(configPath, backupPath)
    console.log(chalk.gray(`已备份原配置文件到: ${backupPath}`))
  }

  // 追加 hook 脚本
  fs.appendFileSync(configPath, hookScript)

  // 更新配置
  setConfigValue('shellHook', true)

  console.log(chalk.hex(colors.success)(`✅ Shell hook 已安装到: ${configPath}`))
  console.log(chalk.hex(colors.warning)('⚠️  请重启终端或执行以下命令使其生效:'))
  console.log(chalk.hex(colors.primary)(`   source ${configPath}`))

  return true
}

/**
 * 卸载 shell hook
 */
export function uninstallShellHook(): boolean {
  const shellType = detectShell()
  const configPath = getShellConfigPath(shellType)
  const colors = getColors()

  if (!configPath || !fs.existsSync(configPath)) {
    console.log(chalk.hex(colors.warning)('⚠️  未找到 shell 配置文件'))
    setConfigValue('shellHook', false)
    return true
  }

  let content = fs.readFileSync(configPath, 'utf-8')

  // 移除 hook 脚本
  const startIndex = content.indexOf(HOOK_START_MARKER)
  const endIndex = content.indexOf(HOOK_END_MARKER)

  if (startIndex === -1 || endIndex === -1) {
    console.log(chalk.hex(colors.warning)('⚠️  未找到已安装的 hook'))
    setConfigValue('shellHook', false)
    return true
  }

  // 移除从标记开始到结束的所有内容（包括换行符）
  const before = content.substring(0, startIndex)
  const after = content.substring(endIndex + HOOK_END_MARKER.length)
  content = before + after.replace(/^\n/, '')

  fs.writeFileSync(configPath, content)
  setConfigValue('shellHook', false)

  // 清空 shell 历史文件
  if (fs.existsSync(SHELL_HISTORY_FILE)) {
    fs.unlinkSync(SHELL_HISTORY_FILE)
  }

  console.log(chalk.hex(colors.success)('✅ Shell hook 已卸载'))
  console.log(chalk.hex(colors.warning)('⚠️  请重启终端使其生效'))

  return true
}

/**
 * 读取 shell 历史记录
 */
export function getShellHistory(): ShellHistoryItem[] {
  const config = getConfig()

  // 如果未启用 shell hook，返回空数组
  if (!config.shellHook) {
    return []
  }

  if (!fs.existsSync(SHELL_HISTORY_FILE)) {
    return []
  }

  try {
    const content = fs.readFileSync(SHELL_HISTORY_FILE, 'utf-8')
    const lines = content
      .trim()
      .split('\n')
      .filter((line) => line.trim())

    const allHistory = lines
      .map((line) => {
        try {
          return JSON.parse(line) as ShellHistoryItem
        } catch {
          return null
        }
      })
      .filter((item): item is ShellHistoryItem => item !== null)

    // 应用 shellHistoryLimit 限制：只返回最近的 N 条
    const limit = config.shellHistoryLimit || 15
    return allHistory.slice(-limit)
  } catch {
    return []
  }
}

/**
 * 从 pls history 中查找匹配的记录
 */
function findPlsHistoryMatch(prompt: string): ReturnType<typeof getHistory>[number] | null {
  const plsHistory = getHistory()

  // 尝试精确匹配 userPrompt
  for (const record of plsHistory) {
    if (record.userPrompt === prompt) {
      return record
    }
  }

  // 尝试模糊匹配（处理引号等情况）
  const normalizedPrompt = prompt.trim().replace(/^["']|["']$/g, '')
  for (const record of plsHistory) {
    if (record.userPrompt === normalizedPrompt) {
      return record
    }
  }

  return null
}

/**
 * 格式化 shell 历史供 AI 使用
 * 对于 pls 命令，会从 pls history 中查找对应的详细信息
 */
export function formatShellHistoryForAI(): string {
  const history = getShellHistory()

  if (history.length === 0) {
    return ''
  }

  // pls 的子命令列表（这些不是 AI prompt）
  const plsSubcommands = ['config', 'history', 'hook', 'help', '--help', '-h', '--version', '-v']

  const lines = history.map((item, index) => {
    const status = item.exit === 0 ? '✓' : `✗ 退出码:${item.exit}`

    // 检查是否是 pls 命令
    const plsMatch = item.cmd.match(/^(pls|please)\s+(.+)$/)
    if (plsMatch) {
      let args = plsMatch[2]

      // 去掉 --debug / -d 选项，获取真正的参数
      args = args.replace(/^(--debug|-d)\s+/, '')

      const firstArg = args.split(/\s+/)[0]

      // 如果是子命令，当作普通命令处理
      if (plsSubcommands.includes(firstArg)) {
        return `${index + 1}. ${item.cmd} ${status}`
      }

      // 是 AI prompt，尝试从 pls history 查找详细信息
      const prompt = args
      const plsRecord = findPlsHistoryMatch(prompt)

      if (plsRecord) {
        // 找到对应的 pls 记录，展示详细信息
        if (plsRecord.reason === 'builtin') {
          return `${index + 1}. [pls] "${prompt}" → 生成命令: ${plsRecord.command} (包含 builtin，未执行)`
        } else if (plsRecord.executed) {
          const execStatus = plsRecord.exitCode === 0 ? '✓' : `✗ 退出码:${plsRecord.exitCode}`

          // 检查用户是否修改了命令
          if (plsRecord.userModified && plsRecord.aiGeneratedCommand) {
            return `${index + 1}. [pls] "${prompt}" → AI 生成: ${plsRecord.aiGeneratedCommand} / 用户修改为: ${plsRecord.command} ${execStatus}`
          } else {
            return `${index + 1}. [pls] "${prompt}" → 实际执行: ${plsRecord.command} ${execStatus}`
          }
        } else {
          return `${index + 1}. [pls] "${prompt}" → 生成命令: ${plsRecord.command} (用户取消执行)`
        }
      }
      // 找不到记录，只显示原始命令
      return `${index + 1}. [pls] "${prompt}" ${status}`
    }

    // 普通命令
    return `${index + 1}. ${item.cmd} ${status}`
  })

  return `【用户终端最近执行的命令】\n${lines.join('\n')}`
}

/**
 * 获取 hook 状态
 */
export function getHookStatus(): HookStatus {
  const config = getConfig()
  const shellType = detectShell()
  const configPath = getShellConfigPath(shellType)

  let installed = false
  if (configPath && fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf-8')
    installed = content.includes(HOOK_START_MARKER)
  }

  return {
    enabled: config.shellHook,
    installed,
    shellType,
    configPath,
    historyFile: SHELL_HISTORY_FILE,
  }
}

/**
 * 显示 shell 历史
 */
export function displayShellHistory(): void {
  const config = getConfig()
  const history = getShellHistory()
  const colors = getColors()

  if (!config.shellHook) {
    console.log('')
    console.log(chalk.hex(colors.warning)('⚠️  Shell Hook 未启用'))
    console.log(chalk.gray('运行 ') + chalk.hex(colors.primary)('pls hook install') + chalk.gray(' 启用 Shell Hook'))
    console.log('')
    return
  }

  if (history.length === 0) {
    console.log('')
    console.log(chalk.gray('暂无 Shell 历史记录'))
    console.log('')
    return
  }

  console.log('')
  console.log(chalk.bold(`终端历史（最近 ${history.length} 条）:`))
  console.log(chalk.gray('━'.repeat(50)))

  history.forEach((item, index) => {
    const num = index + 1
    const status = item.exit === 0 ? chalk.hex(colors.success)('✓') : chalk.hex(colors.error)(`✗ (${item.exit})`)

    // 检查是否是 pls 命令
    const isPls = item.cmd.startsWith('pls ') || item.cmd.startsWith('please ')

    if (isPls) {
      // pls 命令：尝试从 history 查找详细信息
      const args = item.cmd.replace(/^(pls|please)\s+/, '')
      const plsRecord = findPlsHistoryMatch(args)

      if (plsRecord && plsRecord.executed) {
        // 检查用户是否修改了命令
        if (plsRecord.userModified && plsRecord.aiGeneratedCommand) {
          console.log(`  ${chalk.hex(colors.primary)(num.toString().padStart(2, ' '))}. ${chalk.hex(colors.secondary)('[pls]')} "${args}"`)
          console.log(`     ${chalk.dim('AI 生成:')} ${chalk.gray(plsRecord.aiGeneratedCommand)}`)
          console.log(
            `     ${chalk.dim('用户修改为:')} ${plsRecord.command} ${status} ${chalk.hex(colors.warning)('(已修改)')}`
          )
        } else {
          console.log(
            `  ${chalk.hex(colors.primary)(num.toString().padStart(2, ' '))}. ${chalk.hex(colors.secondary)('[pls]')} "${args}" → ${plsRecord.command} ${status}`
          )
        }
      } else {
        console.log(`  ${chalk.hex(colors.primary)(num.toString().padStart(2, ' '))}. ${chalk.hex(colors.secondary)('[pls]')} ${args} ${status}`)
      }
    } else {
      console.log(`  ${chalk.hex(colors.primary)(num.toString().padStart(2, ' '))}. ${item.cmd} ${status}`)
    }
  })

  console.log(chalk.gray('━'.repeat(50)))
  console.log(chalk.gray(`配置: 保留最近 ${config.shellHistoryLimit} 条`))
  console.log(chalk.gray(`文件: ${SHELL_HISTORY_FILE}`))
  console.log('')
}

/**
 * 重新安装 Shell Hook（通用函数）
 * 用于版本升级、配置变更等场景
 *
 * @param options.silent 是否静默模式（不输出日志）
 * @param options.reason 重装原因（用于日志显示）
 * @returns 是否成功重装
 */
export async function reinstallShellHook(options?: {
  silent?: boolean
  reason?: string
}): Promise<boolean> {
  const config = getConfig()

  // 只有在 hook 已启用时才重装
  if (!config.shellHook) {
    return false
  }

  const colors = getColors()
  const { silent = false, reason } = options || {}

  if (!silent) {
    console.log('')
    if (reason) {
      console.log(chalk.hex(colors.primary)(reason))
    }
    console.log(chalk.hex(colors.primary)('正在更新 Shell Hook...'))
  }

  // 卸载旧版本，安装新版本
  uninstallShellHook()
  await installShellHook()

  if (!silent) {
    console.log('')
    console.log(chalk.hex(colors.warning)('⚠️  请重启终端或运行以下命令使新配置生效:'))

    const shellType = detectShell()
    let configFile = '~/.zshrc'
    if (shellType === 'bash') {
      configFile = process.platform === 'darwin' ? '~/.bash_profile' : '~/.bashrc'
    } else if (shellType === 'powershell') {
      configFile = '~/Documents/PowerShell/Microsoft.PowerShell_profile.ps1'
    }

    console.log(chalk.gray(`  source ${configFile}`))
    console.log('')
  }

  return true
}

/**
 * 当 shellHistoryLimit 变化时，自动重装 Hook
 * 返回是否成功重装
 */
export async function reinstallHookForLimitChange(oldLimit: number, newLimit: number): Promise<boolean> {
  // 值没有变化，不需要重装
  if (oldLimit === newLimit) {
    return false
  }

  return reinstallShellHook({
    reason: `检测到 shellHistoryLimit 变化 (${oldLimit} → ${newLimit})`,
  })
}

/**
 * 清空 shell 历史
 */
export function clearShellHistory(): void {
  if (fs.existsSync(SHELL_HISTORY_FILE)) {
    fs.unlinkSync(SHELL_HISTORY_FILE)
  }
  const colors = getColors()
  console.log('')
  console.log(chalk.hex(colors.success)('✓ Shell 历史已清空'))
  console.log('')
}

// ================== 统一历史获取 ==================

/**
 * 获取 shell 历史（统一接口）
 * 优先使用 shell hook，降级到系统历史文件
 *
 * 这是推荐的历史获取方式，会自动选择最佳来源：
 * 1. 优先：shell hook（有退出码，最准确）
 * 2. 降级：系统历史文件（无退出码，兼容未安装 hook 的情况）
 */
export function getShellHistoryWithFallback(): ShellHistoryItem[] {
  const config = getConfig()

  // 优先使用 shell hook
  if (config.shellHook) {
    const history = getShellHistory()
    if (history.length > 0) {
      return history
    }
  }

  // 降级到系统历史文件
  const { getSystemShellHistory } = require('./system-history.js')
  return getSystemShellHistory()
}

/**
 * 获取最近一条非 pls 的命令（统一接口）
 * 自动选择最佳历史来源
 */
export function getLastNonPlsCommand(): ShellHistoryItem | null {
  const history = getShellHistoryWithFallback()

  // 从后往前找第一条非 pls 命令
  for (let i = history.length - 1; i >= 0; i--) {
    const item = history[i]
    if (!item.cmd.startsWith('pls') && !item.cmd.startsWith('please')) {
      return item
    }
  }

  return null
}

/**
 * 格式化 shell 历史供 AI 使用（统一接口）
 * 自动选择最佳历史来源
 */
export function formatShellHistoryForAIWithFallback(): string {
  const config = getConfig()

  // 如果启用了 shell hook 且有记录，使用 hook 历史（包含详细信息）
  if (config.shellHook) {
    const hookHistory = getShellHistory()
    if (hookHistory.length > 0) {
      return formatShellHistoryForAI()
    }
  }

  // 降级到系统历史
  const { getSystemShellHistory } = require('./system-history.js')
  const history = getSystemShellHistory()

  if (history.length === 0) {
    return ''
  }

  // 格式化系统历史（简单格式，无详细信息）
  const lines = history.map((item: ShellHistoryItem, index: number) => {
    const status = item.exit === 0 ? '✓' : `✗ 退出码:${item.exit}`
    return `${index + 1}. ${item.cmd} ${status}`
  })

  return `【用户终端最近执行的命令（来自系统历史）】\n${lines.join('\n')}`
}

// ================== 远程 Shell Hook ==================

/**
 * 生成远程 zsh hook 脚本
 */
function generateRemoteZshHook(): string {
  const config = getConfig()
  const limit = config.shellHistoryLimit || 10  // 从配置读取

  return `
${HOOK_START_MARKER}
# 记录命令到 pretty-please 历史
__pls_preexec() {
  __PLS_LAST_CMD="$1"
  __PLS_CMD_START=$(date +%s)
}

__pls_precmd() {
  local exit_code=$?
  if [[ -n "$__PLS_LAST_CMD" ]]; then
    local end_time=$(date +%s)
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    # 确保目录存在
    mkdir -p ~/.please
    # 转义命令中的特殊字符
    local escaped_cmd=$(echo "$__PLS_LAST_CMD" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g')
    echo "{\\"cmd\\":\\"$escaped_cmd\\",\\"exit\\":$exit_code,\\"time\\":\\"$timestamp\\"}" >> ~/.please/shell_history.jsonl
    # 保持文件不超过 ${limit} 行（从配置读取）
    tail -n ${limit} ~/.please/shell_history.jsonl > ~/.please/shell_history.jsonl.tmp && mv ~/.please/shell_history.jsonl.tmp ~/.please/shell_history.jsonl
    unset __PLS_LAST_CMD
  fi
}

autoload -Uz add-zsh-hook
add-zsh-hook preexec __pls_preexec
add-zsh-hook precmd __pls_precmd
${HOOK_END_MARKER}
`
}

/**
 * 生成远程 bash hook 脚本
 */
function generateRemoteBashHook(): string {
  const config = getConfig()
  const limit = config.shellHistoryLimit || 10  // 从配置读取

  return `
${HOOK_START_MARKER}
# 记录命令到 pretty-please 历史
__pls_prompt_command() {
  local exit_code=$?
  local last_cmd=$(history 1 | sed 's/^ *[0-9]* *//')
  if [[ -n "$last_cmd" && "$last_cmd" != "$__PLS_LAST_CMD" ]]; then
    __PLS_LAST_CMD="$last_cmd"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    # 确保目录存在
    mkdir -p ~/.please
    local escaped_cmd=$(echo "$last_cmd" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g')
    echo "{\\"cmd\\":\\"$escaped_cmd\\",\\"exit\\":$exit_code,\\"time\\":\\"$timestamp\\"}" >> ~/.please/shell_history.jsonl
    tail -n ${limit} ~/.please/shell_history.jsonl > ~/.please/shell_history.jsonl.tmp && mv ~/.please/shell_history.jsonl.tmp ~/.please/shell_history.jsonl
  fi
}

if [[ ! "$PROMPT_COMMAND" =~ __pls_prompt_command ]]; then
  PROMPT_COMMAND="__pls_prompt_command;\${PROMPT_COMMAND}"
fi
${HOOK_END_MARKER}
`
}

/**
 * 检测远程服务器的 shell 类型
 */
export async function detectRemoteShell(sshExecFn: (cmd: string) => Promise<{ stdout: string; exitCode: number }>): Promise<ShellType> {
  try {
    const result = await sshExecFn('basename "$SHELL"')
    if (result.exitCode === 0) {
      const shell = result.stdout.trim()
      if (shell === 'zsh') return 'zsh'
      if (shell === 'bash') return 'bash'
    }
  } catch {
    // 忽略错误
  }
  return 'bash' // 默认 bash
}

/**
 * 获取远程 shell 配置文件路径
 */
export function getRemoteShellConfigPath(shellType: ShellType): string {
  switch (shellType) {
    case 'zsh':
      return '~/.zshrc'
    case 'bash':
      return '~/.bashrc'
    default:
      return '~/.bashrc'
  }
}

/**
 * 生成远程 hook 脚本
 */
export function generateRemoteHookScript(shellType: ShellType): string | null {
  switch (shellType) {
    case 'zsh':
      return generateRemoteZshHook()
    case 'bash':
      return generateRemoteBashHook()
    default:
      return null
  }
}

/**
 * 检查远程 hook 是否已安装
 */
export async function checkRemoteHookInstalled(
  sshExecFn: (cmd: string) => Promise<{ stdout: string; exitCode: number }>,
  configPath: string
): Promise<boolean> {
  try {
    const result = await sshExecFn(`grep -q "${HOOK_START_MARKER}" ${configPath} 2>/dev/null && echo "installed" || echo "not_installed"`)
    return result.stdout.trim() === 'installed'
  } catch {
    return false
  }
}

/**
 * 在远程服务器安装 shell hook
 */
export async function installRemoteShellHook(
  sshExecFn: (cmd: string) => Promise<{ stdout: string; exitCode: number }>,
  shellType: ShellType
): Promise<{ success: boolean; message: string }> {
  const colors = getColors()
  const configPath = getRemoteShellConfigPath(shellType)
  const hookScript = generateRemoteHookScript(shellType)

  if (!hookScript) {
    return { success: false, message: chalk.hex(colors.error)(`不支持的 shell 类型: ${shellType}`) }
  }

  // 检查是否已安装
  const installed = await checkRemoteHookInstalled(sshExecFn, configPath)
  if (installed) {
    return { success: true, message: chalk.hex(colors.warning)('Shell hook 已安装，跳过') }
  }

  // 备份原配置文件
  try {
    await sshExecFn(`cp ${configPath} ${configPath}.pls-backup 2>/dev/null || true`)
  } catch {
    // 忽略备份错误
  }

  // 安装 hook
  // 使用 cat 和 heredoc 来追加内容
  const escapedScript = hookScript.replace(/'/g, "'\"'\"'")
  const installCmd = `echo '${escapedScript}' >> ${configPath}`

  try {
    const result = await sshExecFn(installCmd)
    if (result.exitCode !== 0) {
      return { success: false, message: chalk.hex(colors.error)(`安装失败: ${result.stdout}`) }
    }

    // 确保 ~/.please 目录存在
    await sshExecFn('mkdir -p ~/.please')

    return {
      success: true,
      message: chalk.hex(colors.success)(`Shell hook 已安装到 ${configPath}`),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, message: chalk.hex(colors.error)(`安装失败: ${message}`) }
  }
}

/**
 * 从远程服务器卸载 shell hook
 */
export async function uninstallRemoteShellHook(
  sshExecFn: (cmd: string) => Promise<{ stdout: string; exitCode: number }>,
  shellType: ShellType
): Promise<{ success: boolean; message: string }> {
  const colors = getColors()
  const configPath = getRemoteShellConfigPath(shellType)

  // 检查是否已安装
  const installed = await checkRemoteHookInstalled(sshExecFn, configPath)
  if (!installed) {
    return { success: true, message: chalk.hex(colors.warning)('Shell hook 未安装，跳过') }
  }

  // 使用 sed 删除 hook 代码块
  // 注意：需要处理特殊字符
  const startMarkerEscaped = HOOK_START_MARKER.replace(/[[\]]/g, '\\$&')
  const endMarkerEscaped = HOOK_END_MARKER.replace(/[[\]]/g, '\\$&')

  // 在 macOS 和 Linux 上 sed -i 行为不同，使用 sed + 临时文件
  const uninstallCmd = `
sed '/${startMarkerEscaped}/,/${endMarkerEscaped}/d' ${configPath} > ${configPath}.tmp && mv ${configPath}.tmp ${configPath}
`

  try {
    const result = await sshExecFn(uninstallCmd)
    if (result.exitCode !== 0) {
      return { success: false, message: chalk.hex(colors.error)(`卸载失败: ${result.stdout}`) }
    }

    return {
      success: true,
      message: chalk.hex(colors.success)('Shell hook 已卸载'),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, message: chalk.hex(colors.error)(`卸载失败: ${message}`) }
  }
}

/**
 * 获取远程 hook 状态
 */
export async function getRemoteHookStatus(
  sshExecFn: (cmd: string) => Promise<{ stdout: string; exitCode: number }>
): Promise<{ installed: boolean; shellType: ShellType; configPath: string }> {
  // 检测 shell 类型
  const shellType = await detectRemoteShell(sshExecFn)
  const configPath = getRemoteShellConfigPath(shellType)

  // 检查是否已安装
  const installed = await checkRemoteHookInstalled(sshExecFn, configPath)

  return { installed, shellType, configPath }
}
