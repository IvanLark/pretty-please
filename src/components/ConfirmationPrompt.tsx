import React from 'react'
import { Text, useInput } from 'ink'
import { getCurrentTheme } from '../ui/theme.js'

interface ConfirmationPromptProps {
  prompt: string
  onConfirm: () => void
  onCancel: () => void
  onEdit?: () => void  // 新增：编辑回调
}

/**
 * ConfirmationPrompt 组件 - 单键确认提示
 * 回车 = 确认，E = 编辑，Esc = 取消，Ctrl+C = 退出
 */
export const ConfirmationPrompt: React.FC<ConfirmationPromptProps> = ({
  prompt,
  onConfirm,
  onCancel,
  onEdit,
}) => {
  const theme = getCurrentTheme()
  useInput((input, key) => {
    if (key.return) {
      // 回车键
      onConfirm()
    } else if (key.escape) {
      // Esc 键
      onCancel()
    } else if ((input === 'e' || input === 'E') && onEdit) {
      // E 键进入编辑模式
      onEdit()
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
      <Text color={theme.text.secondary}>
        {onEdit ? ' [回车执行 / E 编辑 / Esc 取消] ' : ' [回车执行 / Esc 取消] '}
      </Text>
    </Text>
  )
}
