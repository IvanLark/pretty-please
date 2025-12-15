import { Agent } from '@mastra/core'
import { getConfig } from './config.js'
import { buildCommandSystemPrompt } from './prompts.js'
import { formatSystemInfo } from './sysinfo.js'
import { formatHistoryForAI } from './history.js'
import { formatShellHistoryForAI, getShellHistory } from './shell-hook.js'

/**
 * 创建 Mastra Shell Agent
 * 根据用户配置的 API Key、Base URL、Provider 和 Model
 */
export function createShellAgent() {
  const config = getConfig()

  // 组合 provider/model 格式（Mastra 要求）
  const modelId = `${config.provider}/${config.model}` as `${string}/${string}`

  // 构建系统提示词
  const sysinfo = formatSystemInfo()
  const plsHistory = formatHistoryForAI()
  const shellHistory = formatShellHistoryForAI()
  const shellHookEnabled = config.shellHook && getShellHistory().length > 0
  const systemPrompt = buildCommandSystemPrompt(sysinfo, plsHistory, shellHistory, shellHookEnabled)

  return new Agent({
    name: 'shell-commander',
    instructions: systemPrompt,
    model: {
      url: config.baseUrl,
      id: modelId,
      apiKey: config.apiKey,
    },
  })
}
