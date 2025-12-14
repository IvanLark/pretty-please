import React from 'react'
import { Box, Text } from 'ink'
import stringWidth from 'string-width'
import { theme } from '../ui/theme.js'
import { RenderInline } from './InlineRenderer.js'

interface TableRendererProps {
  headers: string[]
  rows: string[][]
  terminalWidth: number
}

/**
 * 计算纯文本长度（去除 markdown 标记）
 */
function getPlainTextLength(text: string): number {
  const cleanText = text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/<u>(.*?)<\/u>/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
  return stringWidth(cleanText)
}

/**
 * 计算每列的最佳宽度
 */
function calculateColumnWidths(
  headers: string[],
  rows: string[][],
  terminalWidth: number
): number[] {
  const columnCount = headers.length
  const minWidths = headers.map((h, i) => {
    const headerWidth = getPlainTextLength(h)
    const maxRowWidth = Math.max(...rows.map(row => getPlainTextLength(row[i] || '')))
    return Math.max(headerWidth, maxRowWidth, 3) // 最小宽度 3
  })

  const totalMinWidth = minWidths.reduce((a, b) => a + b, 0) + (columnCount + 1) * 3 // 加边框和间距

  if (totalMinWidth <= terminalWidth) {
    return minWidths
  }

  // 如果超宽，平均分配
  const availableWidth = terminalWidth - (columnCount + 1) * 3
  const avgWidth = Math.floor(availableWidth / columnCount)
  return headers.map(() => Math.max(avgWidth, 5))
}

/**
 * 表格渲染组件
 */
function TableRendererInternal({ headers, rows, terminalWidth }: TableRendererProps) {
  const columnWidths = calculateColumnWidths(headers, rows, terminalWidth)
  const baseColor = theme.text.primary

  return (
    <Box flexDirection="column" marginY={1}>
      {/* 表头 */}
      <Box>
        <Text color={theme.border}>│ </Text>
        {headers.map((header, i) => (
          <React.Fragment key={i}>
            <Box width={columnWidths[i]}>
              <Text bold color={theme.primary}>
                <RenderInline text={header} defaultColor={theme.primary} />
              </Text>
            </Box>
            <Text color={theme.border}> │ </Text>
          </React.Fragment>
        ))}
      </Box>

      {/* 分隔线 */}
      <Box>
        <Text color={theme.border}>├─</Text>
        {columnWidths.map((width, i) => (
          <React.Fragment key={i}>
            <Text color={theme.border}>{'─'.repeat(width)}</Text>
            <Text color={theme.border}>─┼─</Text>
          </React.Fragment>
        ))}
      </Box>

      {/* 表格行 */}
      {rows.map((row, rowIndex) => (
        <Box key={rowIndex}>
          <Text color={theme.border}>│ </Text>
          {row.map((cell, cellIndex) => (
            <React.Fragment key={cellIndex}>
              <Box width={columnWidths[cellIndex]}>
                <Text color={baseColor}>
                  <RenderInline text={cell || ''} defaultColor={baseColor} />
                </Text>
              </Box>
              <Text color={theme.border}> │ </Text>
            </React.Fragment>
          ))}
        </Box>
      ))}
    </Box>
  )
}

export const TableRenderer = React.memo(TableRendererInternal)
