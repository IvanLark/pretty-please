import React from 'react'
import { Text } from 'ink'
import { getCurrentTheme } from '../ui/theme.js'

interface RenderInlineProps {
  text: string
  defaultColor?: string
}

/**
 * 行内 Markdown 渲染器
 * 处理 **粗体**、*斜体*、`代码`、~~删除线~~、<u>下划线</u>、链接
 */
function RenderInlineInternal({ text, defaultColor }: RenderInlineProps) {
  const theme = getCurrentTheme()
  const baseColor = defaultColor || theme.text.primary

  // 快速路径：纯文本无 markdown
  if (!/[*_~`<[https?:]/.test(text)) {
    return <Text color={baseColor}>{text}</Text>
  }

  const nodes: React.ReactNode[] = []
  let lastIndex = 0

  // 匹配所有行内 markdown 语法（添加删除线、下划线、链接）
  const inlineRegex = /(~~.+?~~|\*\*[^*]+?\*\*|\*[^*]+?\*|_[^_]+?_|`+[^`]+?`+|\[.*?\]\(.*?\)|<u>.*?<\/u>|https?:\/\/\S+)/g
  let match

  while ((match = inlineRegex.exec(text)) !== null) {
    // 添加匹配之前的普通文本
    if (match.index > lastIndex) {
      nodes.push(
        <Text key={`t-${lastIndex}`} color={baseColor}>
          {text.slice(lastIndex, match.index)}
        </Text>
      )
    }

    const fullMatch = match[0]
    let renderedNode: React.ReactNode = null
    const key = `m-${match.index}`

    // **粗体**
    if (fullMatch.startsWith('**') && fullMatch.endsWith('**') && fullMatch.length > 4) {
      renderedNode = (
        <Text key={key} bold color={baseColor}>
          {fullMatch.slice(2, -2)}
        </Text>
      )
    }
    // ~~删除线~~
    else if (fullMatch.startsWith('~~') && fullMatch.endsWith('~~') && fullMatch.length > 4) {
      renderedNode = (
        <Text key={key} strikethrough color={baseColor}>
          {fullMatch.slice(2, -2)}
        </Text>
      )
    }
    // *斜体*
    else if (fullMatch.startsWith('*') && fullMatch.endsWith('*') && fullMatch.length > 2 && !fullMatch.startsWith('**')) {
      renderedNode = (
        <Text key={key} italic color={baseColor}>
          {fullMatch.slice(1, -1)}
        </Text>
      )
    }
    // `行内代码`
    else if (fullMatch.startsWith('`') && fullMatch.endsWith('`')) {
      const codeText = fullMatch.slice(1, -1)
      renderedNode = (
        <Text key={key} color={theme.primary}>
          {codeText}
        </Text>
      )
    }
    // [链接文本](URL)
    else if (fullMatch.startsWith('[') && fullMatch.includes('](') && fullMatch.endsWith(')')) {
      const linkMatch = fullMatch.match(/\[(.*?)\]\((.*?)\)/)
      if (linkMatch) {
        const linkText = linkMatch[1]
        const url = linkMatch[2]
        renderedNode = (
          <Text key={key} color={baseColor}>
            {linkText}
            <Text color={theme.info}> ({url})</Text>
          </Text>
        )
      }
    }
    // <u>下划线</u>
    else if (fullMatch.startsWith('<u>') && fullMatch.endsWith('</u>') && fullMatch.length > 7) {
      renderedNode = (
        <Text key={key} underline color={baseColor}>
          {fullMatch.slice(3, -4)}
        </Text>
      )
    }
    // 裸 URL
    else if (fullMatch.match(/^https?:\/\//)) {
      renderedNode = (
        <Text key={key} color={theme.info}>
          {fullMatch}
        </Text>
      )
    }

    nodes.push(renderedNode || <Text key={key} color={baseColor}>{fullMatch}</Text>)
    lastIndex = inlineRegex.lastIndex
  }

  // 添加剩余的普通文本
  if (lastIndex < text.length) {
    nodes.push(
      <Text key={`t-${lastIndex}`} color={baseColor}>
        {text.slice(lastIndex)}
      </Text>
    )
  }

  return <>{nodes}</>
}

export const RenderInline = React.memo(RenderInlineInternal)
