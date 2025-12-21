/**
 * 命令历史记录测试数据
 */

// pls 命令历史记录
export const plsHistory = [
  {
    userPrompt: '安装 git',
    aiGeneratedCommand: 'brew install git',
    command: 'brew install git',
    userModified: false,
    executed: true,
    exitCode: 0,
    reason: null,
    timestamp: '2024-01-01T10:00:00Z',
  },
  {
    userPrompt: '查看当前目录',
    aiGeneratedCommand: 'ls -la',
    command: 'eza -la',  // 用户修改了命令
    userModified: true,
    executed: true,
    exitCode: 0,
    reason: null,
    timestamp: '2024-01-01T10:05:00Z',
  },
  {
    userPrompt: '删除所有文件',
    aiGeneratedCommand: 'rm -rf *',
    command: 'rm -rf *',
    userModified: false,
    executed: false,  // builtin 拒绝执行
    exitCode: null,
    reason: 'builtin',
    timestamp: '2024-01-01T10:10:00Z',
  },
  {
    userPrompt: '提交代码',
    aiGeneratedCommand: 'git add . && git commit -m "update"',
    command: 'git add . && git commit -m "feat: add new feature"',
    userModified: true,
    executed: true,
    exitCode: 0,
    reason: null,
    timestamp: '2024-01-01T10:15:00Z',
  },
]

// 聊天历史记录
export const chatHistory = [
  {
    role: 'user',
    content: '如何安装 Node.js？',
    timestamp: '2024-01-01T10:00:00Z',
  },
  {
    role: 'assistant',
    content: '你可以使用包管理器安装 Node.js。在 macOS 上使用 `brew install node`。',
    timestamp: '2024-01-01T10:00:05Z',
  },
  {
    role: 'user',
    content: '我想用 nvm',
    timestamp: '2024-01-01T10:00:10Z',
  },
  {
    role: 'assistant',
    content: '可以使用 nvm。首先安装 nvm：`brew install nvm`，然后使用 `nvm install node` 安装最新版本。',
    timestamp: '2024-01-01T10:00:15Z',
  },
]

// 远程命令历史
export const remoteHistory = {
  'server1': [
    {
      userPrompt: '查看磁盘使用',
      aiGeneratedCommand: 'df -h',
      command: 'df -h',
      userModified: false,
      executed: true,
      exitCode: 0,
      timestamp: '2024-01-01T10:00:00Z',
    },
    {
      userPrompt: '重启 nginx',
      aiGeneratedCommand: 'sudo systemctl restart nginx',
      command: 'sudo systemctl restart nginx',
      userModified: false,
      executed: true,
      exitCode: 0,
      timestamp: '2024-01-01T10:05:00Z',
    },
  ],
  'server2': [
    {
      userPrompt: '查看进程',
      aiGeneratedCommand: 'ps aux | grep node',
      command: 'ps aux | grep node',
      userModified: false,
      executed: true,
      exitCode: 0,
      timestamp: '2024-01-01T10:00:00Z',
    },
  ],
}

// 空历史
export const emptyHistory: any[] = []
