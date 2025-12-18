#!/usr/bin/env tsx
import { Command } from 'commander'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import path from 'path'
import { exec } from 'child_process'
import fs from 'fs'
import os from 'os'
import chalk from 'chalk'
// React 和 Ink 懒加载（只在需要 UI 时加载）
// import React from 'react'
// import { render } from 'ink'
// import { MultiStepCommandGenerator } from '../src/components/MultiStepCommandGenerator.js'
// import { Chat } from '../src/components/Chat.js'
import { isConfigValid, setConfigValue, getConfig, maskApiKey } from '../src/config.js'
import { clearHistory, addHistory, getHistory, getHistoryFilePath } from '../src/history.js'
import { clearChatHistory, getChatRoundCount, getChatHistoryFilePath, displayChatHistory } from '../src/chat-history.js'
import { type ExecutedStep } from '../src/multi-step.js'
import {
  installShellHook,
  uninstallShellHook,
  getHookStatus,
  detectShell,
  getShellConfigPath,
  displayShellHistory,
  clearShellHistory,
} from '../src/shell-hook.js'
import {
  checkForUpdates,
  showUpdateNotice,
  performUpgrade,
} from '../src/upgrade.js'
import { getCurrentTheme } from '../src/ui/theme.js'
import {
  addAlias,
  removeAlias,
  displayAliases,
  resolveAlias,
} from '../src/alias.js'
import {
  addRemote,
  removeRemote,
  displayRemotes,
  getRemote,
  testRemoteConnection,
  sshExec,
  collectRemoteSysInfo,
  setRemoteWorkDir,
  getRemoteWorkDir,
  generateBatchRemoteCommands,
  executeBatchRemoteCommands,
} from '../src/remote.js'
import {
  addRemoteHistory,
  displayRemoteHistory,
  clearRemoteHistory,
  fetchRemoteShellHistory,
  displayRemoteShellHistory,
  clearRemoteShellHistory,
} from '../src/remote-history.js'
import {
  detectRemoteShell,
  getRemoteShellConfigPath,
  installRemoteShellHook,
  uninstallRemoteShellHook,
  getRemoteHookStatus,
} from '../src/shell-hook.js'

// 获取主题颜色的辅助函数
function getThemeColors() {
  const theme = getCurrentTheme()
  return {
    primary: theme.primary,
    success: theme.success,
    error: theme.error,
    warning: theme.warning,
    info: theme.info,
    muted: theme.text.muted,
    secondary: theme.text.secondary,
  }
}
import * as console2 from '../src/utils/console.js'
// 导入 package.json（Bun 会自动打包进二进制）
import packageJson from '../package.json' with { type: 'json' }

// 保留这些用于其他可能的用途
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const program = new Command()


// 启动时异步检查更新（不阻塞主流程）
let updateCheckResult: { hasUpdate: boolean; latestVersion: string | null } | null = null
const isUpgradeCommand = process.argv.includes('upgrade')

// 延迟更新检查到命令解析后（减少启动时间）
// 非 upgrade 命令时才检查更新
if (!isUpgradeCommand) {
  // 延迟 100ms 开始检查，避免影响简单命令的响应速度
  setTimeout(() => {
    checkForUpdates(packageJson.version)
      .then((result) => {
        updateCheckResult = result
      })
      .catch(() => {
        // 静默失败
      })
  }, 100)
}

// 程序退出时显示更新提示
process.on('beforeExit', () => {
  if (updateCheckResult?.hasUpdate && updateCheckResult.latestVersion && !isUpgradeCommand) {
    showUpdateNotice(packageJson.version, updateCheckResult.latestVersion)
  }
})

/**
 * 执行命令（原生版本）
 */
function executeCommand(command: string): Promise<{ exitCode: number; output: string; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let hasOutput = false

    console.log('') // 空行

    // 计算命令框宽度，让分隔线长度一致（限制终端宽度）
    const termWidth = process.stdout.columns || 80
    const maxContentWidth = termWidth - 6
    const lines = command.split('\n')
    const wrappedLines: string[] = []
    for (const line of lines) {
      wrappedLines.push(...console2.wrapText(line, maxContentWidth))
    }
    const actualMaxWidth = Math.max(
      ...wrappedLines.map((l) => console2.getDisplayWidth(l)),
      console2.getDisplayWidth('生成命令')
    )
    const boxWidth = Math.max(console2.MIN_COMMAND_BOX_WIDTH, Math.min(actualMaxWidth + 4, termWidth - 2))
    console2.printSeparator('输出', boxWidth)

    // 使用 bash 并启用 pipefail，确保管道中任何命令失败都能正确返回非零退出码
    const child = exec(`set -o pipefail; ${command}`, { shell: '/bin/bash' })

    child.stdout?.on('data', (data) => {
      stdout += data
      hasOutput = true
      process.stdout.write(data)
    })

    child.stderr?.on('data', (data) => {
      stderr += data
      hasOutput = true
      process.stderr.write(data)
    })

    child.on('close', (code) => {
      if (hasOutput) {
        console2.printSeparator('', boxWidth)
      }
      resolve({ exitCode: code || 0, output: stdout + stderr, stdout, stderr })
    })

    child.on('error', (err) => {
      if (!hasOutput) {
        console2.printSeparator('', boxWidth)
      }
      console2.error(err.message)
      console2.printSeparator('', boxWidth)
      resolve({ exitCode: 1, output: err.message, stdout: '', stderr: err.message })
    })
  })
}

// 设置程序
program
  .name('pls')
  .description('AI 驱动的命令行工具，将自然语言转换为可执行的 Shell 命令')
  .version(packageJson.version, '-v, --version', '显示版本号')
  .helpOption('-h, --help', '显示帮助信息')
  .allowUnknownOption(true)  // 允许未知选项（用于别名参数传递）

// config 子命令
const configCmd = program.command('config').description('管理配置')

configCmd
  .command('list')
  .alias('show')
  .description('查看当前配置')
  .action(() => {
    const config = getConfig()
    const CONFIG_FILE = join(os.homedir(), '.please', 'config.json')

    console.log('')
    console2.title('当前配置:')
    console2.muted('━'.repeat(50))
    console.log(`  ${chalk.hex(getThemeColors().primary)('apiKey')}:              ${maskApiKey(config.apiKey)}`)
    console.log(`  ${chalk.hex(getThemeColors().primary)('baseUrl')}:             ${config.baseUrl}`)
    console.log(`  ${chalk.hex(getThemeColors().primary)('provider')}:            ${config.provider}`)
    console.log(`  ${chalk.hex(getThemeColors().primary)('model')}:               ${config.model}`)
    console.log(
      `  ${chalk.hex(getThemeColors().primary)('shellHook')}:           ${
        config.shellHook ? chalk.hex(getThemeColors().success)('已启用') : chalk.gray('未启用')
      }`
    )
    console.log(
      `  ${chalk.hex(getThemeColors().primary)('editMode')}:            ${
        config.editMode === 'auto' ? chalk.hex(getThemeColors().primary)('auto (自动编辑)') : chalk.gray('manual (按E编辑)')
      }`
    )
    console.log(`  ${chalk.hex(getThemeColors().primary)('chatHistoryLimit')}:    ${config.chatHistoryLimit} 轮`)
    console.log(`  ${chalk.hex(getThemeColors().primary)('commandHistoryLimit')}: ${config.commandHistoryLimit} 条`)
    console.log(`  ${chalk.hex(getThemeColors().primary)('shellHistoryLimit')}:   ${config.shellHistoryLimit} 条`)
    console.log(
      `  ${chalk.hex(getThemeColors().primary)('theme')}:               ${
        config.theme === 'dark' ? chalk.hex(getThemeColors().primary)('dark (深色)') : chalk.hex(getThemeColors().primary)('light (浅色)')
      }`
    )
    console2.muted('━'.repeat(50))
    console2.muted(`配置文件: ${CONFIG_FILE}`)
    console.log('')
  })

configCmd
  .command('set <key> <value>')
  .description('设置配置项 (apiKey, baseUrl, provider, model, shellHook, chatHistoryLimit)')
  .action(async (key, value) => {
    try {
      const oldConfig = getConfig()
      const oldShellHistoryLimit = oldConfig.shellHistoryLimit

      setConfigValue(key, value)
      console.log('')
      console2.success(`已设置 ${key}`)

      // 如果修改了 shellHistoryLimit，自动重装 hook
      if (key === 'shellHistoryLimit') {
        const { reinstallHookForLimitChange } = await import('../src/shell-hook.js')
        await reinstallHookForLimitChange(oldShellHistoryLimit, Number(value))
      }

      console.log('')
    } catch (error: any) {
      console.log('')
      console2.error(error.message)
      console.log('')
      process.exit(1)
    }
  })

// 默认 config 命令（交互式配置）
configCmd.action(async () => {
  const { runConfigWizard } = await import('../src/config.js')
  await runConfigWizard()
})

// theme 子命令
const themeCmd = program.command('theme').description('管理主题')

themeCmd
  .command('list')
  .description('查看所有可用主题')
  .option('--custom', '只显示自定义主题')
  .option('--builtin', '只显示内置主题')
  .action(async (options: { custom?: boolean; builtin?: boolean }) => {
    const { getAllThemeMetadata, isBuiltinTheme } = await import('../src/ui/theme.js')
    const config = getConfig()
    const currentTheme = config.theme || 'dark'

    console.log('')
    console2.title('🎨 可用主题:')
    console2.muted('━'.repeat(50))

    // 动态获取所有主题元数据
    const allThemes = getAllThemeMetadata()

    // 根据选项过滤主题
    const builtinThemes = allThemes.filter((meta) => isBuiltinTheme(meta.name))
    const customThemes = allThemes.filter((meta) => !isBuiltinTheme(meta.name))

    // 显示内置主题
    if (!options.custom) {
      if (builtinThemes.length > 0) {
        console.log('')
        console2.info('内置主题:')
        builtinThemes.forEach((meta) => {
          const isCurrent = meta.name === currentTheme
          const prefix = isCurrent ? '●' : '○'
          const label = `${meta.name} (${meta.displayName})`

          if (isCurrent) {
            console.log(`  ${chalk.hex(meta.previewColor)(prefix)} ${chalk.hex(meta.previewColor).bold(label)} ${chalk.gray('(当前)')}`)
          } else {
            console.log(`  ${chalk.gray(prefix)} ${label}`)
          }
        })
      }
    }

    // 显示自定义主题
    if (!options.builtin) {
      if (customThemes.length > 0) {
        console.log('')
        console2.info('自定义主题:')
        customThemes.forEach((meta) => {
          const isCurrent = meta.name === currentTheme
          const prefix = isCurrent ? '●' : '○'
          const label = `${meta.name} (${meta.displayName})`
          const emoji = ' ✨'

          if (isCurrent) {
            console.log(`  ${chalk.hex(meta.previewColor)(prefix)} ${chalk.hex(meta.previewColor).bold(label)}${emoji} ${chalk.gray('(当前)')}`)
          } else {
            console.log(`  ${chalk.gray(prefix)} ${label}${emoji}`)
          }
        })
      } else if (options.custom) {
        console.log('')
        console2.muted('  还没有自定义主题')
        console2.muted('  使用 pls theme create <name> 创建')
      }
    }

    console.log('')
    console2.muted('━'.repeat(50))
    console.log('')
  })

themeCmd
  .argument('[name]', '主题名称')
  .description('切换主题')
  .action(async (name?: string) => {
    const { getThemeMetadata, getAllThemeMetadata, isValidTheme } = await import('../src/ui/theme.js')

    if (!name) {
      // 显示当前主题
      const config = getConfig()
      const currentTheme = config.theme || 'dark'
      const meta = getThemeMetadata(currentTheme as any)

      if (meta) {
        console.log('')
        console.log(`当前主题: ${chalk.hex(meta.previewColor).bold(`${meta.name} (${meta.displayName})`)}`)
        if (meta.description) {
          console2.muted(`  ${meta.description}`)
        }
        console.log('')
      }

      console2.muted('使用 pls theme list 查看所有主题')
      console2.muted('使用 pls theme <name> 切换主题')
      console.log('')
      return
    }

    // 切换主题
    try {
      // 验证主题是否存在
      if (!isValidTheme(name)) {
        const allThemes = getAllThemeMetadata()
        const themeNames = allThemes.map((m) => m.name).join(', ')
        throw new Error(`未知主题 "${name}"，可用主题: ${themeNames}`)
      }

      setConfigValue('theme', name)
      const meta = getThemeMetadata(name)

      if (meta) {
        console.log('')
        console2.success(`已切换到 ${chalk.hex(meta.previewColor).bold(`${meta.name} (${meta.displayName})`)} 主题`)
        if (meta.description) {
          console2.muted(`  ${meta.description}`)
        }
        console.log('')
      }
    } catch (error: any) {
      console.log('')
      console2.error(error.message)
      console.log('')
      process.exit(1)
    }
  })

// theme create - 创建主题模板
themeCmd
  .command('create <name>')
  .description('创建自定义主题模板')
  .option('-d, --display-name <name>', '显示名称')
  .option('-c, --category <type>', '主题类别 (dark 或 light)', 'dark')
  .action(async (name: string, options: { displayName?: string; category?: string }) => {
    const { createThemeTemplate } = await import('../src/ui/theme.js')

    try {
      // 验证主题名称格式
      if (!/^[a-z0-9-]+$/.test(name)) {
        throw new Error('主题名称只能包含小写字母、数字和连字符')
      }

      // 验证类别
      const category = options.category as 'dark' | 'light'
      if (category !== 'dark' && category !== 'light') {
        throw new Error('主题类别必须是 dark 或 light')
      }

      // 创建主题目录
      const themesDir = path.join(os.homedir(), '.please', 'themes')
      if (!fs.existsSync(themesDir)) {
        fs.mkdirSync(themesDir, { recursive: true })
      }

      // 检查主题文件是否已存在
      const themePath = path.join(themesDir, `${name}.json`)
      if (fs.existsSync(themePath)) {
        throw new Error(`主题 "${name}" 已存在`)
      }

      // 创建主题模板
      const displayName = options.displayName || name
      const template = createThemeTemplate(name, displayName, category)

      // 保存到文件
      fs.writeFileSync(themePath, JSON.stringify(template, null, 2), 'utf-8')

      // 显示成功信息
      console.log('')
      console2.success(`已创建主题模板: ${themePath}`)
      console.log('')

      console2.info('📝 下一步:')
      console.log(`  1. 编辑主题文件修改颜色配置`)
      console2.muted(`     vim ${themePath}`)
      console.log('')
      console.log(`  2. 验证主题格式`)
      console2.muted(`     pls theme validate ${themePath}`)
      console.log('')
      console.log(`  3. 应用主题查看效果`)
      console2.muted(`     pls theme ${name}`)
      console.log('')

      console2.info('💡 提示:')
      console2.muted('  - 使用在线工具选择颜色: https://colorhunt.co')
      console2.muted('  - 参考内置主题: pls theme list')
      console.log('')
    } catch (error: any) {
      console.log('')
      console2.error(error.message)
      console.log('')
      process.exit(1)
    }
  })

// theme validate - 验证主题文件
themeCmd
  .command('validate <file>')
  .description('验证主题文件格式')
  .action(async (file: string) => {
    const { validateThemeWithDetails } = await import('../src/ui/theme.js')

    try {
      // 读取主题文件
      const themePath = path.isAbsolute(file) ? file : path.join(process.cwd(), file)

      if (!fs.existsSync(themePath)) {
        throw new Error(`文件不存在: ${themePath}`)
      }

      const content = fs.readFileSync(themePath, 'utf-8')
      const theme = JSON.parse(content)

      // 验证主题
      const result = validateThemeWithDetails(theme)

      console.log('')

      if (result.valid) {
        console2.success('✓ 主题验证通过')
        console.log('')

        if (theme.metadata) {
          console2.info('主题信息:')
          console.log(`  名称: ${theme.metadata.name} (${theme.metadata.displayName})`)
          console.log(`  类别: ${theme.metadata.category}`)
          if (theme.metadata.description) {
            console.log(`  描述: ${theme.metadata.description}`)
          }
          if (theme.metadata.author) {
            console.log(`  作者: ${theme.metadata.author}`)
          }
        }

        console.log('')
      } else {
        console2.error('✗ 主题验证失败')
        console.log('')
        console2.info('错误列表:')
        result.errors.forEach((err, idx) => {
          console.log(`  ${idx + 1}. ${err}`)
        })
        console.log('')

        console2.info('修复建议:')
        console2.muted(`  1. 编辑主题文件: vim ${themePath}`)
        console2.muted('  2. 参考内置主题格式')
        console2.muted('  3. 确保所有颜色使用 #RRGGBB 格式')
        console.log('')

        process.exit(1)
      }
    } catch (error: any) {
      console.log('')
      if (error.message.includes('Unexpected token')) {
        console2.error('JSON 格式错误，请检查文件语法')
      } else {
        console2.error(error.message)
      }
      console.log('')
      process.exit(1)
    }
  })

// history 子命令
const historyCmd = program.command('history').description('查看或管理命令历史')

historyCmd
  .command('show')
  .description('显示历史记录')
  .action(() => {
    const history = getHistory()

    if (history.length === 0) {
      console.log('')
      console2.muted('暂无历史记录')
      console.log('')
      return
    }

    console.log('')
    console2.title('📜 命令历史:')
    console2.muted('━'.repeat(50))

    history.forEach((item: any, index: number) => {
      const status = item.executed
        ? item.exitCode === 0
          ? chalk.hex(getThemeColors().success)('✓')
          : chalk.hex(getThemeColors().error)(`✗ 退出码:${item.exitCode}`)
        : chalk.gray('(未执行)')

      console.log(`\n${chalk.gray(`${index + 1}.`)} ${chalk.hex(getThemeColors().primary)(item.userPrompt)}`)

      // 显示用户修改信息
      if (item.userModified && item.aiGeneratedCommand) {
        console.log(`   ${chalk.dim('AI 生成:')} ${chalk.gray(item.aiGeneratedCommand)}`)
        console.log(`   ${chalk.dim('用户修改为:')} ${item.command} ${status} ${chalk.hex(getThemeColors().warning)('(已修改)')}`)
      } else {
        console.log(`   ${chalk.dim('→')} ${item.command} ${status}`)
      }

      console.log(`   ${chalk.gray(item.timestamp)}`)
    })

    console.log('')
    console2.muted(`历史文件: ${getHistoryFilePath()}`)
    console.log('')
  })

historyCmd
  .command('clear')
  .description('清空历史记录')
  .action(() => {
    clearHistory()
    console.log('')
    console2.success('历史记录已清空')
    console.log('')
  })

// history chat 子命令
const historyChatCmd = historyCmd.command('chat').description('查看或管理对话历史')

historyChatCmd.action(() => {
  displayChatHistory()
})

historyChatCmd
  .command('clear')
  .description('清空对话历史')
  .action(() => {
    clearChatHistory()
    console.log('')
    console2.success('对话历史已清空')
    console.log('')
  })

// history shell 子命令
const historyShellCmd = historyCmd.command('shell').description('查看或管理 Shell 历史')

historyShellCmd.action(() => {
  displayShellHistory()
})

historyShellCmd
  .command('clear')
  .description('清空 Shell 历史')
  .action(() => {
    clearShellHistory()
  })

// 默认 history 命令（显示命令历史）
historyCmd.action(() => {
  const history = getHistory()

  if (history.length === 0) {
    console.log('')
    console2.muted('暂无历史记录')
    console.log('')
    return
  }

  console.log('')
  console2.title('📜 命令历史:')
  console2.muted('━'.repeat(50))

  history.forEach((item: any, index: number) => {
    const status = item.executed
      ? item.exitCode === 0
        ? chalk.hex(getThemeColors().success)('✓')
        : chalk.hex(getThemeColors().error)(`✗ 退出码:${item.exitCode}`)
      : chalk.gray('(未执行)')

    console.log(`\n${chalk.gray(`${index + 1}.`)} ${chalk.hex(getThemeColors().primary)(item.userPrompt)}`)

    // 显示用户修改信息
    if (item.userModified && item.aiGeneratedCommand) {
      console.log(`   ${chalk.dim('AI 生成:')} ${chalk.gray(item.aiGeneratedCommand)}`)
      console.log(`   ${chalk.dim('用户修改为:')} ${item.command} ${status} ${chalk.hex(getThemeColors().warning)('(已修改)')}`)
    } else {
      console.log(`   ${chalk.dim('→')} ${item.command} ${status}`)
    }

    console.log(`   ${chalk.gray(item.timestamp)}`)
  })

  console.log('')
  console2.muted(`历史文件: ${getHistoryFilePath()}`)
  console.log('')
})

// hook 子命令
const hookCmd = program.command('hook').description('管理 shell hook（增强功能：记录终端命令历史）')

hookCmd
  .command('install')
  .description('安装 shell hook')
  .action(async () => {
    const shellType = detectShell()
    const configPath = getShellConfigPath(shellType)

    console.log('')
    console2.title('🔧 Shell Hook 安装向导')
    console2.muted('━'.repeat(40))
    console2.muted(`检测到 Shell: ${shellType}`)
    console2.muted(`配置文件: ${configPath || '未知'}`)
    console.log('')

    if (shellType === 'unknown') {
      console2.error('不支持的 shell 类型')
      console2.muted('支持的 shell: zsh, bash, powershell')
      console.log('')
      return
    }

    console2.warning('此功能会在你的 shell 配置文件中添加 hook，')
    console2.warning('用于记录你在终端执行的每条命令，让 AI 更智能。')
    console.log('')

    const result = await installShellHook()
    if (result) {
      console2.success(`Shell hook 已安装`)
      console2.warning(`⚠️  请重启终端或执行: source ${configPath}`)
    }
    console.log('')
  })

hookCmd
  .command('uninstall')
  .description('卸载 shell hook')
  .action(() => {
    console.log('')
    uninstallShellHook()
    console2.success('Shell hook 已卸载')
    console2.warning('⚠️  请重启终端使其生效')
    console.log('')
  })

hookCmd
  .command('status')
  .description('查看 shell hook 状态')
  .action(() => {
    const status = getHookStatus()

    console.log('')
    console2.title('📊 Shell Hook 状态')
    console2.muted('━'.repeat(40))
    console.log(`  ${chalk.hex(getThemeColors().primary)('Shell 类型')}: ${status.shellType}`)
    console.log(`  ${chalk.hex(getThemeColors().primary)('配置文件')}:   ${status.configPath || '未知'}`)
    console.log(
      `  ${chalk.hex(getThemeColors().primary)('已安装')}:     ${
        status.installed ? chalk.hex(getThemeColors().success)('是') : chalk.gray('否')
      }`
    )
    console.log(
      `  ${chalk.hex(getThemeColors().primary)('已启用')}:     ${
        status.enabled ? chalk.hex(getThemeColors().success)('是') : chalk.gray('否')
      }`
    )
    console.log(`  ${chalk.hex(getThemeColors().primary)('历史文件')}:   ${status.historyFile}`)
    console2.muted('━'.repeat(40))

    if (!status.installed) {
      console.log('')
      console2.muted('提示: 运行 pls hook install 安装 shell hook')
    }
    console.log('')
  })

// 默认 hook 命令（显示状态）
hookCmd.action(() => {
  const status = getHookStatus()

  console.log('')
  console2.title('📊 Shell Hook 状态')
  console2.muted('━'.repeat(40))
  console.log(`  ${chalk.hex(getThemeColors().primary)('Shell 类型')}: ${status.shellType}`)
  console.log(`  ${chalk.hex(getThemeColors().primary)('配置文件')}:   ${status.configPath || '未知'}`)
  console.log(
    `  ${chalk.hex(getThemeColors().primary)('已安装')}:     ${
      status.installed ? chalk.hex(getThemeColors().success)('是') : chalk.gray('否')
    }`
  )
  console.log(
    `  ${chalk.hex(getThemeColors().primary)('已启用')}:     ${
      status.enabled ? chalk.hex(getThemeColors().success)('是') : chalk.gray('否')
    }`
  )
  console.log(`  ${chalk.hex(getThemeColors().primary)('历史文件')}:   ${status.historyFile}`)
  console2.muted('━'.repeat(40))

  if (!status.installed) {
    console.log('')
    console2.muted('提示: 运行 pls hook install 安装 shell hook')
  }
  console.log('')
})

// upgrade 子命令
program
  .command('upgrade')
  .description('升级到最新版本')
  .action(async () => {
    const success = await performUpgrade(packageJson.version)
    process.exit(success ? 0 : 1)
  })

// alias 子命令
const aliasCmd = program.command('alias').description('管理命令别名')

// 获取所有子命令名称（用于检测冲突）
function getReservedCommands(): string[] {
  return program.commands.map((cmd) => cmd.name())
}

aliasCmd
  .command('list')
  .description('列出所有别名')
  .action(() => {
    displayAliases()
  })

aliasCmd
  .command('add <name> <prompt>')
  .description('添加别名（prompt 支持 {{param}} 或 {{param:default}} 参数模板）')
  .option('-d, --description <desc>', '别名描述')
  .action((name, prompt, options) => {
    try {
      addAlias(name, prompt, options.description, getReservedCommands())
      console.log('')
      console2.success(`已添加别名: ${name}`)
      console.log(`  ${chalk.gray('→')} ${prompt}`)
      console.log('')
    } catch (error: any) {
      console.log('')
      console2.error(error.message)
      console.log('')
      process.exit(1)
    }
  })

aliasCmd
  .command('remove <name>')
  .description('删除别名')
  .action((name) => {
    const removed = removeAlias(name)
    console.log('')
    if (removed) {
      console2.success(`已删除别名: ${name}`)
    } else {
      console2.error(`别名不存在: ${name}`)
    }
    console.log('')
  })

// 默认 alias 命令（显示列表）
aliasCmd.action(() => {
  displayAliases()
})

// remote 子命令
const remoteCmd = program.command('remote').description('管理远程服务器')

remoteCmd
  .command('list')
  .description('列出所有远程服务器')
  .action(() => {
    displayRemotes()
  })

remoteCmd
  .command('add <name> <host>')
  .description('添加远程服务器（格式: user@host 或 user@host:port）')
  .option('-k, --key <path>', 'SSH 私钥路径')
  .option('-p, --password', '使用密码认证（每次执行时输入）')
  .action((name, host, options) => {
    try {
      addRemote(name, host, { key: options.key, password: options.password })
      console.log('')
      console2.success(`已添加远程服务器: ${name}`)
      console.log(`  ${chalk.gray('→')} ${host}`)
      if (options.key) {
        console.log(`  ${chalk.gray('密钥:')} ${options.key}`)
      }
      if (options.password) {
        console.log(`  ${chalk.gray('认证:')} 密码（每次执行时输入）`)
      }
      console.log('')
    } catch (error: any) {
      console.log('')
      console2.error(error.message)
      console.log('')
      process.exit(1)
    }
  })

remoteCmd
  .command('remove <name>')
  .description('删除远程服务器')
  .action((name) => {
    const removed = removeRemote(name)
    console.log('')
    if (removed) {
      console2.success(`已删除远程服务器: ${name}`)
    } else {
      console2.error(`远程服务器不存在: ${name}`)
    }
    console.log('')
  })

remoteCmd
  .command('test <name>')
  .description('测试远程服务器连接')
  .action(async (name) => {
    const remote = getRemote(name)
    if (!remote) {
      console.log('')
      console2.error(`远程服务器不存在: ${name}`)
      console.log('')
      process.exit(1)
    }

    console.log('')
    console2.info(`正在测试连接 ${name} (${remote.user}@${remote.host}:${remote.port})...`)

    const result = await testRemoteConnection(name)
    console.log(`  ${result.message}`)

    if (result.success) {
      // 采集系统信息
      console2.info('正在采集系统信息...')
      try {
        const sysInfo = await collectRemoteSysInfo(name, true)
        console.log(`  ${chalk.gray('系统:')} ${sysInfo.os} ${sysInfo.osVersion}`)
        console.log(`  ${chalk.gray('Shell:')} ${sysInfo.shell}`)
        console.log(`  ${chalk.gray('主机名:')} ${sysInfo.hostname}`)
      } catch (error: any) {
        console2.warning(`无法采集系统信息: ${error.message}`)
      }
    }
    console.log('')
  })

// remote hook 子命令
const remoteHookCmd = remoteCmd.command('hook').description('管理远程服务器 Shell Hook')

remoteHookCmd
  .command('install <name>')
  .description('在远程服务器安装 Shell Hook')
  .action(async (name) => {
    const remote = getRemote(name)
    if (!remote) {
      console.log('')
      console2.error(`远程服务器不存在: ${name}`)
      console.log('')
      process.exit(1)
    }

    console.log('')
    console2.title('🔧 远程 Shell Hook 安装')
    console2.muted('━'.repeat(40))
    console2.info(`目标服务器: ${name} (${remote.user}@${remote.host})`)

    try {
      // 检测远程 shell 类型
      const sshExecFn = async (cmd: string) => {
        const result = await sshExec(name, cmd, { timeout: 30000 })
        return { stdout: result.stdout, exitCode: result.exitCode }
      }

      const shellType = await detectRemoteShell(sshExecFn)
      const configPath = getRemoteShellConfigPath(shellType)
      console2.muted(`检测到 Shell: ${shellType}`)
      console2.muted(`配置文件: ${configPath}`)
      console.log('')

      const result = await installRemoteShellHook(sshExecFn, shellType)
      console.log(`  ${result.message}`)

      if (result.success) {
        console.log('')
        console2.warning('⚠️  请在远程服务器重启终端或执行:')
        console2.info(`   source ${configPath}`)
      }
    } catch (error: any) {
      console2.error(`安装失败: ${error.message}`)
    }
    console.log('')
  })

remoteHookCmd
  .command('uninstall <name>')
  .description('从远程服务器卸载 Shell Hook')
  .action(async (name) => {
    const remote = getRemote(name)
    if (!remote) {
      console.log('')
      console2.error(`远程服务器不存在: ${name}`)
      console.log('')
      process.exit(1)
    }

    console.log('')
    console2.info(`正在从 ${name} 卸载 Shell Hook...`)

    try {
      const sshExecFn = async (cmd: string) => {
        const result = await sshExec(name, cmd, { timeout: 30000 })
        return { stdout: result.stdout, exitCode: result.exitCode }
      }

      const shellType = await detectRemoteShell(sshExecFn)
      const result = await uninstallRemoteShellHook(sshExecFn, shellType)
      console.log(`  ${result.message}`)

      if (result.success) {
        console.log('')
        console2.warning('⚠️  请在远程服务器重启终端使其生效')
      }
    } catch (error: any) {
      console2.error(`卸载失败: ${error.message}`)
    }
    console.log('')
  })

remoteHookCmd
  .command('status <name>')
  .description('查看远程服务器 Shell Hook 状态')
  .action(async (name) => {
    const remote = getRemote(name)
    if (!remote) {
      console.log('')
      console2.error(`远程服务器不存在: ${name}`)
      console.log('')
      process.exit(1)
    }

    console.log('')
    console2.info(`正在检查 ${name} 的 Hook 状态...`)

    try {
      const sshExecFn = async (cmd: string) => {
        const result = await sshExec(name, cmd, { timeout: 30000 })
        return { stdout: result.stdout, exitCode: result.exitCode }
      }

      const status = await getRemoteHookStatus(sshExecFn)

      console.log('')
      console2.title(`📊 远程 Shell Hook 状态 - ${name}`)
      console2.muted('━'.repeat(40))
      console.log(`  ${chalk.hex(getThemeColors().primary)('Shell 类型')}: ${status.shellType}`)
      console.log(`  ${chalk.hex(getThemeColors().primary)('配置文件')}:   ${status.configPath}`)
      console.log(
        `  ${chalk.hex(getThemeColors().primary)('已安装')}:     ${
          status.installed ? chalk.hex(getThemeColors().success)('是') : chalk.gray('否')
        }`
      )
      console2.muted('━'.repeat(40))

      if (!status.installed) {
        console.log('')
        console2.muted(`提示: 运行 pls remote hook install ${name} 安装 Shell Hook`)
      }
    } catch (error: any) {
      console2.error(`检查失败: ${error.message}`)
    }
    console.log('')
  })

// remote history 子命令
const remoteHistoryCmd = remoteCmd.command('history').description('管理远程服务器历史记录')

remoteHistoryCmd
  .command('show <name>')
  .description('显示远程服务器命令历史')
  .action((name) => {
    displayRemoteHistory(name)
  })

remoteHistoryCmd
  .command('clear <name>')
  .description('清空远程服务器命令历史')
  .action((name) => {
    clearRemoteHistory(name)
    console.log('')
    console2.success(`已清空服务器 "${name}" 的命令历史`)
    console.log('')
  })

remoteHistoryCmd
  .command('shell <name>')
  .description('显示远程服务器 Shell 历史')
  .action(async (name) => {
    await displayRemoteShellHistory(name)
  })

remoteHistoryCmd
  .command('shell-clear <name>')
  .description('清空远程服务器 Shell 历史')
  .action(async (name) => {
    await clearRemoteShellHistory(name)
  })

// remote default 子命令
remoteCmd
  .command('default [name]')
  .description('设置或查看默认远程服务器')
  .option('-c, --clear', '清除默认服务器设置')
  .action((name?: string, options?: { clear?: boolean }) => {
    const config = getConfig()

    // 清除默认
    if (options?.clear) {
      if (config.defaultRemote) {
        setConfigValue('defaultRemote', '')
        console.log('')
        console2.success('已清除默认远程服务器')
        console.log('')
      } else {
        console.log('')
        console2.muted('当前没有设置默认远程服务器')
        console.log('')
      }
      return
    }

    // 查看默认
    if (!name) {
      console.log('')
      if (config.defaultRemote) {
        const remote = getRemote(config.defaultRemote)
        if (remote) {
          console.log(`默认远程服务器: ${chalk.hex(getThemeColors().primary)(config.defaultRemote)}`)
          console.log(`  ${chalk.gray('→')} ${remote.user}@${remote.host}:${remote.port}`)
        } else {
          console2.warning(`默认服务器 "${config.defaultRemote}" 不存在，建议清除设置`)
          console2.muted('运行 pls remote default --clear 清除')
        }
      } else {
        console2.muted('当前没有设置默认远程服务器')
        console2.muted('使用 pls remote default <name> 设置默认服务器')
      }
      console.log('')
      return
    }

    // 设置默认
    const remote = getRemote(name)
    if (!remote) {
      console.log('')
      console2.error(`远程服务器不存在: ${name}`)
      console2.muted('使用 pls remote list 查看所有服务器')
      console.log('')
      process.exit(1)
    }

    setConfigValue('defaultRemote', name)
    console.log('')
    console2.success(`已设置默认远程服务器: ${name}`)
    console.log(`  ${chalk.gray('→')} ${remote.user}@${remote.host}:${remote.port}`)
    console2.muted('现在可以使用 pls -r <prompt> 直接在该服务器执行')
    console.log('')
  })

// remote workdir 子命令
remoteCmd
  .command('workdir <name> [path]')
  .description('设置或查看远程服务器的工作目录')
  .option('-c, --clear', '清除工作目录设置')
  .action((name: string, workdirPath?: string, options?: { clear?: boolean }) => {
    const remote = getRemote(name)
    if (!remote) {
      console.log('')
      console2.error(`远程服务器不存在: ${name}`)
      console.log('')
      process.exit(1)
    }

    // 清除工作目录
    if (options?.clear) {
      if (remote.workDir) {
        setRemoteWorkDir(name, '-')
        console.log('')
        console2.success(`已清除 ${name} 的工作目录设置`)
        console.log('')
      } else {
        console.log('')
        console2.muted(`${name} 没有设置工作目录`)
        console.log('')
      }
      return
    }

    // 查看工作目录
    if (!workdirPath) {
      console.log('')
      if (remote.workDir) {
        console.log(`${chalk.hex(getThemeColors().primary)(name)} 的工作目录:`)
        console.log(`  ${chalk.gray('→')} ${remote.workDir}`)
      } else {
        console2.muted(`${name} 没有设置工作目录`)
        console2.muted(`使用 pls remote workdir ${name} <path> 设置工作目录`)
      }
      console.log('')
      return
    }

    // 设置工作目录
    setRemoteWorkDir(name, workdirPath)
    console.log('')
    console2.success(`已设置 ${name} 的工作目录: ${workdirPath}`)
    console2.muted('现在在该服务器执行的命令会自动切换到此目录')
    console.log('')
  })

// 默认 remote 命令（显示列表）
remoteCmd.action(() => {
  displayRemotes()
})

// chat 命令（AI 对话）
program
  .command('chat')
  .description('AI 对话模式，问答、讲解命令')
  .argument('[prompt...]', '你的问题（不提供则显示状态）')
  .option('-d, --debug', '显示调试信息')
  .action((promptArgs, options) => {
    // Workaround: Commander.js 14.x 的子命令 option 解析有 bug
    // 直接从 process.argv 检查 --debug
    const debug = process.argv.includes('--debug') || process.argv.includes('-d')

    const prompt = promptArgs.join(' ')

    if (!prompt.trim()) {
      // 没有输入，显示对话状态
      const roundCount = getChatRoundCount()
      const historyFile = getChatHistoryFilePath()

      console.log('')
      console2.title('💬 AI 对话模式')
      console2.muted('━'.repeat(40))
      console.log(`  ${chalk.hex(getThemeColors().primary)('当前对话轮数')}: ${roundCount}`)
      console.log(`  ${chalk.hex(getThemeColors().primary)('历史文件')}:     ${historyFile}`)
      console2.muted('━'.repeat(40))
      console.log('')
      console2.muted('用法:')
      console2.info('  pls chat <问题>          与 AI 对话')
      console2.info('  pls history chat clear   清空对话历史')
      console.log('')
      return
    }

    // 检查配置
    if (!isConfigValid()) {
      console.log('')
      console2.warning('⚠️  检测到尚未配置 API Key')
      console2.info('请运行 pls config 启动交互式配置向导')
      console.log('')
      process.exit(1)
    }

    // 懒加载 Chat 组件（避免启动时加载 React/Ink）
    ;(async () => {
      const React = await import('react')
      const { render } = await import('ink')
      const { Chat } = await import('../src/components/Chat.js')

      render(
        React.createElement(Chat, {
          prompt,
          debug: debug,  // 使用 debug 变量
          showRoundCount: true,
          onComplete: () => process.exit(0),
        })
      )
    })()
  })

// 默认命令（执行 prompt）
program
  .argument('[prompt...]', '自然语言描述你想执行的操作')
  .option('-d, --debug', '显示调试信息（系统信息、完整 prompt 等）')
  .option('-r, --remote [name]', '在远程服务器上执行（不指定则使用默认服务器）')
  .action((promptArgs, options) => {
    // 智能处理 -r 参数：如果 -r 后面的值不是已注册的服务器名，把它当作 prompt 的一部分
    if (typeof options.remote === 'string' && !getRemote(options.remote)) {
      // "查看当前目录" 不是服务器名，放回 prompt
      promptArgs.unshift(options.remote)
      options.remote = true  // 改为使用默认服务器
    }

    if (promptArgs.length === 0) {
      program.help()
      return
    }

    let prompt = promptArgs.join(' ')

    if (!prompt.trim()) {
      console.log('')
      console2.error('请提供你想执行的操作描述')
      console2.muted('示例: pls 安装 git')
      console.log('')
      process.exit(1)
    }

    // 尝试解析别名（支持 pls disk 和 pls @disk 两种格式）
    try {
      const aliasResult = resolveAlias(prompt)
      if (aliasResult.resolved) {
        prompt = aliasResult.prompt
        if (options.debug) {
          console.log('')
          console2.muted(`别名解析: ${aliasResult.aliasName} → ${prompt}`)
        }
      }
    } catch (error: any) {
      console.log('')
      console2.error(error.message)
      console.log('')
      process.exit(1)
    }

    // 检查配置
    if (!isConfigValid()) {
      console.log('')
      console2.warning('⚠️  检测到尚未配置 API Key')
      console2.info('请运行 pls config 启动交互式配置向导')
      console.log('')
      process.exit(1)
    }

    // 解析远程服务器名称
    // options.remote 可能是：
    // - undefined: 没有使用 -r
    // - true: 使用了 -r 但没有指定名称（使用默认）
    // - string: 使用了 -r 并指定了名称（支持逗号分隔的多个服务器）
    let remoteName: string | undefined
    let remoteNames: string[] | undefined  // 批量执行时的服务器列表
    if (options.remote !== undefined) {
      if (options.remote === true) {
        // 使用默认服务器
        const config = getConfig()
        if (!config.defaultRemote) {
          console.log('')
          console2.error('未设置默认远程服务器')
          console2.muted('使用 pls remote default <name> 设置默认服务器')
          console2.muted('或使用 pls -r <name> <prompt> 指定服务器')
          console.log('')
          process.exit(1)
        }
        remoteName = config.defaultRemote
      } else {
        // 检查是否为批量执行（逗号分隔的服务器名）
        if (options.remote.includes(',')) {
          remoteNames = options.remote.split(',').map(s => s.trim()).filter(s => s.length > 0)

          // 验证所有服务器是否存在
          const invalidServers = remoteNames!.filter(name => !getRemote(name))
          if (invalidServers.length > 0) {
            console.log('')
            console2.error(`以下服务器不存在: ${invalidServers.join(', ')}`)
            console2.muted('使用 pls remote list 查看所有服务器')
            console2.muted('使用 pls remote add <name> <user@host> 添加服务器')
            console.log('')
            process.exit(1)
          }
        } else {
          remoteName = options.remote

          // 检查服务器是否存在
          const remote = getRemote(remoteName!)
          if (!remote) {
            console.log('')
            console2.error(`远程服务器不存在: ${remoteName}`)
            console2.muted('使用 pls remote add <name> <user@host> 添加服务器')
            console.log('')
            process.exit(1)
          }
        }
      }
    }

    // 懒加载 MultiStepCommandGenerator 组件（避免启动时加载 React/Ink）
    ;(async () => {
      // 批量远程执行模式
      if (remoteNames && remoteNames.length > 0) {
        console.log('')
        console2.info(`正在为 ${remoteNames.length} 台服务器生成命令...`)
        console.log('')

        try {
          // 1. 并发生成命令
          const commands = await generateBatchRemoteCommands(remoteNames, prompt, { debug: options.debug })

          // 2. 显示生成的命令
          console2.success('✓ 命令生成完成\n')
          const theme = getCurrentTheme()
          commands.forEach(({ server, command, sysInfo }) => {
            console.log(chalk.hex(theme.primary)(`${server}`) + chalk.gray(` (${sysInfo.os}):`))
            console.log(chalk.hex(theme.secondary)(`  ${command}`))
          })
          console.log('')

          // 3. 询问用户确认
          const readline = await import('readline')
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          })

          const confirmed = await new Promise<boolean>((resolve) => {
            console.log(chalk.gray(`将在 ${remoteNames!.length} 台服务器执行以上命令`))
            rl.question(chalk.gray('执行？ [回车执行 / Ctrl+C 取消] '), (answer) => {
              rl.close()
              resolve(true)
            })
          })

          if (!confirmed) {
            console.log('')
            console2.muted('已取消执行')
            console.log('')
            process.exit(0)
          }

          // 4. 并发执行
          console.log('')
          console2.info('正在执行...')
          const results = await executeBatchRemoteCommands(commands)

          // 5. 显示执行结果摘要
          console.log('')
          console2.info('执行完成:\n')
          results.forEach(({ server, exitCode }) => {
            const icon = exitCode === 0 ? '✓' : '✗'
            const color = exitCode === 0 ? theme.success : theme.error
            console.log(`  ${chalk.hex(color)(icon)} ${server} ${chalk.gray(`(退出码: ${exitCode})`)}`)
          })

          // 6. 显示每个服务器的详细输出
          console.log('')
          results.forEach(({ server, output }) => {
            console.log(chalk.hex(theme.primary)(`─── ${server} ───`))
            console.log(output || chalk.gray('(无输出)'))
          })

          // 7. 记录到历史
          results.forEach(({ server, command, exitCode, output }) => {
            addRemoteHistory(server, {
              userPrompt: prompt,
              command,
              aiGeneratedCommand: command,  // 批量执行无编辑功能
              userModified: false,
              executed: true,
              exitCode,
              output,
            })
          })

          // 8. 根据结果决定退出码
          const allSuccess = results.every(r => r.exitCode === 0)
          const allFailed = results.every(r => r.exitCode !== 0)
          if (allFailed) {
            process.exit(2)  // 全部失败
          } else if (!allSuccess) {
            process.exit(1)  // 部分失败
          }
          process.exit(0)  // 全部成功
        } catch (error: any) {
          console.log('')
          console2.error(`批量执行失败: ${error.message}`)
          console.log('')
          process.exit(1)
        }
        return
      }

      // 单服务器执行模式
      const React = await import('react')
      const { render } = await import('ink')
      const { MultiStepCommandGenerator } = await import('../src/components/MultiStepCommandGenerator.js')

      // 如果是远程模式，先获取远程上下文
      let remoteContext: {
        name: string
        sysInfo: Awaited<ReturnType<typeof collectRemoteSysInfo>>
        shellHistory: Awaited<ReturnType<typeof fetchRemoteShellHistory>>
      } | null = null

      if (remoteName) {
        console.log('')
        console2.info(`正在连接远程服务器 ${remoteName}...`)

        try {
          // 采集系统信息（使用缓存）
          const sysInfo = await collectRemoteSysInfo(remoteName)
          if (options.debug) {
            console2.muted(`系统: ${sysInfo.os} ${sysInfo.osVersion} (${sysInfo.shell})`)
          }

          // 获取远程 shell 历史
          const shellHistory = await fetchRemoteShellHistory(remoteName)
          if (options.debug && shellHistory.length > 0) {
            console2.muted(`Shell 历史: ${shellHistory.length} 条`)
          }

          remoteContext = { name: remoteName, sysInfo, shellHistory }
          console2.success(`已连接到 ${remoteName}`)
        } catch (error: any) {
          console2.error(`无法连接到 ${remoteName}: ${error.message}`)
          console.log('')
          process.exit(1)
        }
      }

      const executedSteps: ExecutedStep[] = []
      let currentStepNumber = 1
      let lastStepFailed = false // 跟踪上一步是否失败

      while (true) {
        let stepResult: any = null

        // 使用 Ink 渲染命令生成
        const { waitUntilExit, unmount } = render(
          React.createElement(MultiStepCommandGenerator, {
            prompt,
            debug: options.debug,
            previousSteps: executedSteps,
            currentStepNumber,
            remoteContext: remoteContext ? {
              name: remoteContext.name,
              sysInfo: remoteContext.sysInfo,
              shellHistory: remoteContext.shellHistory,
            } : undefined,
            isRemote: !!remoteName,  // 远程执行时不检测 builtin
            onStepComplete: (res: any) => {
              stepResult = res
              unmount()
            },
          })
        )

        await waitUntilExit()
        await new Promise((resolve) => setTimeout(resolve, 10))

        // 处理步骤结果
        if (!stepResult || stepResult.cancelled) {
          process.exit(0)
        }

        if (stepResult.hasBuiltin) {
          // 远程模式记录到远程历史
          if (remoteName) {
            addRemoteHistory(remoteName, {
              userPrompt: currentStepNumber === 1 ? prompt : `[步骤${currentStepNumber}] ${prompt}`,
              command: stepResult.command,
              aiGeneratedCommand: stepResult.aiGeneratedCommand,
              userModified: stepResult.userModified || false,
              executed: false,
              exitCode: null,
              output: '',
              reason: 'builtin',
            })
          } else {
            addHistory({
              userPrompt: currentStepNumber === 1 ? prompt : `[步骤${currentStepNumber}] ${prompt}`,
              command: stepResult.command,
              aiGeneratedCommand: stepResult.aiGeneratedCommand, // AI 原始命令
              userModified: stepResult.userModified || false,
              executed: false,
              exitCode: null,
              output: '',
              reason: 'builtin',
            })
          }
          process.exit(0)
        }

        if (stepResult.confirmed) {
          // 如果命令为空，说明 AI 决定放弃
          if (!stepResult.command || stepResult.command.trim() === '') {
            console.log('')
            if (stepResult.reasoning) {
              console2.info(`💡 AI 分析: ${stepResult.reasoning}`)
            }
            console2.muted('❌ AI 决定停止尝试，任务失败')
            console.log('')
            process.exit(1)
          }

          // 特殊处理：如果上一步失败，且 AI 决定放弃（continue: false），直接显示原因并退出
          if (
            lastStepFailed &&
            stepResult.needsContinue === false &&
            stepResult.command.startsWith('echo')
          ) {
            console.log('')
            if (stepResult.reasoning) {
              console2.info(`💡 AI 分析: ${stepResult.reasoning}`)
            }
            console2.muted('❌ AI 决定停止尝试，任务失败')
            console.log('')
            process.exit(1)
          }

          // 执行命令（本地或远程）
          const execStart = Date.now()
          let exitCode: number
          let output: string
          let stdout: string

          if (remoteName) {
            // 远程执行
            const result = await executeRemoteCommand(remoteName, stepResult.command)
            exitCode = result.exitCode
            output = result.output
            stdout = result.stdout
          } else {
            // 本地执行
            const result = await executeCommand(stepResult.command)
            exitCode = result.exitCode
            output = result.output
            stdout = result.stdout
          }
          const execDuration = Date.now() - execStart

          // 判断命令是否成功
          // 退出码 141 = 128 + 13 (SIGPIPE)，是管道正常关闭时的信号
          // 例如：ps aux | head -3，head 读完 3 行就关闭管道，ps 收到 SIGPIPE
          // 但如果退出码是 141 且没有 stdout 输出，说明可能是真正的错误
          const isSigpipeWithOutput = exitCode === 141 && stdout.trim().length > 0
          const isSuccess = exitCode === 0 || isSigpipeWithOutput

          // 保存到执行历史
          const executedStep: ExecutedStep = {
            command: stepResult.command,
            continue: stepResult.needsContinue || false,
            reasoning: stepResult.reasoning,
            nextStepHint: stepResult.nextStepHint,
            exitCode,
            output,
          }
          executedSteps.push(executedStep)

          // 记录到 pls 历史（远程模式记录到远程历史）
          if (remoteName) {
            addRemoteHistory(remoteName, {
              userPrompt:
                currentStepNumber === 1 ? prompt : `[步骤${currentStepNumber}] ${stepResult.reasoning || prompt}`,
              command: stepResult.command,
              aiGeneratedCommand: stepResult.aiGeneratedCommand,
              userModified: stepResult.userModified || false,
              executed: true,
              exitCode,
              output,
            })
          } else {
            addHistory({
              userPrompt:
                currentStepNumber === 1 ? prompt : `[步骤${currentStepNumber}] ${stepResult.reasoning || prompt}`,
              command: stepResult.command,
              aiGeneratedCommand: stepResult.aiGeneratedCommand, // AI 原始命令
              userModified: stepResult.userModified || false,
              executed: true,
              exitCode,
              output,
            })
          }

          // 显示结果
          console.log('')
          if (isSuccess) {
            if (currentStepNumber === 1 && stepResult.needsContinue !== true) {
              // 单步命令
              console2.success(`执行完成 ${console2.formatDuration(execDuration)}`)
            } else {
              // 多步命令
              console2.success(`步骤 ${currentStepNumber} 执行完成 ${console2.formatDuration(execDuration)}`)
            }
            lastStepFailed = false
          } else {
            // 执行失败，标记状态
            console2.error(
              `步骤 ${currentStepNumber} 执行失败，退出码: ${exitCode} ${console2.formatDuration(execDuration)}`
            )
            console.log('')
            console2.warning('正在请 AI 分析错误并调整策略...')
            lastStepFailed = true
            // 继续循环，让 AI 分析错误
            console.log('')
            currentStepNumber++
            continue
          }

          // 判断是否继续
          if (stepResult.needsContinue !== true) {
            if (currentStepNumber > 1) {
              console.log('')
              console2.success('✓ 所有步骤执行完成')
            }
            console.log('')
            process.exit(0)
          }

          console.log('')
          currentStepNumber++
        } else if (!stepResult.confirmed && !stepResult.cancelled) {
          // AI 返回了结果但没有确认（空命令的情况）
          if (lastStepFailed && stepResult.reasoning) {
            console.log('')
            console2.info(`💡 AI 分析: ${stepResult.reasoning}`)
            console2.muted('❌ AI 决定停止尝试，任务失败')
            console.log('')
            process.exit(1)
          }
          // 其他情况也退出
          console.log('')
          console2.muted('任务结束')
          console.log('')
          process.exit(0)
        }
      }
    })()
  })

/**
 * 执行远程命令
 * 如果设置了工作目录，自动添加 cd 前缀
 */
async function executeRemoteCommand(
  remoteName: string,
  command: string
): Promise<{ exitCode: number; output: string; stdout: string; stderr: string }> {
  let stdout = ''
  let stderr = ''

  // 如果有工作目录，自动添加 cd 前缀
  const workDir = getRemoteWorkDir(remoteName)
  const actualCommand = workDir ? `cd ${workDir} && ${command}` : command

  console.log('') // 空行

  // 计算命令框宽度，让分隔线长度一致（限制终端宽度）
  const termWidth = process.stdout.columns || 80
  const maxContentWidth = termWidth - 6
  const lines = command.split('\n')
  const wrappedLines: string[] = []
  for (const line of lines) {
    wrappedLines.push(...console2.wrapText(line, maxContentWidth))
  }
  const actualMaxWidth = Math.max(
    ...wrappedLines.map((l) => console2.getDisplayWidth(l)),
    console2.getDisplayWidth('生成命令')
  )
  const boxWidth = Math.max(console2.MIN_COMMAND_BOX_WIDTH, Math.min(actualMaxWidth + 4, termWidth - 2))
  console2.printSeparator(`远程输出 (${remoteName})`, boxWidth)

  try {
    const result = await sshExec(remoteName, actualCommand, {
      onStdout: (data) => {
        stdout += data
        process.stdout.write(data)
      },
      onStderr: (data) => {
        stderr += data
        process.stderr.write(data)
      },
    })

    if (stdout || stderr) {
      console2.printSeparator('', boxWidth)
    }

    return {
      exitCode: result.exitCode,
      output: stdout + stderr,
      stdout,
      stderr,
    }
  } catch (error: any) {
    console2.printSeparator('', boxWidth)
    console2.error(error.message)
    return {
      exitCode: 1,
      output: error.message,
      stdout: '',
      stderr: error.message,
    }
  }
}

// 自定义帮助信息
program.addHelpText(
  'after',
  `
${chalk.bold('示例:')}
  ${chalk.hex(getThemeColors().primary)('pls 安装 git')}                    让 AI 生成安装 git 的命令
  ${chalk.hex(getThemeColors().primary)('pls 查找大于 100MB 的文件')}        查找大文件
  ${chalk.hex(getThemeColors().primary)('pls 删除刚才创建的文件')}          AI 会参考历史记录
  ${chalk.hex(getThemeColors().primary)('pls --debug 压缩 logs 目录')}      显示调试信息
  ${chalk.hex(getThemeColors().primary)('pls chat tar 命令怎么用')}         AI 对话模式
  ${chalk.hex(getThemeColors().primary)('pls chat clear')}                 清空对话历史
  ${chalk.hex(getThemeColors().primary)('pls history')}                    查看 pls 命令历史
  ${chalk.hex(getThemeColors().primary)('pls history clear')}              清空历史记录
  ${chalk.hex(getThemeColors().primary)('pls alias')}                      查看命令别名
  ${chalk.hex(getThemeColors().primary)('pls alias add disk "查看磁盘"')}   添加别名
  ${chalk.hex(getThemeColors().primary)('pls disk')}                       使用别名（等同于 pls @disk）
  ${chalk.hex(getThemeColors().primary)('pls hook')}                       查看 shell hook 状态
  ${chalk.hex(getThemeColors().primary)('pls hook install')}               安装 shell hook（增强功能）
  ${chalk.hex(getThemeColors().primary)('pls hook uninstall')}             卸载 shell hook
  ${chalk.hex(getThemeColors().primary)('pls upgrade')}                    升级到最新版本
  ${chalk.hex(getThemeColors().primary)('pls config')}                     交互式配置
  ${chalk.hex(getThemeColors().primary)('pls config list')}                查看当前配置

${chalk.bold('远程执行:')}
  ${chalk.hex(getThemeColors().primary)('pls remote')}                     查看远程服务器列表
  ${chalk.hex(getThemeColors().primary)('pls remote add myserver root@1.2.3.4')}  添加服务器
  ${chalk.hex(getThemeColors().primary)('pls remote test myserver')}       测试连接
  ${chalk.hex(getThemeColors().primary)('pls -r myserver 查看磁盘')}       在远程服务器执行
  ${chalk.hex(getThemeColors().primary)('pls remote hook install myserver')}  安装远程 Shell Hook
`
)

program.parse()
