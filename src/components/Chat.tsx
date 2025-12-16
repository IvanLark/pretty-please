import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import { MarkdownDisplay } from './MarkdownDisplay.js'
import { chatWithMastra } from '../mastra-chat.js'
import { getChatRoundCount } from '../chat-history.js'
import { getCurrentTheme } from '../ui/theme.js'

interface ChatProps {
  prompt: string
  debug?: boolean
  showRoundCount?: boolean
  onComplete: () => void
}

type Status = 'thinking' | 'streaming' | 'done' | 'error'

interface DebugInfo {
  sysinfo: string
  model: string
  systemPrompt: string
  userPrompt: string
  chatHistory: any[]
}

/**
 * Chat 组件 - AI 对话模式
 * 使用正常渲染，完成后保持最后一帧在终端
 */
export function Chat({ prompt, debug, showRoundCount, onComplete }: ChatProps) {
  const theme = getCurrentTheme()
  const [status, setStatus] = useState<Status>('thinking')
  const [content, setContent] = useState('')
  const [duration, setDuration] = useState(0)
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null)
  const [roundCount] = useState(getChatRoundCount())

  useEffect(() => {
    const startTime = Date.now()

    // 流式输出回调
    const onChunk = (chunk: string) => {
      setStatus('streaming')
      setContent((prev) => prev + chunk)
    }

    // 调用 AI
    chatWithMastra(prompt, { debug: debug || false, onChunk })
      .then((result) => {
        const endTime = Date.now()
        setDuration(endTime - startTime)
        setStatus('done')

        if (debug && typeof result === 'object' && 'debug' in result && result.debug) {
          setDebugInfo(result.debug)
        }

        setTimeout(onComplete, 100)
      })
      .catch((error: any) => {
        setStatus('error')
        setContent(error.message)
        setTimeout(onComplete, 100)
      })
  }, [prompt, debug, onComplete])

  return (
    <Box flexDirection="column">
      {/* 显示对话轮数 */}
      {showRoundCount && roundCount > 0 && (
        <Box marginBottom={1}>
          <Text color={theme.text.secondary}>(对话轮数: {roundCount})</Text>
        </Box>
      )}

      {/* 动态区域：思考状态 */}
      {status === 'thinking' && (
        <Box>
          <Text color={theme.info}>
            <Spinner type="dots" /> 思考中...
          </Text>
        </Box>
      )}

      {/* 输出内容区域 */}
      {(status === 'streaming' || status === 'done') && content && (
        <Box marginLeft={2} marginRight={2}>
          <MarkdownDisplay text={content} terminalWidth={96} />
        </Box>
      )}

      {/* 错误状态 */}
      {status === 'error' && (
        <Box marginTop={1} marginLeft={2}>
          <Text color={theme.error}>❌ 错误: {content}</Text>
        </Box>
      )}

      {/* 完成后显示耗时 */}
      {status === 'done' && duration > 0 && (
        <Box marginTop={1}>
          <Text color={theme.text.secondary}>({(duration / 1000).toFixed(2)}s)</Text>
        </Box>
      )}

      {/* 调试信息 */}
      {debugInfo && (
        <Box flexDirection="column" marginY={1}>
          <Text color={theme.accent}>━━━ 调试信息 ━━━</Text>
          <Text color={theme.text.secondary}>系统信息: {debugInfo.sysinfo}</Text>
          <Text color={theme.text.secondary}>模型: {debugInfo.model}</Text>
          <Text color={theme.text.secondary}>
            对话历史轮数: {Math.floor(debugInfo.chatHistory.length / 2)}
          </Text>
          <Text color={theme.text.secondary}>System Prompt:</Text>
          <Text dimColor>{debugInfo.systemPrompt}</Text>
          <Text color={theme.text.secondary}>User Prompt: {debugInfo.userPrompt}</Text>
          <Text color={theme.accent}>━━━━━━━━━━━━━━━━</Text>
        </Box>
      )}
    </Box>
  )
}
