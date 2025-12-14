import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import { generateCommand } from '../ai.js'
import { detectBuiltin, formatBuiltins } from '../builtin-detector.js'
import { CommandBox } from './CommandBox.js'
import { ConfirmationPrompt } from './ConfirmationPrompt.js'
import { Duration } from './Duration.js'
import { theme } from '../ui/theme.js'

interface CommandGeneratorProps {
  prompt: string
  debug?: boolean
  onComplete: (result: {
    command?: string
    confirmed?: boolean
    cancelled?: boolean
    hasBuiltin?: boolean
    builtins?: string[]
    debugInfo?: any
    error?: string
  }) => void
}

type State =
  | { type: 'thinking' }
  | { type: 'showing_command'; command: string; hasBuiltin: boolean; builtins: string[] }
  | { type: 'cancelled'; command: string }
  | { type: 'error'; error: string }

interface DebugInfo {
  sysinfo: string
  model: string
  systemPrompt: string
  userPrompt: string
}

/**
 * CommandGenerator 组件 - 命令生成和确认（仅用于交互）
 * 不执行命令，执行交给调用方用原生方式处理
 */
export const CommandGenerator: React.FC<CommandGeneratorProps> = ({ prompt, debug, onComplete }) => {
  const [state, setState] = useState<State>({ type: 'thinking' })
  const [thinkDuration, setThinkDuration] = useState(0)
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null)

  // 初始化：调用 AI 生成命令
  useEffect(() => {
    const thinkStart = Date.now()

    generateCommand(prompt, { debug: debug || false })
      .then((result: any) => {
        const command = debug && typeof result === 'object' ? result.command : result
        const thinkEnd = Date.now()
        setThinkDuration(thinkEnd - thinkStart)

        if (debug && typeof result === 'object' && 'debug' in result) {
          setDebugInfo(result.debug)
        }

        // 检测 builtin
        const { hasBuiltin, builtins } = detectBuiltin(command)

        setState({
          type: 'showing_command',
          command,
          hasBuiltin,
          builtins,
        })

        // 如果是 builtin，直接完成（不执行）
        if (hasBuiltin) {
          setTimeout(() => {
            onComplete({
              command,
              confirmed: false,
              hasBuiltin: true,
              builtins,
              debugInfo: debugInfo || undefined,
            })
          }, 100)
        }
      })
      .catch((error: any) => {
        setState({ type: 'error', error: error.message })
        setTimeout(() => {
          onComplete({ error: error.message })
        }, 100)
      })
  }, [prompt, debug])

  // 处理确认
  const handleConfirm = () => {
    if (state.type === 'showing_command') {
      // 返回命令和确认状态，让调用方执行
      onComplete({
        command: state.command,
        confirmed: true,
        debugInfo: debugInfo || undefined,
      })
    }
  }

  // 处理取消
  const handleCancel = () => {
    if (state.type === 'showing_command') {
      setState({ type: 'cancelled', command: state.command })
      setTimeout(() => {
        onComplete({
          command: state.command,
          cancelled: true,
        })
      }, 100)
    }
  }

  return (
    <Box flexDirection="column">
      {/* 思考阶段 */}
      {state.type === 'thinking' && (
        <Box>
          <Text color={theme.info}>
            <Spinner type="dots" /> 正在思考...
          </Text>
        </Box>
      )}

      {/* 思考完成 */}
      {state.type !== 'thinking' && thinkDuration > 0 && (
        <Box>
          <Text color={theme.success}>✓ 思考完成 </Text>
          <Duration ms={thinkDuration} />
        </Box>
      )}

      {/* 调试信息 */}
      {debugInfo && (
        <Box flexDirection="column" marginY={1}>
          <Text color={theme.accent}>━━━ 调试信息 ━━━</Text>
          <Text color={theme.text.secondary}>系统信息: {debugInfo.sysinfo}</Text>
          <Text color={theme.text.secondary}>模型: {debugInfo.model}</Text>
          <Text color={theme.text.secondary}>System Prompt:</Text>
          <Text dimColor>{debugInfo.systemPrompt}</Text>
          <Text color={theme.text.secondary}>User Prompt: {debugInfo.userPrompt}</Text>
          <Text color={theme.accent}>━━━━━━━━━━━━━━━━</Text>
        </Box>
      )}

      {/* 显示命令 */}
      {(state.type === 'showing_command' || state.type === 'cancelled') && (
        <CommandBox command={state.command} />
      )}

      {/* Builtin 警告 */}
      {state.type === 'showing_command' && state.hasBuiltin && (
        <Box flexDirection="column" marginY={1}>
          <Text color={theme.error}>
            ⚠️  此命令包含 shell 内置命令（{formatBuiltins(state.builtins)}），无法在子进程中生效
          </Text>
          <Text color={theme.warning}>💡 请手动复制到终端执行</Text>
        </Box>
      )}

      {/* 确认提示 */}
      {state.type === 'showing_command' && !state.hasBuiltin && (
        <ConfirmationPrompt prompt="执行？" onConfirm={handleConfirm} onCancel={handleCancel} />
      )}

      {/* 取消 */}
      {state.type === 'cancelled' && (
        <Box marginTop={1}>
          <Text color={theme.text.secondary}>已取消执行</Text>
        </Box>
      )}

      {/* 错误 */}
      {state.type === 'error' && (
        <Box marginTop={1}>
          <Text color={theme.error}>❌ 错误: {state.error}</Text>
        </Box>
      )}
    </Box>
  )
}
