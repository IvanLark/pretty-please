import React from 'react'
import { Box, Text } from 'ink'
import { getChatRoundCount, getChatHistoryFilePath } from '../chat-history.js'
import { theme } from '../ui/theme.js'

interface ChatStatusProps {
  onComplete?: () => void
}

/**
 * ChatStatus 组件 - 显示对话状态信息
 */
export const ChatStatus: React.FC<ChatStatusProps> = ({ onComplete }) => {
  const roundCount = getChatRoundCount()
  const historyFile = getChatHistoryFilePath()

  React.useEffect(() => {
    if (onComplete) {
      setTimeout(onComplete, 100)
    }
  }, [onComplete])

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold>💬 AI 对话模式</Text>
      <Text color={theme.text.secondary}>{'━'.repeat(40)}</Text>

      <Box marginTop={1}>
        <Text color={theme.primary}>  当前对话轮数: </Text>
        <Text>{roundCount}</Text>
      </Box>

      <Box>
        <Text color={theme.primary}>  历史文件:     </Text>
        <Text>{historyFile}</Text>
      </Box>

      <Text color={theme.text.secondary}>{'━'.repeat(40)}</Text>

      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.text.secondary}>用法:</Text>
        <Box>
          <Text color={theme.primary}>  pls chat &lt;问题&gt;</Text>
          <Text color={theme.text.secondary}>    与 AI 对话</Text>
        </Box>
        <Box>
          <Text color={theme.primary}>  pls chat clear</Text>
          <Text color={theme.text.secondary}>     清空对话历史</Text>
        </Box>
      </Box>
    </Box>
  )
}
