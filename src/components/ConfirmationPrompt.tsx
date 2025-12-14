import React from 'react'
import { Text, useInput } from 'ink'
import { theme } from '../ui/theme.js'

interface ConfirmationPromptProps {
  prompt: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * ConfirmationPrompt 组件 - 单键确认提示
 * 回车 = 确认，Esc = 取消，Ctrl+C = 退出
 */
export const ConfirmationPrompt: React.FC<ConfirmationPromptProps> = ({
  prompt,
  onConfirm,
  onCancel,
}) => {
  useInput((input, key) => {
    if (key.return) {
      // 回车键
      onConfirm()
    } else if (key.escape) {
      // Esc 键
      onCancel()
    } else if (key.ctrl && input === 'c') {
      // Ctrl+C
      process.exit(0)
    }
  })

  return (
    <Text>
      <Text bold color={theme.warning}>
        {prompt}
      </Text>
      <Text color={theme.text.secondary}> [回车执行 / Esc 取消] </Text>
    </Text>
  )
}
