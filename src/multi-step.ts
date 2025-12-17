import { z } from 'zod'
import { createShellAgent } from './mastra-agent.js'
import { buildCommandSystemPrompt } from './prompts.js'
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
 * 生成系统上下文信息（供 Mastra 使用）
 */
export function getFullSystemPrompt() {
  const config = getConfig()
  const sysinfo = formatSystemInfo()
  const plsHistory = formatHistoryForAI()
  const shellHistory = formatShellHistoryForAI()
  const shellHookEnabled = config.shellHook && getShellHistory().length > 0

  return buildCommandSystemPrompt(sysinfo, plsHistory, shellHistory, shellHookEnabled)
}

/**
 * 生成远程系统上下文信息
 */
export function getRemoteFullSystemPrompt(remoteContext: RemoteContext) {
  // 格式化远程系统信息
  const sysinfo = formatRemoteSysInfoForAI(remoteContext.name, remoteContext.sysInfo)

  // 格式化远程 pls 命令历史
  const plsHistory = formatRemoteHistoryForAI(remoteContext.name)

  // 格式化远程 shell 历史
  const shellHistory = formatRemoteShellHistoryForAI(remoteContext.shellHistory)
  const shellHookEnabled = remoteContext.shellHistory.length > 0

  return buildCommandSystemPrompt(sysinfo, plsHistory, shellHistory, shellHookEnabled)
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

  // 根据是否有远程上下文选择不同的系统提示词
  const fullSystemPrompt = options.remoteContext
    ? getRemoteFullSystemPrompt(options.remoteContext)
    : getFullSystemPrompt()

  // 构建消息数组（string[] 格式）
  const messages: string[] = [userPrompt]

  // 添加之前步骤的执行结果
  previousSteps.forEach((step) => {
    messages.push(
      JSON.stringify({
        command: step.command,
        continue: step.continue,
        reasoning: step.reasoning,
        nextStepHint: step.nextStepHint,
      })
    )
    messages.push(`命令已执行\n退出码: ${step.exitCode}\n输出:\n${step.output.slice(0, 500)}`)
  })

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
        fullPrompt: fullSystemPrompt,
        userPrompt,
        previousStepsCount: previousSteps.length,
        response: stepData,
        remoteContext: options.remoteContext ? {
          name: options.remoteContext.name,
          sysInfo: options.remoteContext.sysInfo,
        } : undefined,
      },
    }
  }

  return { stepData }
}
