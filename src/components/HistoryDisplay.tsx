import React from 'react'
import { Box, Text } from 'ink'
import { getHistory, getHistoryFilePath } from '../history.js'
import { theme } from '../ui/theme.js'

interface HistoryDisplayProps {
  onComplete?: () => void
}

/**
 * HistoryDisplay 组件 - 显示历史记录
 */
export const HistoryDisplay: React.FC<HistoryDisplayProps> = ({ onComplete }) => {
  const history = getHistory()

  React.useEffect(() => {
    if (onComplete) {
      setTimeout(onComplete, 100)
    }
  }, [onComplete])

  if (history.length === 0) {
    return (
      <Box marginY={1}>
        <Text color={theme.text.secondary}>暂无历史记录</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold>📜 命令历史:</Text>
      <Text color={theme.text.secondary}>{'━'.repeat(50)}</Text>

      {history.map((item, index) => {
        const status = item.executed
          ? item.exitCode === 0
            ? '✓'
            : `✗ 退出码:${item.exitCode}`
          : '(未执行)'

        const statusColor = item.executed
          ? item.exitCode === 0
            ? theme.success
            : theme.error
          : theme.text.secondary

        return (
          <Box key={index} flexDirection="column" marginY={1}>
            <Box>
              <Text color={theme.text.secondary}>{index + 1}. </Text>
              <Text color={theme.primary}>{item.userPrompt}</Text>
            </Box>
            <Box marginLeft={3}>
              <Text dimColor>→ </Text>
              <Text>{item.command} </Text>
              <Text color={statusColor}>{status}</Text>
            </Box>
            <Box marginLeft={3}>
              <Text color={theme.text.secondary}>{item.timestamp}</Text>
            </Box>
          </Box>
        )
      })}

      <Text color={theme.text.secondary}>历史文件: {getHistoryFilePath()}</Text>
    </Box>
  )
}
