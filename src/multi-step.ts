import { z } from 'zod'
import { createShellAgent } from './mastra-agent.js'
import { SHELL_COMMAND_SYSTEM_PROMPT, buildUserContextPrompt } from './prompts.js'
import { formatSystemInfo } from './sysinfo.js'
import { formatHistoryForAI } from './history.js'
import { formatShellHistoryForAI, getShellHistory } from './shell-hook.js'
import { getConfig, type RemoteSysInfo } from './config.js'
import { formatRemoteHistoryForAI, formatRemoteShellHistoryForAI, type RemoteShellHistoryItem } from './remote-history.js'
import { formatRemoteSysInfoForAI } from './remote.js'

/**
 * 多步骤命令的 Zod Schema
 * 注意：optional 字段使用 .default() 是为了绕过 Mastra 0.24.8 对 optional 字段的验证 bug
 */
export const CommandStepSchema = z.object({
  command: z.string(),
  continue: z.boolean().optional().default(false),
  reasoning: z.string().optional().default(''),
  nextStepHint: z.string().optional().default(''),
})

export type CommandStep = z.infer<typeof CommandStepSchema>

/**
 * 执行步骤结果
 */
export interface ExecutedStep extends CommandStep {
  exitCode: number
  output: string
}

/**
 * 远程执行上下文
 */
export interface RemoteContext {
  name: string
  sysInfo: RemoteSysInfo
  shellHistory: RemoteShellHistoryItem[]
}

/**
 * 获取静态 System Prompt（供 Mastra 使用）
 */
export function getFullSystemPrompt() {
  return SHELL_COMMAND_SYSTEM_PROMPT
}

/**
 * 获取静态 System Prompt（远程执行也使用相同的 System Prompt）
 */
export function getRemoteFullSystemPrompt(remoteContext: RemoteContext) {
  return SHELL_COMMAND_SYSTEM_PROMPT
}

/**
 * 使用 Mastra 生成多步骤命令
 */
export async function generateMultiStepCommand(
  userPrompt: string,
  previousSteps: ExecutedStep[] = [],
  options: { debug?: boolean; remoteContext?: RemoteContext } = {}
): Promise<{ stepData: CommandStep; debugInfo?: any }> {
  const agent = createShellAgent()

  // 准备动态数据
  let sysinfoStr = ''
  let historyStr = ''

  if (options.remoteContext) {
    // 远程执行：格式化远程系统信息和历史
    sysinfoStr = formatRemoteSysInfoForAI(options.remoteContext.name, options.remoteContext.sysInfo)
    const plsHistory = formatRemoteHistoryForAI(options.remoteContext.name)
    const shellHistory = formatRemoteShellHistoryForAI(options.remoteContext.shellHistory)
    historyStr = options.remoteContext.shellHistory.length > 0 ? shellHistory : plsHistory
  } else {
    // 本地执行：格式化本地系统信息和历史
    sysinfoStr = formatSystemInfo()
    const config = getConfig()
    const plsHistory = formatHistoryForAI()
    const shellHistory = formatShellHistoryForAI()
    historyStr = (config.shellHook && getShellHistory().length > 0) ? shellHistory : plsHistory
  }

  // 构建包含所有动态数据的 User Prompt（XML 格式）
  const userContextPrompt = buildUserContextPrompt(
    userPrompt,
    sysinfoStr,
    historyStr,
    previousSteps
  )

  // 只发送一条 User Message
  const messages = [userContextPrompt]

  // 调用 Mastra Agent 生成结构化输出
  const response = await agent.generate(messages, {
    structuredOutput: {
      schema: CommandStepSchema,
      jsonPromptInjection: true, // 对于不支持 response_format 的模型使用提示词注入
    },
  })

  const stepData = response.object as CommandStep

  // 返回调试信息
  if (options.debug) {
    return {
      stepData,
      debugInfo: {
        systemPrompt: SHELL_COMMAND_SYSTEM_PROMPT,
        userPrompt: userContextPrompt,
        previousStepsCount: previousSteps.length,
        response: stepData,
        remoteContext: options.remoteContext
          ? {
              name: options.remoteContext.name,
              sysInfo: options.remoteContext.sysInfo,
            }
          : undefined,
      },
    }
  }

  return { stepData }
}
