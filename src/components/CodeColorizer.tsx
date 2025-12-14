import React from 'react'
import { Text, Box } from 'ink'
import { common, createLowlight } from 'lowlight'
import type { Root, Element, Text as HastText, ElementContent, RootContent } from 'hast'
import { theme } from '../ui/theme.js'

// 创建 lowlight 实例
const lowlight = createLowlight(common)

// 语法高亮颜色映射
const syntaxColors: Record<string, string> = {
  'hljs-keyword': theme.code.keyword,
  'hljs-string': theme.code.string,
  'hljs-function': theme.code.function,
  'hljs-comment': theme.code.comment,
  'hljs-number': theme.primary,
  'hljs-built_in': theme.secondary,
  'hljs-title': theme.accent,
  'hljs-variable': theme.text.primary,
  'hljs-type': theme.info,
  'hljs-operator': theme.text.secondary,
}

/**
 * 渲染 HAST 语法树节点
 */
function renderHastNode(
  node: Root | Element | HastText | RootContent,
  inheritedColor: string | undefined
): React.ReactNode {
  if (node.type === 'text') {
    const color = inheritedColor || theme.code.text
    return <Text color={color}>{node.value}</Text>
  }

  if (node.type === 'element') {
    const nodeClasses: string[] = (node.properties?.['className'] as string[]) || []
    let elementColor: string | undefined = undefined

    // 查找颜色
    for (let i = nodeClasses.length - 1; i >= 0; i--) {
      const className = nodeClasses[i]
      if (syntaxColors[className]) {
        elementColor = syntaxColors[className]
        break
      }
    }

    const colorToPassDown = elementColor || inheritedColor

    // 递归渲染子节点
    const children = node.children?.map((child: ElementContent, index: number) => (
      <React.Fragment key={index}>
        {renderHastNode(child, colorToPassDown)}
      </React.Fragment>
    ))

    return <React.Fragment>{children}</React.Fragment>
  }

  if (node.type === 'root') {
    if (!node.children || node.children.length === 0) {
      return null
    }

    return node.children?.map((child: RootContent, index: number) => (
      <React.Fragment key={index}>
        {renderHastNode(child, inheritedColor)}
      </React.Fragment>
    ))
  }

  return null
}

/**
 * 高亮并渲染一行代码
 */
function highlightLine(line: string, language: string | null): React.ReactNode {
  try {
    const highlighted = !language || !lowlight.registered(language)
      ? lowlight.highlightAuto(line)
      : lowlight.highlight(language, line)

    const rendered = renderHastNode(highlighted, undefined)
    return rendered !== null ? rendered : line
  } catch {
    return line
  }
}

interface ColorizeCodeProps {
  code: string
  language?: string | null
  showLineNumbers?: boolean
}

/**
 * 代码高亮组件
 */
function ColorizeCodeInternal({ code, language = null, showLineNumbers = false }: ColorizeCodeProps) {
  const codeToHighlight = code.replace(/\n$/, '')
  const lines = codeToHighlight.split('\n')
  const padWidth = String(lines.length).length

  const renderedLines = lines.map((line, index) => {
    const contentToRender = highlightLine(line, language)

    return (
      <Box key={index} minHeight={1}>
        {showLineNumbers && (
          <Text color={theme.text.dim}>
            {`${String(index + 1).padStart(padWidth, ' ')} `}
          </Text>
        )}
        <Text color={theme.code.text}>{contentToRender}</Text>
      </Box>
    )
  })

  return (
    <Box flexDirection="column" paddingLeft={1} paddingY={1} borderStyle="round" borderColor={theme.border}>
      {renderedLines}
    </Box>
  )
}

export const ColorizeCode = React.memo(ColorizeCodeInternal)
