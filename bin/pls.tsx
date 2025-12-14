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
import { CommandGenerator } from '../src/components/CommandGenerator.js'
import { MultiStepCommandGenerator } from '../src/components/MultiStepCommandGenerator.js'
import { Chat } from '../src/components/Chat.js'
import { isConfigValid, setConfigValue, getConfig, maskApiKey } from '../src/config.js'
import { clearHistory, addHistory, getHistory, getHistoryFilePath } from '../src/history.js'
import { clearChatHistory, getChatRoundCount, getChatHistoryFilePath } from '../src/chat-history.js'
import { type ExecutedStep } from '../src/multi-step.js'
import {
  installShellHook,
  uninstallShellHook,
  getHookStatus,
  detectShell,
  getShellConfigPath,
} from '../src/shell-hook.js'
import * as console2 from '../src/utils/console.js'

// 获取 package.json 版本
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageJson = JSON.parse(fs.readFileSync(join(__dirname, '../package.json'), 'utf-8'))

const program = new Command()

/**
 * 执行命令（原生版本）
 */
function executeCommand(command: string, prompt: string): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve) => {
    let output = ''
    let hasOutput = false

    console.log('') // 空行
    console2.printSeparator('输出')

    const child = exec(command)

    child.stdout?.on('data', (data) => {
      output += data
      hasOutput = true
      process.stdout.write(data)
    })

    child.stderr?.on('data', (data) => {
      output += data
      hasOutput = true
      process.stderr.write(data)
    })

    child.on('close', (code) => {
      if (hasOutput) {
        console2.printSeparator('')
      }
      resolve({ exitCode: code || 0, output })
    })

    child.on('error', (err) => {
      if (!hasOutput) {
        console2.printSeparator('')
      }
      console2.error(err.message)
      console2.printSeparator('')
      resolve({ exitCode: 1, output: err.message })
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
  .description('查看当前配置')
  .action(() => {
    const config = getConfig()
    const CONFIG_FILE = join(os.homedir(), '.please', 'config.json')

    console.log('')
    console2.title('当前配置:')
    console2.muted('━'.repeat(40))
    console.log(`  ${chalk.hex('#00D9FF')('apiKey')}:           ${maskApiKey(config.apiKey)}`)
    console.log(`  ${chalk.hex('#00D9FF')('baseUrl')}:          ${config.baseUrl}`)
    console.log(`  ${chalk.hex('#00D9FF')('provider')}:         ${config.provider}`)
    console.log(`  ${chalk.hex('#00D9FF')('model')}:            ${config.model}`)
    console.log(
      `  ${chalk.hex('#00D9FF')('shellHook')}:        ${
        config.shellHook ? chalk.hex('#10B981')('已启用') : chalk.gray('未启用')
      }`
    )
    console.log(`  ${chalk.hex('#00D9FF')('chatHistoryLimit')}: ${config.chatHistoryLimit} 轮`)
    console2.muted('━'.repeat(40))
    console2.muted(`配置文件: ${CONFIG_FILE}`)
    console.log('')
  })

configCmd
  .command('show')
  .description('查看当前配置')
  .action(() => {
    const listAction = configCmd.commands.find((c) => c.name() === 'list')
    if (listAction) {
      ;(listAction as any)._actionHandler()
    }
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
  console.log('')
  console2.warning('交互式配置向导暂未实现，请使用:')
  console2.info('  pls config list     - 查看配置')
  console2.info('  pls config set <key> <value> - 设置配置')
  console.log('')
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
          ? chalk.hex('#10B981')('✓')
          : chalk.hex('#EF4444')(`✗ 退出码:${item.exitCode}`)
        : chalk.gray('(未执行)')

      console.log(`\n${chalk.gray(`${index + 1}.`)} ${chalk.hex('#00D9FF')(item.userPrompt)}`)
      console.log(`   ${chalk.dim('→')} ${item.command} ${status}`)
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

// 默认 history 命令（显示历史）
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
        ? chalk.hex('#10B981')('✓')
        : chalk.hex('#EF4444')(`✗ 退出码:${item.exitCode}`)
      : chalk.gray('(未执行)')

    console.log(`\n${chalk.gray(`${index + 1}.`)} ${chalk.hex('#00D9FF')(item.userPrompt)}`)
    console.log(`   ${chalk.dim('→')} ${item.command} ${status}`)
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
    console.log(`  ${chalk.hex('#00D9FF')('Shell 类型')}: ${status.shellType}`)
    console.log(`  ${chalk.hex('#00D9FF')('配置文件')}:   ${status.configPath || '未知'}`)
    console.log(
      `  ${chalk.hex('#00D9FF')('已安装')}:     ${
        status.installed ? chalk.hex('#10B981')('是') : chalk.gray('否')
      }`
    )
    console.log(
      `  ${chalk.hex('#00D9FF')('已启用')}:     ${
        status.enabled ? chalk.hex('#10B981')('是') : chalk.gray('否')
      }`
    )
    console.log(`  ${chalk.hex('#00D9FF')('历史文件')}:   ${status.historyFile}`)
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
  console.log(`  ${chalk.hex('#00D9FF')('Shell 类型')}: ${status.shellType}`)
  console.log(`  ${chalk.hex('#00D9FF')('配置文件')}:   ${status.configPath || '未知'}`)
  console.log(
    `  ${chalk.hex('#00D9FF')('已安装')}:     ${
      status.installed ? chalk.hex('#10B981')('是') : chalk.gray('否')
    }`
  )
  console.log(
    `  ${chalk.hex('#00D9FF')('已启用')}:     ${
      status.enabled ? chalk.hex('#10B981')('是') : chalk.gray('否')
    }`
  )
  console.log(`  ${chalk.hex('#00D9FF')('历史文件')}:   ${status.historyFile}`)
  console2.muted('━'.repeat(40))

  if (!status.installed) {
    console.log('')
    console2.muted('提示: 运行 pls hook install 安装 shell hook')
  }
  console.log('')
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
      console.log(`  ${chalk.hex('#00D9FF')('当前对话轮数')}: ${roundCount}`)
      console.log(`  ${chalk.hex('#00D9FF')('历史文件')}:     ${historyFile}`)
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
      console2.muted('请运行 pls config 进行配置')
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
      console2.muted('请运行 pls config 进行配置')
      console.log('')
      process.exit(1)
    }

    // 使用多步骤命令生成器（统一处理单步和多步）
    ;(async () => {
      const executedSteps: ExecutedStep[] = []
      let currentStepNumber = 1

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
            executed: false,
            exitCode: null,
            output: '',
            reason: 'builtin',
          })
          process.exit(0)
        }

        if (stepResult.confirmed) {
          // 执行命令
          const execStart = Date.now()
          const { exitCode, output } = await executeCommand(stepResult.command, prompt)
          const execDuration = Date.now() - execStart

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
            executed: true,
            exitCode,
            output,
          })

          // 显示结果
          console.log('')
          if (exitCode === 0) {
            if (currentStepNumber === 1 && stepResult.needsContinue !== true) {
              // 单步命令
              console2.success(`执行完成 ${console2.formatDuration(execDuration)}`)
            } else {
              // 多步命令
              console2.success(`步骤 ${currentStepNumber} 执行完成 ${console2.formatDuration(execDuration)}`)
            }
          } else {
            // 执行失败，但不立即退出，让 AI 分析错误并调整策略
            console2.error(
              `步骤 ${currentStepNumber} 执行失败，退出码: ${exitCode} ${console2.formatDuration(execDuration)}`
            )
            console.log('')
            console2.warning('正在请 AI 分析错误并调整策略...')
            // 不退出，继续循环，AI 会收到错误信息
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
        }
      }
    })()
  })

// 自定义帮助信息
program.addHelpText(
  'after',
  `
${chalk.bold('示例:')}
  ${chalk.hex('#00D9FF')('pls 安装 git')}                    让 AI 生成安装 git 的命令
  ${chalk.hex('#00D9FF')('pls 查找大于 100MB 的文件')}        查找大文件
  ${chalk.hex('#00D9FF')('pls 删除刚才创建的文件')}          AI 会参考历史记录
  ${chalk.hex('#00D9FF')('pls --debug 压缩 logs 目录')}      显示调试信息
  ${chalk.hex('#00D9FF')('pls -m 删除当前目录的空文件夹')}    多步骤模式（AI 自动规划）
  ${chalk.hex('#00D9FF')('pls chat tar 命令怎么用')}         AI 对话模式
  ${chalk.hex('#00D9FF')('pls chat clear')}                 清空对话历史
  ${chalk.hex('#00D9FF')('pls history')}                    查看 pls 命令历史
  ${chalk.hex('#00D9FF')('pls history clear')}              清空历史记录
  ${chalk.hex('#00D9FF')('pls hook')}                       查看 shell hook 状态
  ${chalk.hex('#00D9FF')('pls hook install')}               安装 shell hook（增强功能）
  ${chalk.hex('#00D9FF')('pls hook uninstall')}             卸载 shell hook
  ${chalk.hex('#00D9FF')('pls config')}                     交互式配置
  ${chalk.hex('#00D9FF')('pls config list')}                查看当前配置
`
)

program.parse()
