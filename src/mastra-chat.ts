import { Agent } from '@mastra/core'
import { getConfig } from './config.js'
import { buildChatSystemPrompt } from './prompts.js'
import { formatSystemInfo } from './sysinfo.js'
import { formatHistoryForAI } from './history.js'
import { formatShellHistoryForAI, getShellHistory } from './shell-hook.js'
import { getChatHistory, addChatMessage } from './chat-history.js'

/**
 * 创建 Mastra Chat Agent
 */
export function createChatAgent() {
  const config = getConfig()

  // 组合 provider/model 格式（Mastra 要求）
  const modelId = `${config.provider}/${config.model}` as `${string}/${string}`

  // 构建系统提示词
  const sysinfo = formatSystemInfo()
  const plsHistory = formatHistoryForAI()
  const shellHistory = formatShellHistoryForAI()
  const shellHookEnabled = config.shellHook && getShellHistory().length > 0
  const systemPrompt = buildChatSystemPrompt(sysinfo, plsHistory, shellHistory, shellHookEnabled)

  return new Agent({
    name: 'chat-assistant',
    instructions: systemPrompt,
    model: {
      url: config.baseUrl,
      id: modelId,
      apiKey: config.apiKey,
    },
  })
}

/**
 * 获取完整的系统提示词（用于调试）
 */
export function getChatSystemPrompt(): string {
  const config = getConfig()
  const sysinfo = formatSystemInfo()
  const plsHistory = formatHistoryForAI()
  const shellHistory = formatShellHistoryForAI()
  const shellHookEnabled = config.shellHook && getShellHistory().length > 0
  return buildChatSystemPrompt(sysinfo, plsHistory, shellHistory, shellHookEnabled)
}

/**
 * 使用 Mastra 进行 AI 对话（支持流式输出）
 */
export async function chatWithMastra(
  prompt: string,
  options: {
    debug?: boolean
    onChunk?: (chunk: string) => void
  } = {}
): Promise<{
  reply: string
  debug?: {
    sysinfo: string
    model: string
    systemPrompt: string
    chatHistory: Array<{ role: string; content: string }>
    userPrompt: string
  }
}> {
  const config = getConfig()
  const agent = createChatAgent()

  // 获取对话历史
  const chatHistory = getChatHistory()

  // 构建消息数组（将历史和新消息合并）
  const messages: string[] = []

  // 添加历史对话
  for (const msg of chatHistory) {
    messages.push(msg.content)
  }

  // 添加当前用户消息
  messages.push(prompt)

  let fullContent = ''

  // 流式输出模式
  if (options.onChunk) {
    const stream = await agent.stream(messages)

    for await (const chunk of stream.textStream) {
      if (chunk) {
        fullContent += chunk
        options.onChunk(chunk)
      }
    }
  } else {
    // 非流式模式
    const response = await agent.generate(messages)
    fullContent = response.text || ''
  }

  if (!fullContent) {
    throw new Error('AI 返回了空的响应')
  }

  // 保存对话历史
  addChatMessage(prompt, fullContent)

  // 返回结果
  if (options.debug) {
    return {
      reply: fullContent,
      debug: {
        sysinfo: formatSystemInfo(),
        model: config.model,
        systemPrompt: getChatSystemPrompt(),
        chatHistory,
        userPrompt: prompt,
      },
    }
  }

  return { reply: fullContent }
}
