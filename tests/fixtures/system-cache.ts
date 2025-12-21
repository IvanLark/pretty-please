/**
 * 系统信息缓存测试数据
 */

// 有效的系统信息缓存
export const validSystemCache = {
  version: '1.0',
  cachedAt: '2024-01-01T00:00:00Z',
  expiresInDays: 7,
  os: 'darwin',
  arch: 'arm64',
  shell: 'zsh',
  shellDisplayName: 'Zsh',
  user: 'testuser',
  packageManager: 'brew',
  availableCommands: ['git', 'npm', 'pnpm', 'docker', 'eza', 'rg', 'fd', 'jq'],
}

// 过期的缓存（创建于 10 天前）
export const expiredSystemCache = {
  version: '1.0',
  cachedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  expiresInDays: 7,
  os: 'darwin',
  arch: 'arm64',
  shell: 'zsh',
  user: 'testuser',
}

// 未过期的缓存（创建于 3 天前）
export const freshSystemCache = {
  version: '1.0',
  cachedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  expiresInDays: 7,
  os: 'darwin',
  arch: 'arm64',
  shell: 'zsh',
  user: 'testuser',
  packageManager: 'brew',
  availableCommands: ['git', 'npm', 'docker'],
}

// Windows 系统缓存
export const windowsSystemCache = {
  version: '1.0',
  cachedAt: '2024-01-01T00:00:00Z',
  expiresInDays: 7,
  os: 'win32',
  arch: 'x64',
  shell: 'powershell7',
  shellDisplayName: 'PowerShell 7+',
  user: 'testuser',
  packageManager: 'winget',
  availableCommands: ['git', 'npm', 'docker'],
}

// Linux 系统缓存
export const linuxSystemCache = {
  version: '1.0',
  cachedAt: '2024-01-01T00:00:00Z',
  expiresInDays: 7,
  os: 'linux',
  arch: 'x64',
  shell: 'bash',
  shellDisplayName: 'Bash',
  user: 'testuser',
  packageManager: 'apt',
  availableCommands: ['git', 'npm', 'docker', 'apt-get'],
}

// 损坏的缓存 JSON
export const corruptedSystemCacheJson = '{invalid json'

// 缺少必需字段的缓存
export const incompleteSystemCache = {
  version: '1.0',
  cachedAt: '2024-01-01T00:00:00Z',
  // 缺少其他字段
}
