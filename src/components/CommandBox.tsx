import React from 'react'
import { Box, Text } from 'ink'
import { getCurrentTheme } from '../ui/theme.js'
import { getDisplayWidth, wrapText, MIN_COMMAND_BOX_WIDTH } from '../utils/console.js'

interface CommandBoxProps {
  command: string
  title?: string
}

/**
 * CommandBox 组件 - 显示带边框和标题的命令框
 */
export const CommandBox: React.FC<CommandBoxProps> = ({ command, title = '生成命令' }) => {
  const theme = getCurrentTheme()

  // 获取终端宽度，限制最大宽度
  const termWidth = process.stdout.columns || 80
  const titleWidth = getDisplayWidth(title)

  // 计算最大内容宽度（终端宽度 - 边框和内边距）
  const maxContentWidth = termWidth - 6 // 减去 '│ ' 和 ' │' 以及一些余量

  // 处理命令换行
  const originalLines = command.split('\n')
  const wrappedLines: string[] = []
  for (const line of originalLines) {
    wrappedLines.push(...wrapText(line, maxContentWidth))
  }

  // 计算实际使用的宽度
  const actualMaxWidth = Math.max(
    ...wrappedLines.map((l) => getDisplayWidth(l)),
    titleWidth
  )
  const boxWidth = Math.max(MIN_COMMAND_BOX_WIDTH, Math.min(actualMaxWidth + 4, termWidth - 2))

  // 顶部边框：┌─ 生成命令 ─────┐
  const topPadding = boxWidth - titleWidth - 5
  const topBorder = '┌─ ' + title + ' ' + '─'.repeat(Math.max(0, topPadding)) + '┐'

  // 底部边框
  const bottomBorder = '└' + '─'.repeat(boxWidth - 2) + '┘'

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color={theme.warning}>{topBorder}</Text>
      {wrappedLines.map((line, index) => {
        const lineWidth = getDisplayWidth(line)
        const padding = ' '.repeat(Math.max(0, boxWidth - lineWidth - 4))
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
