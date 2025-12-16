#!/usr/bin/env tsx
import React from 'react'
import { render } from 'ink'
import { Command } from 'commander'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { exec } from 'child_process'
import fs from 'fs'
import os from 'os'
import chalk from 'chalk'
import { MultiStepCommandGenerator } from '../src/components/MultiStepCommandGenerator.js'
import { Chat } from '../src/components/Chat.js'
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
import packageJson from '../package.json'

// 保留这些用于其他可能的用途
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const program = new Command()


// 启动时异步检查更新（不阻塞主流程）
let updateCheckResult: { hasUpdate: boolean; latestVersion: string | null } | null = null
const isUpgradeCommand = process.argv.includes('upgrade')
const isVersionCommand = process.argv.includes('-v') || process.argv.includes('--version')

// 非 upgrade 命令时才检查更新
if (!isUpgradeCommand) {
  checkForUpdates(packageJson.version).then((result) => {
    updateCheckResult = result
  }).catch(() => {
    // 静默失败
  })
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

    // 计算命令框宽度，让分隔线长度一致
    const lines = command.split('\n')
    const maxContentWidth = Math.max(...lines.map(l => console2.getDisplayWidth(l)))
    const boxWidth = Math.max(maxContentWidth + 4, console2.getDisplayWidth('生成命令') + 6, 20)
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
  .action((key, value) => {
    try {
      setConfigValue(key, value)
      console.log('')
      console2.success(`已设置 ${key}`)
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
  .action(async () => {
    const { themes } = await import('../src/ui/theme.js')
    const config = getConfig()
    const currentTheme = config.theme || 'dark'

    console.log('')
    console2.title('🎨 可用主题:')
    console2.muted('━'.repeat(50))

    Object.keys(themes).forEach((themeName) => {
      const isCurrent = themeName === currentTheme
      const prefix = isCurrent ? '●' : '○'
      const label = themeName === 'dark' ? 'dark (深色)' : 'light (浅色)'
      const color = themeName === 'dark' ? '#00D9FF' : '#0284C7'

      if (isCurrent) {
        console.log(`  ${chalk.hex(color)(prefix)} ${chalk.hex(color).bold(label)} ${chalk.gray('(当前)')}`)
      } else {
        console.log(`  ${chalk.gray(prefix)} ${label}`)
      }
    })

    console2.muted('━'.repeat(50))
    console.log('')
  })

themeCmd
  .argument('[name]', '主题名称 (dark, light)')
  .description('切换主题')
  .action((name?: string) => {
    if (!name) {
      // 显示当前主题
      const config = getConfig()
      const currentTheme = config.theme || 'dark'
      const label = currentTheme === 'dark' ? 'dark (深色)' : 'light (浅色)'
      const color = currentTheme === 'dark' ? '#00D9FF' : '#0284C7'

      console.log('')
      console.log(`当前主题: ${chalk.hex(color).bold(label)}`)
      console.log('')
      console2.muted('使用 pls theme list 查看所有主题')
      console2.muted('使用 pls theme <name> 切换主题')
      console.log('')
      return
    }

    // 切换主题
    try {
      setConfigValue('theme', name)
      const label = name === 'dark' ? 'dark (深色)' : 'light (浅色)'
      const color = name === 'dark' ? '#00D9FF' : '#0284C7'

      console.log('')
      console2.success(`已切换到 ${chalk.hex(color).bold(label)} 主题`)
      console.log('')
    } catch (error: any) {
      console.log('')
      console2.error(error.message)
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

// chat 子命令
const chatCmd = program.command('chat').description('AI 对话模式，问答、讲解命令')

chatCmd
  .command('clear')
  .description('清空对话历史')
  .action(() => {
    clearChatHistory()
    console.log('')
    console2.success('对话历史已清空')
    console.log('')
  })

// 默认 chat 命令（进行对话）
chatCmd
  .argument('[prompt...]', '你的问题')
  .option('-d, --debug', '显示调试信息')
  .action((promptArgs, options) => {
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
      console2.info('  pls chat <问题>    与 AI 对话')
      console2.info('  pls chat clear     清空对话历史')
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

    // 使用 Ink 渲染对话（Chat 适合用 Ink 流式输出）
    render(
      <Chat
        prompt={prompt}
        debug={options.debug}
        showRoundCount={true}
        onComplete={() => process.exit(0)}
      />
    )
  })

// 默认命令（执行 prompt）
program
  .argument('[prompt...]', '自然语言描述你想执行的操作')
  .option('-d, --debug', '显示调试信息（系统信息、完整 prompt 等）')
  .action((promptArgs, options) => {
    if (promptArgs.length === 0) {
      program.help()
      return
    }

    const prompt = promptArgs.join(' ')

    if (!prompt.trim()) {
      console.log('')
      console2.error('请提供你想执行的操作描述')
      console2.muted('示例: pls 安装 git')
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

    // 使用多步骤命令生成器（统一处理单步和多步）
    ;(async () => {
      const executedSteps: ExecutedStep[] = []
      let currentStepNumber = 1
      let lastStepFailed = false // 跟踪上一步是否失败

      while (true) {
        let stepResult: any = null

        // 使用 Ink 渲染命令生成
        const { waitUntilExit, unmount } = render(
          <MultiStepCommandGenerator
            prompt={prompt}
            debug={options.debug}
            previousSteps={executedSteps}
            currentStepNumber={currentStepNumber}
            onStepComplete={(res) => {
              stepResult = res
              unmount()
            }}
          />
        )

        await waitUntilExit()
        await new Promise((resolve) => setTimeout(resolve, 10))

        // 处理步骤结果
        if (!stepResult || stepResult.cancelled) {
          console.log('')
          console2.muted('已取消执行')
          console.log('')
          process.exit(0)
        }

        if (stepResult.hasBuiltin) {
          addHistory({
            userPrompt: currentStepNumber === 1 ? prompt : `[步骤${currentStepNumber}] ${prompt}`,
            command: stepResult.command,
            aiGeneratedCommand: stepResult.aiGeneratedCommand,  // AI 原始命令
            userModified: stepResult.userModified || false,
            executed: false,
            exitCode: null,
            output: '',
            reason: 'builtin',
          })
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

          // 执行命令
          const execStart = Date.now()
          const { exitCode, output, stdout, stderr } = await executeCommand(stepResult.command)
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

          // 记录到 pls 历史
          addHistory({
            userPrompt:
              currentStepNumber === 1 ? prompt : `[步骤${currentStepNumber}] ${stepResult.reasoning || prompt}`,
            command: stepResult.command,
            aiGeneratedCommand: stepResult.aiGeneratedCommand,  // AI 原始命令
            userModified: stepResult.userModified || false,
            executed: true,
            exitCode,
            output,
          })

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

// 自定义帮助信息
program.addHelpText(
  'after',
  `
${chalk.bold('示例:')}
  ${chalk.hex(getThemeColors().primary)('pls 安装 git')}                    让 AI 生成安装 git 的命令
  ${chalk.hex(getThemeColors().primary)('pls 查找大于 100MB 的文件')}        查找大文件
  ${chalk.hex(getThemeColors().primary)('pls 删除刚才创建的文件')}          AI 会参考历史记录
  ${chalk.hex(getThemeColors().primary)('pls --debug 压缩 logs 目录')}      显示调试信息
  ${chalk.hex(getThemeColors().primary)('pls -m 删除当前目录的空文件夹')}    多步骤模式（AI 自动规划）
  ${chalk.hex(getThemeColors().primary)('pls chat tar 命令怎么用')}         AI 对话模式
  ${chalk.hex(getThemeColors().primary)('pls chat clear')}                 清空对话历史
  ${chalk.hex(getThemeColors().primary)('pls history')}                    查看 pls 命令历史
  ${chalk.hex(getThemeColors().primary)('pls history clear')}              清空历史记录
  ${chalk.hex(getThemeColors().primary)('pls hook')}                       查看 shell hook 状态
  ${chalk.hex(getThemeColors().primary)('pls hook install')}               安装 shell hook（增强功能）
  ${chalk.hex(getThemeColors().primary)('pls hook uninstall')}             卸载 shell hook
  ${chalk.hex(getThemeColors().primary)('pls upgrade')}                    升级到最新版本
  ${chalk.hex(getThemeColors().primary)('pls config')}                     交互式配置
  ${chalk.hex(getThemeColors().primary)('pls config list')}                查看当前配置
`
)

program.parse()
