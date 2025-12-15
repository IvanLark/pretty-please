import fs from 'fs'
import path from 'path'
import os from 'os'
import readline from 'readline'
import chalk from 'chalk'

// 配置文件路径
export const CONFIG_DIR = path.join(os.homedir(), '.please')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

// 支持的 Provider 列表
const VALID_PROVIDERS = [
  'openai',
  'anthropic',
  'deepseek',
  'google',
  'groq',
  'mistral',
  'cohere',
  'fireworks',
  'together',
] as const

type Provider = (typeof VALID_PROVIDERS)[number]

// 编辑模式
const VALID_EDIT_MODES = ['manual', 'auto'] as const
type EditMode = (typeof VALID_EDIT_MODES)[number]

/**
 * 配置接口
 */
export interface Config {
  apiKey: string
  baseUrl: string
  model: string
  provider: Provider
  shellHook: boolean
  chatHistoryLimit: number
  commandHistoryLimit: number
  shellHistoryLimit: number
  editMode: EditMode
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Config = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4-turbo',
  provider: 'openai',
  shellHook: false,
  chatHistoryLimit: 10,
  commandHistoryLimit: 10,
  shellHistoryLimit: 15,
  editMode: 'manual',
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
 * 读取配置
 */
export function getConfig(): Config {
  ensureConfigDir()

  if (!fs.existsSync(CONFIG_FILE)) {
    return { ...DEFAULT_CONFIG }
  }

  try {
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8')
    return { ...DEFAULT_CONFIG, ...JSON.parse(content) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

/**
 * 保存配置
 */
export function saveConfig(config: Config): void {
  ensureConfigDir()
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
}

/**
 * 设置单个配置项
 */
export function setConfigValue(key: string, value: string | boolean | number): Config {
  const config = getConfig()

  if (!(key in DEFAULT_CONFIG)) {
    throw new Error(`未知的配置项: ${key}`)
  }

  // 处理特殊类型
  if (key === 'shellHook') {
    config.shellHook = value === 'true' || value === true
  } else if (key === 'chatHistoryLimit' || key === 'commandHistoryLimit' || key === 'shellHistoryLimit') {
    const num = typeof value === 'number' ? value : parseInt(String(value), 10)
    if (isNaN(num) || num < 1) {
      throw new Error(`${key} 必须是大于 0 的整数`)
    }
    config[key] = num
  } else if (key === 'provider') {
    const strValue = String(value)
    if (!VALID_PROVIDERS.includes(strValue as Provider)) {
      throw new Error(`provider 必须是以下之一: ${VALID_PROVIDERS.join(', ')}`)
    }
    config.provider = strValue as Provider
  } else if (key === 'editMode') {
    const strValue = String(value)
    if (!VALID_EDIT_MODES.includes(strValue as EditMode)) {
      throw new Error(`editMode 必须是以下之一: ${VALID_EDIT_MODES.join(', ')}`)
    }
    config.editMode = strValue as EditMode
  } else if (key === 'apiKey' || key === 'baseUrl' || key === 'model') {
    config[key] = String(value)
  }

  saveConfig(config)
  return config
}

/**
 * 检查配置是否有效
 */
export function isConfigValid(): boolean {
  const config = getConfig()
  return config.apiKey.length > 0
}

/**
 * 隐藏 API Key 中间部分
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 10) return apiKey || '(未设置)'
  return apiKey.slice(0, 6) + '****' + apiKey.slice(-4)
}

/**
 * 显示当前配置
 */
export function displayConfig(): void {
  const config = getConfig()
  console.log(chalk.bold('\n当前配置:'))
  console.log(chalk.gray('━'.repeat(50)))
  console.log(`  ${chalk.cyan('apiKey')}:              ${maskApiKey(config.apiKey)}`)
  console.log(`  ${chalk.cyan('baseUrl')}:             ${config.baseUrl}`)
  console.log(`  ${chalk.cyan('provider')}:            ${config.provider}`)
  console.log(`  ${chalk.cyan('model')}:               ${config.model}`)
  console.log(
    `  ${chalk.cyan('shellHook')}:           ${config.shellHook ? chalk.green('已启用') : chalk.gray('未启用')}`
  )
  console.log(
    `  ${chalk.cyan('editMode')}:            ${
      config.editMode === 'auto' ? chalk.hex('#00D9FF')('auto (自动编辑)') : chalk.gray('manual (按E编辑)')
    }`
  )
  console.log(`  ${chalk.cyan('chatHistoryLimit')}:    ${config.chatHistoryLimit} 轮`)
  console.log(`  ${chalk.cyan('commandHistoryLimit')}: ${config.commandHistoryLimit} 条`)
  console.log(`  ${chalk.cyan('shellHistoryLimit')}:   ${config.shellHistoryLimit} 条`)
  console.log(chalk.gray('━'.repeat(50)))
  console.log(chalk.gray(`配置文件: ${CONFIG_FILE}\n`))
}

/**
 * 创建 readline 接口
 */
function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
}

/**
 * 异步提问
 */
function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer)
    })
  })
}

/**
 * 交互式配置向导
 */
export async function runConfigWizard(): Promise<void> {
  const rl = createReadlineInterface()
  const config = getConfig()

  console.log(chalk.bold.hex('#00D9FF')('\n🔧 Pretty Please 配置向导'))
  console.log(chalk.gray('━'.repeat(50)))
  console.log(chalk.gray('直接回车使用默认值，输入值后回车确认\n'))

  try {
    // 1. Provider
    const providerHint = chalk.gray(`(可选: ${VALID_PROVIDERS.join(', ')})`)
    const providerPrompt = `${chalk.cyan('Provider')} ${providerHint}\n${chalk.gray('默认:')} ${chalk.yellow(config.provider)} ${chalk.gray('→')} `
    const provider = await question(rl, providerPrompt)
    if (provider.trim()) {
      if (!VALID_PROVIDERS.includes(provider.trim() as Provider)) {
        console.log(chalk.hex('#EF4444')(`\n✗ 无效的 provider，必须是以下之一: ${VALID_PROVIDERS.join(', ')}`))
        console.log()
        rl.close()
        return
      }
      config.provider = provider.trim() as Provider
    }

    // 2. Base URL
    const baseUrlPrompt = `${chalk.cyan('API Base URL')}\n${chalk.gray('默认:')} ${chalk.yellow(config.baseUrl)} ${chalk.gray('→')} `
    const baseUrl = await question(rl, baseUrlPrompt)
    if (baseUrl.trim()) {
      config.baseUrl = baseUrl.trim()
    }

    // 3. API Key
    const currentKeyDisplay = config.apiKey ? maskApiKey(config.apiKey) : '(未设置)'
    const apiKeyPrompt = `${chalk.cyan('API Key')} ${chalk.gray(`(当前: ${currentKeyDisplay})`)}\n${chalk.gray('→')} `
    const apiKey = await question(rl, apiKeyPrompt)
    if (apiKey.trim()) {
      config.apiKey = apiKey.trim()
    }

    // 4. Model
    const modelPrompt = `${chalk.cyan('Model')}\n${chalk.gray('默认:')} ${chalk.yellow(config.model)} ${chalk.gray('→')} `
    const model = await question(rl, modelPrompt)
    if (model.trim()) {
      config.model = model.trim()
    }

    // 5. Shell Hook
    const shellHookPrompt = `${chalk.cyan('启用 Shell Hook')} ${chalk.gray('(记录终端命令历史)')}\n${chalk.gray('默认:')} ${chalk.yellow(config.shellHook ? 'true' : 'false')} ${chalk.gray('→')} `
    const shellHook = await question(rl, shellHookPrompt)
    if (shellHook.trim()) {
      config.shellHook = shellHook.trim() === 'true'
    }

    // 6. Edit Mode
    const editModeHint = chalk.gray('(manual=按E编辑, auto=自动编辑)')
    const editModePrompt = `${chalk.cyan('编辑模式')} ${editModeHint}\n${chalk.gray('默认:')} ${chalk.yellow(config.editMode)} ${chalk.gray('→')} `
    const editMode = await question(rl, editModePrompt)
    if (editMode.trim()) {
      if (!VALID_EDIT_MODES.includes(editMode.trim() as EditMode)) {
        console.log(chalk.hex('#EF4444')(`\n✗ 无效的 editMode，必须是: manual 或 auto`))
        console.log()
        rl.close()
        return
      }
      config.editMode = editMode.trim() as EditMode
    }

    // 7. Chat History Limit
    const chatHistoryPrompt = `${chalk.cyan('Chat 历史保留轮数')}\n${chalk.gray('默认:')} ${chalk.yellow(config.chatHistoryLimit)} ${chalk.gray('→')} `
    const chatHistoryLimit = await question(rl, chatHistoryPrompt)
    if (chatHistoryLimit.trim()) {
      const num = parseInt(chatHistoryLimit.trim(), 10)
      if (!isNaN(num) && num > 0) {
        config.chatHistoryLimit = num
      }
    }

    // 8. Command History Limit
    const commandHistoryPrompt = `${chalk.cyan('命令历史保留条数')}\n${chalk.gray('默认:')} ${chalk.yellow(config.commandHistoryLimit)} ${chalk.gray('→')} `
    const commandHistoryLimit = await question(rl, commandHistoryPrompt)
    if (commandHistoryLimit.trim()) {
      const num = parseInt(commandHistoryLimit.trim(), 10)
      if (!isNaN(num) && num > 0) {
        config.commandHistoryLimit = num
      }
    }

    // 9. Shell History Limit
    const shellHistoryPrompt = `${chalk.cyan('Shell 历史保留条数')}\n${chalk.gray('默认:')} ${chalk.yellow(config.shellHistoryLimit)} ${chalk.gray('→')} `
    const shellHistoryLimit = await question(rl, shellHistoryPrompt)
    if (shellHistoryLimit.trim()) {
      const num = parseInt(shellHistoryLimit.trim(), 10)
      if (!isNaN(num) && num > 0) {
        config.shellHistoryLimit = num
      }
    }

    saveConfig(config)

    console.log('\n' + chalk.gray('━'.repeat(50)))
    console.log(chalk.hex('#10B981')('✅ 配置已保存'))
    console.log(chalk.gray(`   ${CONFIG_FILE}`))
    console.log()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(chalk.hex('#EF4444')(`\n✗ 配置失败: ${message}`))
    console.log()
  } finally {
    rl.close()
  }
}
