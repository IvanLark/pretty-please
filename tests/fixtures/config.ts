/**
 * 配置文件测试数据
 */

// 完整的有效配置
export const validConfig = {
  apiKey: 'sk-1234567890abcdef',
  provider: 'openai',
  model: 'gpt-4',
  baseUrl: 'https://api.openai.com/v1',
  shellHook: true,
  editMode: 'manual',
  commandHistoryLimit: 50,
  chatHistoryLimit: 20,
  shellHistoryLimit: 10,
  systemCacheExpireDays: 7,
  theme: 'dark',
}

// 最小配置（只有 apiKey）
export const minimalConfig = {
  apiKey: 'sk-test123456',
}

// 缺少 apiKey 的配置
export const configWithoutApiKey = {
  provider: 'openai',
  model: 'gpt-4',
  shellHook: true,
}

// 损坏的 JSON
export const corruptedConfigJson = '{invalid json content'

// 空配置文件
export const emptyConfig = '{}'

// DeepSeek 配置示例
export const deepseekConfig = {
  apiKey: 'sk-deepseek-test',
  provider: 'deepseek',
  model: 'deepseek-chat',
  baseUrl: 'https://api.deepseek.com/v1',
  shellHook: true,
}

// 旧版本配置（缺少新字段）
export const legacyConfig = {
  apiKey: 'sk-legacy-key',
  model: 'gpt-3.5-turbo',
  shellHook: false,
}

// 包含额外字段的配置（向前兼容）
export const configWithExtraFields = {
  ...validConfig,
  unknownField: 'should be preserved',
  futureFeature: true,
}
