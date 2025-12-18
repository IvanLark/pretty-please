import { Agent } from '@mastra/core'
import { getConfig } from './config.js'
import { SHELL_COMMAND_SYSTEM_PROMPT } from './prompts.js'

/**
 * 创建 Mastra Shell Agent
 * 根据用户配置的 API Key、Base URL、Provider 和 Model
 * 使用静态的 System Prompt（不包含动态数据）
 */
export function createShellAgent() {
  const config = getConfig()

  // 组合 provider/model 格式（Mastra 要求）
  const modelId = `${config.provider}/${config.model}` as `${string}/${string}`

  return new Agent({
    name: 'shell-commander',
    instructions: SHELL_COMMAND_SYSTEM_PROMPT,
    model: {
      url: config.baseUrl,
      id: modelId,
      apiKey: config.apiKey,
    },
  })
}
