import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import { generateMultiStepCommand, type CommandStep, type ExecutedStep } from '../multi-step.js'
import { detectBuiltin, formatBuiltins } from '../builtin-detector.js'
import { CommandBox } from './CommandBox.js'
import { ConfirmationPrompt } from './ConfirmationPrompt.js'
import { Duration } from './Duration.js'
import { theme } from '../ui/theme.js'

interface MultiStepCommandGeneratorProps {
  prompt: string
  debug?: boolean
  onStepComplete: (step: {
    command: string
    confirmed: boolean
    cancelled?: boolean
    hasBuiltin?: boolean
    builtins?: string[]
    reasoning?: string
    needsContinue?: boolean
    nextStepHint?: string
    debugInfo?: any
  }) => void
  previousSteps?: ExecutedStep[]
  currentStepNumber?: number
}

type State =
  | { type: 'thinking' }
  | { type: 'showing_command'; stepData: CommandStep }
  | { type: 'cancelled'; command: string }
  | { type: 'error'; error: string }

/**
 * MultiStepCommandGenerator 组件 - 多步骤命令生成
 * 每次只生成一个命令，支持 continue 机制
 */
export const MultiStepCommandGenerator: React.FC<MultiStepCommandGeneratorProps> = ({
  prompt,
  debug,
  previousSteps = [],
  currentStepNumber = 1,
  onStepComplete,
}) => {
  const [state, setState] = useState<State>({ type: 'thinking' })
  const [thinkDuration, setThinkDuration] = useState(0)
  const [debugInfo, setDebugInfo] = useState<any>(null)

  // 初始化：调用 Mastra 生成命令
  useEffect(() => {
    const thinkStart = Date.now()

    generateMultiStepCommand(prompt, previousSteps, { debug })
      .then((result) => {
        const thinkEnd = Date.now()
        setThinkDuration(thinkEnd - thinkStart)

        // 保存调试信息
        if (debug && result.debugInfo) {
          setDebugInfo(result.debugInfo)
        }

        setState({
          type: 'showing_command',
          stepData: result.stepData,
        })

        // 检测 builtin
        const { hasBuiltin, builtins } = detectBuiltin(result.stepData.command)

        if (hasBuiltin) {
          setTimeout(() => {
            onStepComplete({
              command: result.stepData.command,
              confirmed: false,
              hasBuiltin: true,
              builtins,
              reasoning: result.stepData.reasoning,
              needsContinue: result.stepData.continue,
            })
          }, 100)
        }
      })
      .catch((error: any) => {
        setState({ type: 'error', error: error.message })
        setTimeout(() => {
          onStepComplete({
            command: '',
            confirmed: false,
            cancelled: true,
          })
        }, 100)
      })
  }, [prompt, previousSteps, debug])

  // 处理确认
  const handleConfirm = () => {
    if (state.type === 'showing_command') {
      onStepComplete({
        command: state.stepData.command,
        confirmed: true,
        reasoning: state.stepData.reasoning,
        needsContinue: state.stepData.continue,
        nextStepHint: state.stepData.nextStepHint,
        debugInfo: debugInfo,
      })
    }
  }

  // 处理取消
  const handleCancel = () => {
    if (state.type === 'showing_command') {
      setState({ type: 'cancelled', command: state.stepData.command })
      setTimeout(() => {
        onStepComplete({
          command: state.stepData.command,
          confirmed: false,
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
            <Spinner type="dots" />{' '}
            {currentStepNumber === 1 ? '正在思考...' : `正在规划步骤 ${currentStepNumber}...`}
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

      {/* 显示步骤信息和命令 */}
      {state.type === 'showing_command' && (
        <>
          {/* 调试信息 */}
          {debug && debugInfo && (
            <Box flexDirection="column" marginTop={1}>
              <Text color={theme.accent}>━━━ 调试信息 ━━━</Text>

              <Text color={theme.text.secondary}>完整系统提示词:</Text>
              <Text color={theme.text.dim}>{debugInfo.fullPrompt}</Text>

              <Box marginTop={1}>
                <Text color={theme.text.secondary}>用户 Prompt: {debugInfo.userPrompt}</Text>
              </Box>

              {debugInfo.previousStepsCount > 0 && (
                <Box marginTop={1}>
                  <Text color={theme.text.secondary}>已执行步骤数: {debugInfo.previousStepsCount}</Text>
                </Box>
              )}

              <Box marginTop={1}>
                <Text color={theme.text.secondary}>AI 返回的 JSON:</Text>
              </Box>
              <Text color={theme.text.dim}>{JSON.stringify(debugInfo.response, null, 2)}</Text>

              <Text color={theme.accent}>━━━━━━━━━━━━━━━━</Text>
            </Box>
          )}

          {/* 步骤信息（仅多步骤时显示） */}
          {state.stepData.continue === true && (
            <Box flexDirection="column" marginTop={1}>
              <Text color={theme.text.secondary}>步骤 {currentStepNumber}/?</Text>
              {state.stepData.reasoning && (
                <Text color={theme.text.muted}>原因: {state.stepData.reasoning}</Text>
              )}
              {state.stepData.nextStepHint && (
                <Text color={theme.text.muted}>下一步: {state.stepData.nextStepHint}</Text>
              )}
            </Box>
          )}

          {/* 命令框 */}
          <CommandBox command={state.stepData.command} />

          {/* Builtin 警告 */}
          {(() => {
            const { hasBuiltin, builtins } = detectBuiltin(state.stepData.command)
            if (hasBuiltin) {
              return (
                <Box flexDirection="column" marginY={1}>
                  <Text color={theme.error}>
                    ⚠️  此命令包含 shell 内置命令（{formatBuiltins(builtins)}），无法在子进程中生效
                  </Text>
                  <Text color={theme.warning}>💡 请手动复制到终端执行</Text>
                </Box>
              )
            }
            return null
          })()}

          {/* 确认提示 */}
          {!detectBuiltin(state.stepData.command).hasBuiltin && (
            <ConfirmationPrompt prompt="执行？" onConfirm={handleConfirm} onCancel={handleCancel} />
          )}
        </>
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
