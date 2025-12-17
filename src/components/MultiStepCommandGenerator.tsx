import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import Spinner from 'ink-spinner'
import { generateMultiStepCommand, type CommandStep, type ExecutedStep, type RemoteContext } from '../multi-step.js'
import { detectBuiltin, formatBuiltins } from '../builtin-detector.js'
import { CommandBox } from './CommandBox.js'
import { ConfirmationPrompt } from './ConfirmationPrompt.js'
import { Duration } from './Duration.js'
import { getCurrentTheme } from '../ui/theme.js'
import { getConfig } from '../config.js'

interface MultiStepCommandGeneratorProps {
  prompt: string
  debug?: boolean
  onStepComplete: (step: {
    command: string
    aiGeneratedCommand?: string  // 新增：AI 生成的原始命令
    userModified?: boolean        // 新增：用户是否修改
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
  remoteContext?: RemoteContext  // 远程执行上下文
  isRemote?: boolean             // 是否为远程执行（远程执行时不检测 builtin）
}

type State =
  | { type: 'thinking' }
  | { type: 'showing_command'; stepData: CommandStep }
  | { type: 'editing'; stepData: CommandStep }  // 新增：编辑状态
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
  remoteContext,
  isRemote = false,
  onStepComplete,
}) => {
  const theme = getCurrentTheme()
  const [state, setState] = useState<State>({ type: 'thinking' })
  const [thinkDuration, setThinkDuration] = useState(0)
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const [editedCommand, setEditedCommand] = useState('')  // 新增：编辑后的命令

  // 监听编辑模式下的 Esc 键
  useInput(
    (input, key) => {
      if (state.type === 'editing' && key.escape) {
        handleEditCancel()
      }
    },
    { isActive: state.type === 'editing' }
  )

  // 初始化：调用 Mastra 生成命令
  useEffect(() => {
    const thinkStart = Date.now()

    generateMultiStepCommand(prompt, previousSteps, { debug, remoteContext })
      .then((result) => {
        const thinkEnd = Date.now()
        setThinkDuration(thinkEnd - thinkStart)

        // 保存调试信息
        if (debug && result.debugInfo) {
          setDebugInfo(result.debugInfo)
        }

        // 如果 AI 返回空命令且决定不继续，说明 AI 放弃了
        // 直接结束，不显示命令框
        if (!result.stepData.command.trim() && result.stepData.continue === false) {
          setTimeout(() => {
            onStepComplete({
              command: '',
              confirmed: false,
              reasoning: result.stepData.reasoning,
              needsContinue: false,
            })
          }, 100)
          return
        }

        // 检测 builtin（优先检测，但远程执行时跳过）
        const { hasBuiltin, builtins } = detectBuiltin(result.stepData.command)

        if (hasBuiltin && !isRemote) {
          // 有 builtin 且是本地执行，不管什么模式都不编辑，直接提示
          setState({
            type: 'showing_command',
            stepData: result.stepData,
          })
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
          return
        }

        // 根据 editMode 决定进入哪个状态
        const config = getConfig()
        const autoEdit = config.editMode === 'auto'

        if (autoEdit) {
          // auto 模式：直接进入编辑状态
          setEditedCommand(result.stepData.command)
          setState({
            type: 'editing',
            stepData: result.stepData,
          })
        } else {
          // manual 模式：显示命令，等待用户操作
          setState({
            type: 'showing_command',
            stepData: result.stepData,
          })
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
  }, [prompt, previousSteps, debug, remoteContext])

  // 处理确认
  const handleConfirm = () => {
    if (state.type === 'showing_command') {
      onStepComplete({
        command: state.stepData.command,
        aiGeneratedCommand: state.stepData.command,  // 原始命令
        userModified: false,
        confirmed: true,
        reasoning: state.stepData.reasoning,
        needsContinue: state.stepData.continue,
        nextStepHint: state.stepData.nextStepHint,
        debugInfo: debugInfo,
      })
    }
  }

  // 处理编辑
  const handleEdit = () => {
    if (state.type === 'showing_command') {
      setEditedCommand(state.stepData.command)  // 初始化为 AI 生成的命令
      setState({ type: 'editing', stepData: state.stepData })
    }
  }

  // 编辑完成确认
  const handleEditConfirm = () => {
    if (state.type === 'editing') {
      const modified = editedCommand !== state.stepData.command
      onStepComplete({
        command: editedCommand,  // 使用编辑后的命令
        aiGeneratedCommand: state.stepData.command,  // 保存 AI 原始命令
        userModified: modified,
        confirmed: true,
        reasoning: state.stepData.reasoning,
        needsContinue: state.stepData.continue,
        nextStepHint: state.stepData.nextStepHint,
        debugInfo: debugInfo,
      })
    }
  }

  // 取消编辑
  const handleEditCancel = () => {
    if (state.type === 'editing') {
      const config = getConfig()

      if (config.editMode === 'auto') {
        // auto 模式：Esc 直接取消整个操作
        setState({ type: 'cancelled', command: state.stepData.command })
        setTimeout(() => {
          onStepComplete({
            command: state.stepData.command,
            confirmed: false,
            cancelled: true,
          })
        }, 100)
      } else {
        // manual 模式：Esc 返回到 showing_command 状态
        setState({ type: 'showing_command', stepData: state.stepData })
      }
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
            {remoteContext
              ? (currentStepNumber === 1 ? `正在为 ${remoteContext.name} 思考...` : `正在规划步骤 ${currentStepNumber} (${remoteContext.name})...`)
              : (currentStepNumber === 1 ? '正在思考...' : `正在规划步骤 ${currentStepNumber}...`)
            }
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

              {debugInfo.remoteContext && (
                <Box marginTop={1}>
                  <Text color={theme.text.secondary}>远程服务器: {debugInfo.remoteContext.name} ({debugInfo.remoteContext.sysInfo.os})</Text>
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

          {/* Builtin 警告（仅本地执行时显示） */}
          {!isRemote && (() => {
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
          {(isRemote || !detectBuiltin(state.stepData.command).hasBuiltin) && (
            <ConfirmationPrompt
              prompt="执行？"
              onConfirm={handleConfirm}
              onCancel={handleCancel}
              onEdit={handleEdit}  // 新增：编辑回调
            />
          )}
        </>
      )}

      {/* 编辑模式 */}
      {state.type === 'editing' && (
        <>
          {/* 步骤信息（仅多步骤时显示） */}
          {state.stepData.continue === true && (
            <Box flexDirection="column" marginTop={1}>
              <Text color={theme.text.secondary}>步骤 {currentStepNumber}/?</Text>
              {state.stepData.reasoning && (
                <Text color={theme.text.muted}>原因: {state.stepData.reasoning}</Text>
              )}
            </Box>
          )}

          {/* 命令框（AI 建议） */}
          <CommandBox command={state.stepData.command} />

          {/* 编辑框 */}
          <Box flexDirection="row">
            <Text color={theme.primary}>{'> '}</Text>
            <TextInput
              value={editedCommand}
              onChange={setEditedCommand}
              onSubmit={handleEditConfirm}
            />
          </Box>
          <Box marginTop={1}>
            <Text color={theme.text.secondary}>
              {getConfig().editMode === 'auto' ? '[回车执行 / Esc 取消]' : '[回车执行 / Esc 返回]'}
            </Text>
          </Box>
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
