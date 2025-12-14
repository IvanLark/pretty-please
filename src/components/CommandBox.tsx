import React from 'react'
import { Box, Text } from 'ink'
import { theme } from '../ui/theme.js'

interface CommandBoxProps {
  command: string
  title?: string
}

/**
 * 计算字符串的显示宽度（中文占2个宽度）
 */
function getDisplayWidth(str: string): number {
  let width = 0
  for (const char of str) {
    // 中文、日文、韩文等宽字符占 2 个宽度
    if (char.match(/[\u4e00-\u9fff\u3400-\u4dbf\uff00-\uffef\u3000-\u303f]/)) {
      width += 2
    } else {
      width += 1
    }
  }
  return width
}

/**
 * CommandBox 组件 - 显示带边框和标题的命令框
 */
export const CommandBox: React.FC<CommandBoxProps> = ({ command, title = '生成命令' }) => {
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
