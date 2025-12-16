import chalk from 'chalk'
import { getConfig, saveConfig, type AliasConfig } from './config.js'
import { getCurrentTheme } from './ui/theme.js'

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

/**
 * 别名解析结果
 */
export interface AliasResolveResult {
  resolved: boolean
  prompt: string
  aliasName?: string
  originalInput?: string
}

/**
 * 获取所有别名
 */
export function getAliases(): Record<string, AliasConfig> {
  const config = getConfig()
  return config.aliases || {}
}

/**
 * 添加别名
 * @param name 别名名称
 * @param prompt 对应的 prompt
 * @param description 可选描述
 * @param reservedCommands 保留的子命令列表（动态传入）
 */
export function addAlias(
  name: string,
  prompt: string,
  description?: string,
  reservedCommands: string[] = []
): void {
  // 验证别名名称
  if (!name || !name.trim()) {
    throw new Error('别名名称不能为空')
  }

  // 移除可能的 @ 前缀
  const aliasName = name.startsWith('@') ? name.slice(1) : name

  // 验证别名名称格式（只允许字母、数字、下划线、连字符）
  if (!/^[a-zA-Z0-9_-]+$/.test(aliasName)) {
    throw new Error('别名名称只能包含字母、数字、下划线和连字符')
  }

  // 检查是否与保留命令冲突
  if (reservedCommands.includes(aliasName)) {
    throw new Error(`"${aliasName}" 是保留的子命令，不能用作别名`)
  }

  // 验证 prompt
  if (!prompt || !prompt.trim()) {
    throw new Error('prompt 不能为空')
  }

  const config = getConfig()
  if (!config.aliases) {
    config.aliases = {}
  }

  config.aliases[aliasName] = {
    prompt: prompt.trim(),
    description: description?.trim(),
  }

  saveConfig(config)
}

/**
 * 删除别名
 */
export function removeAlias(name: string): boolean {
  // 移除可能的 @ 前缀
  const aliasName = name.startsWith('@') ? name.slice(1) : name

  const config = getConfig()
  if (!config.aliases || !config.aliases[aliasName]) {
    return false
  }

  delete config.aliases[aliasName]
  saveConfig(config)
  return true
}

/**
 * 解析参数模板
 * 支持格式：{{param}} 或 {{param:default}}
 */
function parseTemplateParams(prompt: string): string[] {
  const regex = /\{\{([^}:]+)(?::[^}]*)?\}\}/g
  const params: string[] = []
  let match

  while ((match = regex.exec(prompt)) !== null) {
    if (!params.includes(match[1])) {
      params.push(match[1])
    }
  }

  return params
}

/**
 * 替换模板参数
 * @param prompt 原始 prompt（可能包含模板参数）
 * @param args 用户提供的参数（key=value 或 --key=value 格式）
 */
function replaceTemplateParams(prompt: string, args: string[]): string {
  // 解析用户参数
  const userParams: Record<string, string> = {}

  for (const arg of args) {
    // 支持 --key=value 或 key=value 格式
    const cleanArg = arg.startsWith('--') ? arg.slice(2) : arg
    const eqIndex = cleanArg.indexOf('=')
    if (eqIndex > 0) {
      const key = cleanArg.slice(0, eqIndex)
      const value = cleanArg.slice(eqIndex + 1)
      userParams[key] = value
    }
  }

  // 替换模板参数
  let result = prompt

  // 匹配 {{param}} 或 {{param:default}}
  result = result.replace(/\{\{([^}:]+)(?::([^}]*))?\}\}/g, (match, param, defaultValue) => {
    if (userParams[param] !== undefined) {
      return userParams[param]
    }
    if (defaultValue !== undefined) {
      return defaultValue
    }
    // 没有提供值也没有默认值，保留原样（后面会报错或让用户补充）
    return match
  })

  return result
}

/**
 * 检查是否还有未替换的模板参数
 */
function hasUnresolvedParams(prompt: string): string[] {
  const regex = /\{\{([^}:]+)\}\}/g
  const unresolved: string[] = []
  let match

  while ((match = regex.exec(prompt)) !== null) {
    unresolved.push(match[1])
  }

  return unresolved
}

/**
 * 解析别名
 * 支持 `pls disk` 和 `pls @disk` 两种格式
 * @param input 用户输入（可能是别名或普通 prompt）
 * @returns 解析结果
 */
export function resolveAlias(input: string): AliasResolveResult {
  const parts = input.trim().split(/\s+/)
  if (parts.length === 0) {
    return { resolved: false, prompt: input }
  }

  let aliasName = parts[0]
  const restArgs = parts.slice(1)

  // 支持 @ 前缀
  if (aliasName.startsWith('@')) {
    aliasName = aliasName.slice(1)
  }

  const aliases = getAliases()
  const aliasConfig = aliases[aliasName]

  if (!aliasConfig) {
    return { resolved: false, prompt: input }
  }

  // 检查是否有模板参数
  const templateParams = parseTemplateParams(aliasConfig.prompt)

  let resolvedPrompt: string

  if (templateParams.length > 0) {
    // 有模板参数，进行替换
    resolvedPrompt = replaceTemplateParams(aliasConfig.prompt, restArgs)

    // 检查是否还有未替换的必填参数
    const unresolved = hasUnresolvedParams(resolvedPrompt)
    if (unresolved.length > 0) {
      throw new Error(`别名 "${aliasName}" 缺少必填参数: ${unresolved.join(', ')}`)
    }

    // 过滤掉已用于参数替换的 args，剩余的追加到 prompt
    const usedArgs = restArgs.filter((arg) => {
      const cleanArg = arg.startsWith('--') ? arg.slice(2) : arg
      return cleanArg.includes('=')
    })
    const extraArgs = restArgs.filter((arg) => !usedArgs.includes(arg))

    if (extraArgs.length > 0) {
      resolvedPrompt = `${resolvedPrompt} ${extraArgs.join(' ')}`
    }
  } else {
    // 没有模板参数，直接追加额外内容
    if (restArgs.length > 0) {
      resolvedPrompt = `${aliasConfig.prompt} ${restArgs.join(' ')}`
    } else {
      resolvedPrompt = aliasConfig.prompt
    }
  }

  return {
    resolved: true,
    prompt: resolvedPrompt,
    aliasName,
    originalInput: input,
  }
}

/**
 * 显示所有别名
 */
export function displayAliases(): void {
  const aliases = getAliases()
  const colors = getColors()
  const aliasNames = Object.keys(aliases)

  console.log('')

  if (aliasNames.length === 0) {
    console.log(chalk.gray('  暂无别名'))
    console.log('')
    console.log(chalk.gray('  使用 pls alias add <name> "<prompt>" 添加别名'))
    console.log('')
    return
  }

  console.log(chalk.bold('命令别名:'))
  console.log(chalk.gray('━'.repeat(50)))

  for (const name of aliasNames) {
    const alias = aliases[name]
    const params = parseTemplateParams(alias.prompt)

    // 别名名称
    let line = `  ${chalk.hex(colors.primary)(name)}`

    // 如果有参数，显示参数
    if (params.length > 0) {
      line += chalk.gray(` <${params.join('> <')}>`)
    }

    console.log(line)

    // prompt 内容
    console.log(`    ${chalk.gray('→')} ${alias.prompt}`)

    // 描述
    if (alias.description) {
      console.log(`    ${chalk.gray(alias.description)}`)
    }

    console.log('')
  }

  console.log(chalk.gray('━'.repeat(50)))
  console.log(chalk.gray('使用: pls <alias> 或 pls @<alias>'))
  console.log('')
}

/**
 * 获取别名的参数信息（用于帮助显示）
 */
export function getAliasParams(aliasName: string): string[] {
  const aliases = getAliases()
  const alias = aliases[aliasName]
  if (!alias) return []
  return parseTemplateParams(alias.prompt)
}
