import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import {
  getHookStatus,
  installShellHook,
  uninstallShellHook,
  detectShell,
  getShellConfigPath,
} from '../shell-hook.js'
import { theme } from '../ui/theme.js'

interface HookManagerProps {
  action: 'status' | 'install' | 'uninstall'
  onComplete: () => void
}

/**
 * HookManager 组件 - Hook 管理界面
 */
export const HookManager: React.FC<HookManagerProps> = ({ action, onComplete }) => {
  const [status, setStatus] = useState(getHookStatus())
  const [message, setMessage] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    const execute = async () => {
      if (action === 'install') {
        setIsProcessing(true)
        const shellType = detectShell()
        const configPath = getShellConfigPath(shellType)

        if (shellType === 'unknown') {
          setMessage('❌ 不支持的 shell 类型')
          setIsProcessing(false)
          setTimeout(onComplete, 2000)
          return
        }

        const result = await installShellHook()
        setStatus(getHookStatus())
        setIsProcessing(false)

        if (result) {
          setMessage(
            `✅ Shell hook 已安装\n⚠️  请重启终端或执行: source ${configPath}`
          )
        }

        setTimeout(onComplete, 3000)
      } else if (action === 'uninstall') {
        setIsProcessing(true)
        uninstallShellHook()
        setStatus(getHookStatus())
        setMessage('✅ Shell hook 已卸载\n⚠️  请重启终端使其生效')
        setIsProcessing(false)
        setTimeout(onComplete, 3000)
      } else {
        // status
        setTimeout(onComplete, 100)
      }
    }

    execute()
  }, [action, onComplete])

  if (action === 'install' || action === 'uninstall') {
    return (
      <Box flexDirection="column" marginY={1}>
        <Text bold color={theme.accent}>
          🔧 Shell Hook {action === 'install' ? '安装' : '卸载'}向导
        </Text>
        <Text color={theme.text.secondary}>{'━'.repeat(40)}</Text>

        {isProcessing && <Text color={theme.info}>处理中...</Text>}

        {message && (
          <Box flexDirection="column" marginTop={1}>
            {message.split('\n').map((line, i) => (
              <Text
                key={i}
                color={
                  line.startsWith('✅')
                    ? theme.success
                    : line.startsWith('⚠️')
                    ? theme.warning
                    : line.startsWith('❌')
                    ? theme.error
                    : theme.text.primary
                }
              >
                {line}
              </Text>
            ))}
          </Box>
        )}
      </Box>
    )
  }

  // Status display
  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold>📊 Shell Hook 状态</Text>
      <Text color={theme.text.secondary}>{'━'.repeat(40)}</Text>

      <Box marginTop={1}>
        <Text color={theme.primary}>  Shell 类型: </Text>
        <Text>{status.shellType}</Text>
      </Box>

      <Box>
        <Text color={theme.primary}>  配置文件:   </Text>
        <Text>{status.configPath || '未知'}</Text>
      </Box>

      <Box>
        <Text color={theme.primary}>  已安装:     </Text>
        {status.installed ? (
          <Text color={theme.success}>是</Text>
        ) : (
          <Text color={theme.text.secondary}>否</Text>
        )}
      </Box>

      <Box>
        <Text color={theme.primary}>  已启用:     </Text>
        {status.enabled ? (
          <Text color={theme.success}>是</Text>
        ) : (
          <Text color={theme.text.secondary}>否</Text>
        )}
      </Box>

      <Box>
        <Text color={theme.primary}>  历史文件:   </Text>
        <Text>{status.historyFile}</Text>
      </Box>

      <Text color={theme.text.secondary}>{'━'.repeat(40)}</Text>

      {!status.installed && (
        <Box marginTop={1}>
          <Text color={theme.text.secondary}>
            提示: 运行 <Text color={theme.primary}>pls hook install</Text> 安装 shell hook
          </Text>
        </Box>
      )}
    </Box>
  )
}
