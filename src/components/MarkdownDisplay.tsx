import React from 'react'
import { Text, Box } from 'ink'
import { theme } from '../ui/theme.js'
import { ColorizeCode } from './CodeColorizer.js'
import { TableRenderer } from './TableRenderer.js'
import { RenderInline } from './InlineRenderer.js'

interface MarkdownDisplayProps {
  text: string
  terminalWidth?: number
}

/**
 * Markdown 主渲染组件
 * 参考 gemini-cli 的实现
 * 支持：标题、列表、代码块、表格、粗体、斜体、链接
 */
function MarkdownDisplayInternal({ text, terminalWidth = 80 }: MarkdownDisplayProps) {
  if (!text) return <></>

  const lines = text.split(/\r?\n/)

  // 正则表达式
  const headerRegex = /^ *(#{1,4}) +(.*)/
  const codeFenceRegex = /^ *(`{3,}|~{3,}) *(\w*?) *$/
  const ulItemRegex = /^([ \t]*)([-*+]) +(.*)/
  const olItemRegex = /^([ \t]*)(\d+)\. +(.*)/
  const hrRegex = /^ *([-*_] *){3,} *$/
  // 表格行：支持有无尾部 | 的情况
  const tableRowRegex = /^\s*\|(.+?)(?:\|)?\s*$/
  const tableSeparatorRegex = /^\s*\|?\s*(:?-+:?)\s*(\|\s*(:?-+:?)\s*)+\|?\s*$/

  const contentBlocks: React.ReactNode[] = []
  let inCodeBlock = false
  let lastLineEmpty = true
  let codeBlockContent: string[] = []
  let codeBlockLang: string | null = null
  let codeBlockFence = ''
  let inTable = false
  let tableRows: string[][] = []
  let tableHeaders: string[] = []

  function addContentBlock(block: React.ReactNode) {
    if (block) {
      contentBlocks.push(block)
      lastLineEmpty = false
    }
  }

  lines.forEach((line, index) => {
    const key = `line-${index}`

    // 代码块内部
    if (inCodeBlock) {
      const fenceMatch = line.match(codeFenceRegex)
      if (
        fenceMatch &&
        fenceMatch[1].startsWith(codeBlockFence[0]) &&
        fenceMatch[1].length >= codeBlockFence.length
      ) {
        // 代码块结束
        addContentBlock(
          <ColorizeCode
            key={key}
            code={codeBlockContent.join('\n')}
            language={codeBlockLang}
            showLineNumbers={false}
          />
        )
        inCodeBlock = false
        codeBlockContent = []
        codeBlockLang = null
        codeBlockFence = ''
      } else {
        codeBlockContent.push(line)
      }
      return
    }

    const codeFenceMatch = line.match(codeFenceRegex)
    const headerMatch = line.match(headerRegex)
    const ulMatch = line.match(ulItemRegex)
    const olMatch = line.match(olItemRegex)
    const hrMatch = line.match(hrRegex)
    const tableRowMatch = line.match(tableRowRegex)
    const tableSeparatorMatch = line.match(tableSeparatorRegex)

    // 代码块开始
    if (codeFenceMatch) {
      inCodeBlock = true
      codeBlockFence = codeFenceMatch[1]
      codeBlockLang = codeFenceMatch[2] || null
    }
    // 表格开始
    else if (tableRowMatch && !inTable) {
      if (index + 1 < lines.length && lines[index + 1].match(tableSeparatorRegex)) {
        inTable = true
        tableHeaders = tableRowMatch[1].split('|').map(cell => cell.trim())
        tableRows = []
      } else {
        addContentBlock(
          <Box key={key}>
            <Text wrap="wrap" color={theme.text.primary}>
              <RenderInline text={line} defaultColor={theme.text.primary} />
            </Text>
          </Box>
        )
      }
    }
    // 表格分隔符
    else if (inTable && tableSeparatorMatch) {
      // 跳过分隔符行
    }
    // 表格行
    else if (inTable && tableRowMatch) {
      const cells = tableRowMatch[1].split('|').map(cell => cell.trim())
      while (cells.length < tableHeaders.length) cells.push('')
      if (cells.length > tableHeaders.length) cells.length = tableHeaders.length
      tableRows.push(cells)
    }
    // 表格结束
    else if (inTable && !tableRowMatch) {
      if (tableHeaders.length > 0 && tableRows.length > 0) {
        addContentBlock(
          <TableRenderer
            key={`table-${contentBlocks.length}`}
            headers={tableHeaders}
            rows={tableRows}
            terminalWidth={terminalWidth}
          />
        )
      }
      inTable = false
      tableRows = []
      tableHeaders = []

      // 处理当前行
      if (line.trim().length > 0) {
        addContentBlock(
          <Box key={key}>
            <Text wrap="wrap" color={theme.text.primary}>
              <RenderInline text={line} defaultColor={theme.text.primary} />
            </Text>
          </Box>
        )
      }
    }
    // 横线
    else if (hrMatch) {
      addContentBlock(
        <Box key={key}>
          <Text color={theme.border}>{'─'.repeat(40)}</Text>
        </Box>
      )
    }
    // 标题
    else if (headerMatch) {
      const level = headerMatch[1].length
      const headerText = headerMatch[2]
      let headerNode: React.ReactNode = null

      switch (level) {
        case 1:
          headerNode = (
            <Text bold underline color={theme.primary}>
              <RenderInline text={headerText} defaultColor={theme.primary} />
            </Text>
          )
          break
        case 2:
          headerNode = (
            <Text bold color={theme.secondary}>
              <RenderInline text={headerText} defaultColor={theme.secondary} />
            </Text>
          )
          break
        case 3:
          headerNode = (
            <Text bold color={theme.info}>
              <RenderInline text={headerText} defaultColor={theme.info} />
            </Text>
          )
          break
        default:
          headerNode = (
            <Text bold color={theme.text.primary}>
              <RenderInline text={headerText} defaultColor={theme.text.primary} />
            </Text>
          )
          break
      }

      if (headerNode) {
        addContentBlock(
          <Box key={key} marginTop={lastLineEmpty ? 0 : 1}>
            {headerNode}
          </Box>
        )
      }
    }
    // 无序列表
    else if (ulMatch) {
      const leadingWhitespace = ulMatch[1]
      const itemText = ulMatch[3]
      const indentation = leadingWhitespace.length

      addContentBlock(
        <Box key={key} paddingLeft={indentation + 1} flexDirection="row">
          <Box width={2}>
            <Text color={theme.text.primary}>• </Text>
          </Box>
          <Box flexGrow={1}>
            <Text wrap="wrap" color={theme.text.primary}>
              <RenderInline text={itemText} defaultColor={theme.text.primary} />
            </Text>
          </Box>
        </Box>
      )
    }
    // 有序列表
    else if (olMatch) {
      const leadingWhitespace = olMatch[1]
      const marker = olMatch[2]
      const itemText = olMatch[3]
      const indentation = leadingWhitespace.length
      const prefix = `${marker}. `

      addContentBlock(
        <Box key={key} paddingLeft={indentation + 1} flexDirection="row">
          <Box width={prefix.length}>
            <Text color={theme.text.primary}>{prefix}</Text>
          </Box>
          <Box flexGrow={1}>
            <Text wrap="wrap" color={theme.text.primary}>
              <RenderInline text={itemText} defaultColor={theme.text.primary} />
            </Text>
          </Box>
        </Box>
      )
    }
    // 空行或普通文本
    else {
      if (line.trim().length === 0 && !inCodeBlock) {
        // 空行：不添加额外的 Box，让段落自然分隔
        if (!lastLineEmpty) {
          lastLineEmpty = true
        }
      } else {
        const inlineContent = <RenderInline text={line} defaultColor={theme.text.primary} />
        addContentBlock(
          <Box key={key}>
            <Text wrap="wrap" color={theme.text.primary}>
              {inlineContent}
            </Text>
          </Box>
        )
      }
    }
  })

  // 处理未闭合的代码块
  if (inCodeBlock) {
    addContentBlock(
      <ColorizeCode
        key="line-eof"
        code={codeBlockContent.join('\n')}
        language={codeBlockLang}
        showLineNumbers={false}
      />
    )
  }

  // 处理未闭合的表格
  if (inTable && tableHeaders.length > 0 && tableRows.length > 0) {
    addContentBlock(
      <TableRenderer
        key={`table-${contentBlocks.length}`}
        headers={tableHeaders}
        rows={tableRows}
        terminalWidth={terminalWidth}
      />
    )
  }

  return <Box flexDirection="column">{contentBlocks}</Box>
}

export const MarkdownDisplay = React.memo(MarkdownDisplayInternal)
