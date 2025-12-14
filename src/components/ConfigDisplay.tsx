import React from 'react'
import { Box, Text } from 'ink'
import { getConfig, maskApiKey } from '../config.js'
import { theme } from '../ui/theme.js'
import path from 'path'
import os from 'os'

const CONFIG_FILE = path.join(os.homedir(), '.please', 'config.json')

interface ConfigDisplayProps {
  onComplete?: () => void
}

/**
 * ConfigDisplay 组件 - 显示当前配置
 */
export const ConfigDisplay: React.FC<ConfigDisplayProps> = ({ onComplete }) => {
  const config = getConfig()

  React.useEffect(() => {
    if (onComplete) {
      setTimeout(onComplete, 100)
    }
  }, [onComplete])

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold>当前配置:</Text>
      <Text color={theme.text.secondary}>{'━'.repeat(40)}</Text>

      <Box>
        <Text color={theme.primary}>  apiKey:           </Text>
        <Text>{maskApiKey(config.apiKey)}</Text>
      </Box>

      <Box>
        <Text color={theme.primary}>  baseUrl:          </Text>
        <Text>{config.baseUrl}</Text>
      </Box>

      <Box>
        <Text color={theme.primary}>  model:            </Text>
        <Text>{config.model}</Text>
      </Box>

      <Box>
        <Text color={theme.primary}>  shellHook:        </Text>
        {config.shellHook ? (
          <Text color={theme.success}>已启用</Text>
        ) : (
          <Text color={theme.text.secondary}>未启用</Text>
        )}
      </Box>

      <Box>
        <Text color={theme.primary}>  chatHistoryLimit: </Text>
        <Text>{config.chatHistoryLimit} 轮</Text>
      </Box>

      <Text color={theme.text.secondary}>{'━'.repeat(40)}</Text>
      <Text color={theme.text.secondary}>配置文件: {CONFIG_FILE}</Text>
    </Box>
  )
}
