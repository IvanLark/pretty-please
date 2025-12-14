import React, { useState } from 'react'
import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'
import { getConfig, saveConfig, maskApiKey } from '../config.js'
import { theme } from '../ui/theme.js'
import path from 'path'
import os from 'os'

const CONFIG_FILE = path.join(os.homedir(), '.please', 'config.json')

interface ConfigWizardProps {
  onComplete: () => void
}

type Step = 'apiKey' | 'baseUrl' | 'model' | 'done'

/**
 * ConfigWizard 组件 - 交互式配置向导
 */
export const ConfigWizard: React.FC<ConfigWizardProps> = ({ onComplete }) => {
  const config = getConfig()
  const [step, setStep] = useState<Step>('apiKey')
  const [apiKey, setApiKey] = useState(config.apiKey)
  const [baseUrl, setBaseUrl] = useState(config.baseUrl)
  const [model, setModel] = useState(config.model)

  const handleApiKeySubmit = (value: string) => {
    if (value.trim()) {
      setApiKey(value.trim())
    }
    setStep('baseUrl')
  }

  const handleBaseUrlSubmit = (value: string) => {
    if (value.trim()) {
      setBaseUrl(value.trim())
    }
    setStep('model')
  }

  const handleModelSubmit = (value: string) => {
    if (value.trim()) {
      setModel(value.trim())
    }

    // 保存配置
    saveConfig({
      ...config,
      apiKey: apiKey || config.apiKey,
      baseUrl: baseUrl || config.baseUrl,
      model: model.trim() || config.model,
    })

    setStep('done')
    setTimeout(onComplete, 100)
  }

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold color={theme.accent}>
        🔧 Pretty Please 配置向导
      </Text>
      <Text color={theme.text.secondary}>{'━'.repeat(40)}</Text>

      {step === 'apiKey' && (
        <Box marginTop={1}>
          <Text color={theme.primary}>
            请输入 API Key{config.apiKey ? ` (当前: ${maskApiKey(config.apiKey)})` : ''}:{' '}
          </Text>
          <TextInput value="" onChange={() => {}} onSubmit={handleApiKeySubmit} />
        </Box>
      )}

      {step === 'baseUrl' && (
        <Box marginTop={1}>
          <Text color={theme.primary}>
            请输入 API Base URL (回车使用 {baseUrl}):{' '}
          </Text>
          <TextInput value="" onChange={() => {}} onSubmit={handleBaseUrlSubmit} />
        </Box>
      )}

      {step === 'model' && (
        <Box marginTop={1}>
          <Text color={theme.primary}>
            请输入模型名称 (回车使用 {model}):{' '}
          </Text>
          <TextInput value="" onChange={() => {}} onSubmit={handleModelSubmit} />
        </Box>
      )}

      {step === 'done' && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.text.secondary}>{'━'.repeat(40)}</Text>
          <Text color={theme.success}>✅ 配置已保存到 </Text>
          <Text color={theme.text.secondary}>{CONFIG_FILE}</Text>
        </Box>
      )}
    </Box>
  )
}
