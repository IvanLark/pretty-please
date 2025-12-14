import React from 'react'
import { Text } from 'ink'
import { theme } from '../ui/theme.js'

interface DurationProps {
  ms: number
}

/**
 * 格式化耗时
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  }
  return `${(ms / 1000).toFixed(2)}s`
}

/**
 * Duration 组件 - 显示耗时
 */
export const Duration: React.FC<DurationProps> = ({ ms }) => {
  return <Text color={theme.text.secondary}>({formatDuration(ms)})</Text>
}
