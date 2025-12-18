import { Agent } from '@mastra/core'
import { getConfig } from './config.js'
import { CHAT_SYSTEM_PROMPT, buildChatUserContext } from './prompts.js'
import { formatSystemInfo } from './sysinfo.js'
import { formatHistoryForAI } from './history.js'
import { formatShellHistoryForAI, getShellHistory } from './shell-hook.js'
import { getChatHistory, addChatMessage } from './chat-history.js'

/**
 * 创建 Mastra Chat Agent（使用静态系统提示词）
 */
export function createChatAgent() {
  const config = getConfig()

  // 组合 provider/model 格式（Mastra 要求）
  const modelId = `${config.provider}/${config.model}` as `${string}/${string}`

  return new Agent({
    name: 'chat-assistant',
    instructions: CHAT_SYSTEM_PROMPT,  // 只包含静态规则
    model: {
      url: config.baseUrl,
      id: modelId,
      apiKey: config.apiKey,
    },
  })
}

/**
 * 使用 Mastra 进行 AI 对话（支持流式输出）
 *
 * 消息结构：
 * [
 *   "历史问题1",                          // user (纯粹的问题)
 *   "历史回答1",                          // assistant
 *   "历史问题2",                          // user
 *   "历史回答2",                          // assistant
 *   "<system_info>...\n                  // user (最新消息，包含完整上下文)
 *    <command_history>...\n
 *    <user_question>最新问题</user_question>"
 * ]
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
    userContext: string
  }
}> {
  const config = getConfig()
  const agent = createChatAgent()

  // 1. 获取历史对话（纯粹的问答）
  const chatHistory = getChatHistory()

  // 2. 构建消息数组
  const messages: string[] = []

  // 加载历史对话
  for (const msg of chatHistory) {
    messages.push(msg.content)
  }

  // 3. 构建最新消息（动态上下文 + 用户问题）
  const sysinfo = formatSystemInfo()
  const plsHistory = formatHistoryForAI()
  // 使用统一的历史获取接口（自动降级到系统历史）
  const { formatShellHistoryForAIWithFallback } = await import('./shell-hook.js')
  const shellHistory = formatShellHistoryForAIWithFallback()
  const shellHookEnabled = !!shellHistory  // 如果有 shell 历史就视为启用

  const latestUserContext = buildChatUserContext(
    prompt,
    sysinfo,
    plsHistory,
    shellHistory,
    shellHookEnabled
  )

  messages.push(latestUserContext)

  // 4. 发送给 AI（流式或非流式）
  let fullContent = ''

  if (options.onChunk) {
    // 流式输出模式
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

  // 5. 保存对话历史（只保存纯粹的问题和回答，不保存 XML）
  addChatMessage(prompt, fullContent)

  // 6. 返回结果
  if (options.debug) {
    return {
      reply: fullContent,
      debug: {
        sysinfo,
        model: config.model,
        systemPrompt: CHAT_SYSTEM_PROMPT,
        chatHistory,
        userContext: latestUserContext,
      },
    }
  }

  return { reply: fullContent }
}
