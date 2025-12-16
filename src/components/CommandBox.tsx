import React from 'react'
import { Box, Text } from 'ink'
import { getCurrentTheme } from '../ui/theme.js'
import { getDisplayWidth } from '../utils/console.js'

interface CommandBoxProps {
  command: string
  title?: string
}

/**
 * CommandBox 组件 - 显示带边框和标题的命令框
 */
export const CommandBox: React.FC<CommandBoxProps> = ({ command, title = '生成命令' }) => {
  const theme = getCurrentTheme()
  const lines = command.split('\n')
  const titleWidth = getDisplayWidth(title)
  const maxContentWidth = Math.max(...lines.map(l => getDisplayWidth(l)))
  const boxWidth = Math.max(maxContentWidth + 4, titleWidth + 6, 20)

  // 顶部边框：┌─ 生成命令 ─────┐
  const topPadding = boxWidth - titleWidth - 5
  const topBorder = '┌─ ' + title + ' ' + '─'.repeat(topPadding) + '┐'

  // 底部边框
  const bottomBorder = '└' + '─'.repeat(boxWidth - 2) + '┘'

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color={theme.warning}>{topBorder}</Text>
      {lines.map((line, index) => {
        const lineWidth = getDisplayWidth(line)
        const padding = ' '.repeat(boxWidth - lineWidth - 4)
        return (
          <Text key={index}>
            <Text color={theme.warning}>│ </Text>
            <Text color={theme.primary}>{line}</Text>
            <Text>{padding}</Text>
            <Text color={theme.warning}> │</Text>
          </Text>
        )
      })}
      <Text color={theme.warning}>{bottomBorder}</Text>
    </Box>
  )
}
