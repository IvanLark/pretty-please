#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

import {
  getConfig,
  setConfigValue,
  isConfigValid,
  displayConfig,
  runConfigWizard
} from '../src/config.js';
import { generateCommand } from '../src/ai.js';
import { chatWithAI } from '../src/ai.js';
import {
  addHistory,
  getHistory,
  clearHistory,
  getHistoryFilePath
} from '../src/history.js';
import {
  clearChatHistory,
  getChatRoundCount,
  getChatHistoryFilePath
} from '../src/chat-history.js';
import {
  installShellHook,
  uninstallShellHook,
  getHookStatus,
  detectShell
} from '../src/shell-hook.js';
import { detectBuiltin, formatBuiltins } from '../src/builtin-detector.js';

// 获取 package.json 版本
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(fs.readFileSync(join(__dirname, '../package.json'), 'utf-8'));

const program = new Command();

/**
 * 计算字符串的显示宽度（中文占2个宽度）
 */
function getDisplayWidth(str) {
  let width = 0;
  for (const char of str) {
    // 中文、日文、韩文等宽字符占 2 个宽度
    if (char.match(/[\u4e00-\u9fff\u3400-\u4dbf\uff00-\uffef\u3000-\u303f]/)) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

/**
 * 绘制命令框
 * @param {string} command - 要显示的命令
 * @param {string} title - 框框标题
 */
function drawCommandBox(command, title = '生成命令') {
  const lines = command.split('\n');
  const titleWidth = getDisplayWidth(title);
  const maxContentWidth = Math.max(...lines.map(l => getDisplayWidth(l)));
  const boxWidth = Math.max(maxContentWidth + 4, titleWidth + 6, 20);

  // 顶部边框：┌─ 生成命令 ─────┐
  const topPadding = boxWidth - titleWidth - 5;
  const topBorder = '┌─ ' + title + ' ' + '─'.repeat(topPadding) + '┐';

  // 底部边框
  const bottomBorder = '└' + '─'.repeat(boxWidth - 2) + '┘';

  console.log(chalk.yellow(topBorder));
  for (const line of lines) {
    const lineWidth = getDisplayWidth(line);
    const padding = ' '.repeat(boxWidth - lineWidth - 4);
    console.log(chalk.yellow('│ ') + chalk.cyan(line) + padding + chalk.yellow(' │'));
  }
  console.log(chalk.yellow(bottomBorder));
}

/**
 * 格式化耗时
 * @param {number} ms - 毫秒数
 */
function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * 询问用户确认（单键模式）
 * 回车 = 确认执行，Esc = 取消
 */
function askConfirmation(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);

    // 启用原始模式以捕获单个按键
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    const onKeyPress = (key) => {
      // 恢复正常模式
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      process.stdin.removeListener('data', onKeyPress);

      // 换行，让后续输出在新行显示
      process.stdout.write('\n');

      // 检测按键
      if (key[0] === 0x0d || key[0] === 0x0a) {
        // Enter 键 (回车)
        resolve(true);
      } else if (key[0] === 0x1b) {
        // Esc 键
        resolve(false);
      } else if (key[0] === 0x03) {
        // Ctrl+C
        process.exit(0);
      } else {
        // 其他键，忽略，继续等待
        process.stdout.write(prompt);
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(true);
        }
        process.stdin.resume();
        process.stdin.once('data', onKeyPress);
      }
    };

    process.stdin.once('data', onKeyPress);
  });
}

/**
 * 执行命令并返回结果
 */
function executeCommand(command) {
  return new Promise((resolve) => {
    let output = '';

    const child = exec(command, { shell: true });

    child.stdout?.on('data', (data) => {
      output += data;
      process.stdout.write(data);
    });

    child.stderr?.on('data', (data) => {
      output += data;
      process.stderr.write(data);
    });

    child.on('close', (code) => {
      resolve({ exitCode: code, output });
    });

    child.on('error', (err) => {
      resolve({ exitCode: 1, output: err.message });
    });
  });
}

/**
 * 执行命令（配合 spinner 使用）
 * 先停止 spinner，显示输出，执行完成后再更新 spinner 状态
 */
function executeCommandWithSpinner(command, spinner) {
  return new Promise((resolve) => {
    let output = '';

    // 停止 spinner 动画，但不改变状态
    spinner.stop();

    // 输出顶部分隔线
    console.log(chalk.gray('\n─── 输出 ' + '─'.repeat(30)));

    const child = exec(command, { shell: true });

    child.stdout?.on('data', (data) => {
      output += data;
      process.stdout.write(data);
    });

    child.stderr?.on('data', (data) => {
      output += data;
      process.stderr.write(data);
    });

    child.on('close', (code) => {
      // 输出底部分隔线
      console.log(chalk.gray('─'.repeat(38)));
      resolve({ exitCode: code, output });
    });

    child.on('error', (err) => {
      // 输出底部分隔线
      console.log(chalk.gray('─'.repeat(38)));
      resolve({ exitCode: 1, output: err.message });
    });
  });
}

/**
 * 显示调试信息
 */
function displayDebugInfo(debug) {
  console.log(chalk.magenta('\n━━━ 调试信息 ━━━'));
  console.log(chalk.gray('系统信息: ') + debug.sysinfo);
  console.log(chalk.gray('模型: ') + debug.model);
  console.log(chalk.gray('System Prompt:'));
  console.log(chalk.dim(debug.systemPrompt));
  console.log(chalk.gray('User Prompt: ') + debug.userPrompt);
  console.log(chalk.magenta('━'.repeat(16)));
}

/**
 * 主要的命令执行流程
 */
async function runPrompt(promptArgs, options = {}) {
  const prompt = promptArgs.join(' ');
  const debug = options.debug || false;

  if (!prompt.trim()) {
    console.log(chalk.red('请提供你想执行的操作描述'));
    console.log(chalk.gray('示例: pls 安装 git'));
    process.exit(1);
  }

  // 检查配置
  if (!isConfigValid()) {
    console.log(chalk.yellow('\n⚠️  检测到尚未配置 API Key'));
    console.log(chalk.gray('请运行 ') + chalk.cyan('pls config') + chalk.gray(' 进行配置\n'));
    process.exit(1);
  }

  try {
    // 思考中 spinner
    const thinkingSpinner = ora({
      text: '正在思考...',
      spinner: 'dots'
    }).start();

    const thinkStartTime = Date.now();
    const result = await generateCommand(prompt, { debug });
    const thinkDuration = Date.now() - thinkStartTime;

    // 根据是否调试模式，解构结果
    const command = debug ? result.command : result;

    thinkingSpinner.succeed(chalk.gray(`思考完成 (${formatDuration(thinkDuration)})`));

    // 调试模式下显示调试信息
    if (debug) {
      displayDebugInfo(result.debug);
    }

    // 显示生成的命令（框框样式）
    console.log('');
    drawCommandBox(command);

    // 检测是否包含 builtin 命令
    const { hasBuiltin, builtins } = detectBuiltin(command);

    if (hasBuiltin) {
      // 包含 builtin，不执行，只提示
      console.log(chalk.red('\n⚠️  此命令包含 shell 内置命令（' + formatBuiltins(builtins) + '），无法在子进程中生效'));
      console.log(chalk.yellow('💡 请手动复制到终端执行\n'));

      // 记录历史（标记为未执行，原因是 builtin）
      addHistory({
        userPrompt: prompt,
        command,
        executed: false,
        exitCode: null,
        output: '',
        reason: 'builtin'
      });

      return;
    }

    // 询问确认
    const confirmed = await askConfirmation(
      chalk.bold.yellow('执行？') + chalk.gray(' [回车执行 / Esc 取消] ')
    );

    if (confirmed) {
      // 执行中 spinner
      const execSpinner = ora({
        text: '执行中...',
        spinner: 'dots'
      }).start();

      const execStartTime = Date.now();
      const { exitCode, output } = await executeCommandWithSpinner(command, execSpinner);
      const execDuration = Date.now() - execStartTime;

      // 记录历史
      addHistory({
        userPrompt: prompt,
        command,
        executed: true,
        exitCode,
        output
      });

      if (exitCode === 0) {
        execSpinner.succeed(chalk.green(`执行完成 (${formatDuration(execDuration)})`));
      } else {
        execSpinner.fail(chalk.red(`执行失败，退出码: ${exitCode} (${formatDuration(execDuration)})`));
      }
    } else {
      // 记录未执行的历史
      addHistory({
        userPrompt: prompt,
        command,
        executed: false,
        exitCode: null,
        output: ''
      });

      console.log(chalk.gray('\n已取消执行\n'));
    }
  } catch (error) {
    console.error(chalk.red('\n❌ 错误: ') + error.message);
    process.exit(1);
  }
}

// 设置程序
program
  .name('pls')
  .description('AI 驱动的命令行工具，将自然语言转换为可执行的 Shell 命令')
  .version(packageJson.version, '-v, --version', '显示版本号')
  .helpOption('-h, --help', '显示帮助信息');

// config 子命令
const configCmd = program
  .command('config')
  .description('管理配置');

configCmd
  .command('get')
  .description('查看当前配置')
  .action(() => {
    displayConfig();
  });

configCmd
  .command('set <key> <value>')
  .description('设置配置项 (apiKey, baseUrl, model)')
  .action((key, value) => {
    try {
      setConfigValue(key, value);
      console.log(chalk.green(`✅ 已设置 ${key}`));
    } catch (error) {
      console.error(chalk.red(`❌ ${error.message}`));
      process.exit(1);
    }
  });

// 默认 config 命令（交互式配置）
configCmd
  .action(async () => {
    await runConfigWizard();
  });

// history 子命令
const historyCmd = program
  .command('history')
  .description('查看或管理命令历史');

historyCmd
  .command('show')
  .description('显示历史记录')
  .action(() => {
    const history = getHistory();
    if (history.length === 0) {
      console.log(chalk.gray('\n暂无历史记录\n'));
      return;
    }

    console.log(chalk.bold('\n📜 命令历史:'));
    console.log(chalk.gray('━'.repeat(50)));

    history.forEach((item, index) => {
      const status = item.executed
        ? (item.exitCode === 0 ? chalk.green('✓') : chalk.red(`✗ 退出码:${item.exitCode}`))
        : chalk.gray('(未执行)');

      console.log(`${chalk.gray(`${index + 1}.`)} ${chalk.cyan(item.userPrompt)}`);
      console.log(`   ${chalk.dim('→')} ${item.command} ${status}`);
      console.log(`   ${chalk.gray(item.timestamp)}`);
      console.log();
    });

    console.log(chalk.gray(`历史文件: ${getHistoryFilePath()}\n`));
  });

historyCmd
  .command('clear')
  .description('清空历史记录')
  .action(() => {
    clearHistory();
    console.log(chalk.green('✅ 历史记录已清空'));
  });

// 默认 history 命令（显示历史）
historyCmd
  .action(() => {
    const history = getHistory();
    if (history.length === 0) {
      console.log(chalk.gray('\n暂无历史记录\n'));
      return;
    }

    console.log(chalk.bold('\n📜 命令历史:'));
    console.log(chalk.gray('━'.repeat(50)));

    history.forEach((item, index) => {
      const status = item.executed
        ? (item.exitCode === 0 ? chalk.green('✓') : chalk.red(`✗ 退出码:${item.exitCode}`))
        : chalk.gray('(未执行)');

      console.log(`${chalk.gray(`${index + 1}.`)} ${chalk.cyan(item.userPrompt)}`);
      console.log(`   ${chalk.dim('→')} ${item.command} ${status}`);
      console.log(`   ${chalk.gray(item.timestamp)}`);
      console.log();
    });

    console.log(chalk.gray(`历史文件: ${getHistoryFilePath()}\n`));
  });

// hook 子命令 - 安装/卸载 shell hook
const hookCmd = program
  .command('hook')
  .description('管理 shell hook（增强功能：记录终端命令历史）');

hookCmd
  .command('install')
  .description('安装 shell hook')
  .action(async () => {
    const status = getHookStatus();
    console.log(chalk.bold('\n🔧 Shell Hook 安装向导'));
    console.log(chalk.gray('━'.repeat(40)));
    console.log(chalk.gray(`检测到 Shell: ${status.shellType}`));
    console.log(chalk.gray(`配置文件: ${status.configPath || '未知'}`));
    console.log();

    if (status.shellType === 'unknown') {
      console.log(chalk.red('❌ 不支持的 shell 类型'));
      console.log(chalk.gray('支持的 shell: zsh, bash, powershell'));
      return;
    }

    console.log(chalk.yellow('此功能会在你的 shell 配置文件中添加 hook，'));
    console.log(chalk.yellow('用于记录你在终端执行的每条命令，让 AI 更智能。'));
    console.log();

    await installShellHook();
  });

hookCmd
  .command('uninstall')
  .description('卸载 shell hook')
  .action(() => {
    uninstallShellHook();
  });

hookCmd
  .command('status')
  .description('查看 shell hook 状态')
  .action(() => {
    const status = getHookStatus();
    console.log(chalk.bold('\n📊 Shell Hook 状态'));
    console.log(chalk.gray('━'.repeat(40)));
    console.log(`  ${chalk.cyan('Shell 类型')}: ${status.shellType}`);
    console.log(`  ${chalk.cyan('配置文件')}:   ${status.configPath || '未知'}`);
    console.log(`  ${chalk.cyan('已安装')}:     ${status.installed ? chalk.green('是') : chalk.gray('否')}`);
    console.log(`  ${chalk.cyan('已启用')}:     ${status.enabled ? chalk.green('是') : chalk.gray('否')}`);
    console.log(`  ${chalk.cyan('历史文件')}:   ${status.historyFile}`);
    console.log(chalk.gray('━'.repeat(40)));

    if (!status.installed) {
      console.log(chalk.gray('\n提示: 运行 ') + chalk.cyan('pls hook install') + chalk.gray(' 安装 shell hook'));
    }
    console.log();
  });

// 默认 hook 命令（显示状态）
hookCmd
  .action(() => {
    const status = getHookStatus();
    console.log(chalk.bold('\n📊 Shell Hook 状态'));
    console.log(chalk.gray('━'.repeat(40)));
    console.log(`  ${chalk.cyan('Shell 类型')}: ${status.shellType}`);
    console.log(`  ${chalk.cyan('配置文件')}:   ${status.configPath || '未知'}`);
    console.log(`  ${chalk.cyan('已安装')}:     ${status.installed ? chalk.green('是') : chalk.gray('否')}`);
    console.log(`  ${chalk.cyan('已启用')}:     ${status.enabled ? chalk.green('是') : chalk.gray('否')}`);
    console.log(chalk.gray('━'.repeat(40)));

    if (!status.installed) {
      console.log(chalk.gray('\n提示: 运行 ') + chalk.cyan('pls hook install') + chalk.gray(' 安装 shell hook'));
      console.log(chalk.gray('      运行 ') + chalk.cyan('pls hook uninstall') + chalk.gray(' 卸载 shell hook'));
    }
    console.log();
  });

// chat 子命令 - AI 对话模式
const chatCmd = program
  .command('chat')
  .description('AI 对话模式，问答、讲解命令');

chatCmd
  .command('clear')
  .description('清空对话历史')
  .action(() => {
    clearChatHistory();
    console.log(chalk.green('✅ 对话历史已清空'));
  });

// 默认 chat 命令（进行对话）
chatCmd
  .argument('[prompt...]', '你的问题')
  .option('-d, --debug', '显示调试信息')
  .action(async (promptArgs, options) => {
    const prompt = promptArgs.join(' ');

    if (!prompt.trim()) {
      // 没有输入，显示对话状态
      const roundCount = getChatRoundCount();
      console.log(chalk.bold('\n💬 AI 对话模式'));
      console.log(chalk.gray('━'.repeat(40)));
      console.log(`  ${chalk.cyan('当前对话轮数')}: ${roundCount}`);
      console.log(`  ${chalk.cyan('历史文件')}:     ${getChatHistoryFilePath()}`);
      console.log(chalk.gray('━'.repeat(40)));
      console.log(chalk.gray('\n用法:'));
      console.log(chalk.cyan('  pls chat <问题>') + chalk.gray('    与 AI 对话'));
      console.log(chalk.cyan('  pls chat clear') + chalk.gray('     清空对话历史'));
      console.log();
      return;
    }

    // 检查配置
    if (!isConfigValid()) {
      console.log(chalk.yellow('\n⚠️  检测到尚未配置 API Key'));
      console.log(chalk.gray('请运行 ') + chalk.cyan('pls config') + chalk.gray(' 进行配置\n'));
      process.exit(1);
    }

    try {
      // 显示对话轮数
      const roundCount = getChatRoundCount();
      if (roundCount > 0) {
        console.log(chalk.gray(`(对话轮数: ${roundCount})`));
      }

      // 思考中 spinner
      const spinner = ora({
        text: '思考中...',
        spinner: 'dots'
      }).start();

      const startTime = Date.now();
      let firstChunk = true;

      // 流式输出回调 - 逐字符输出原始 markdown
      const onChunk = (content) => {
        if (firstChunk) {
          // 第一个 chunk 到来，清理 spinner
          spinner.stop();
          process.stdout.write('\r\x1b[K'); // 清除当前行
          firstChunk = false;
        }
        // 直接输出原始内容（逐字符）
        process.stdout.write(content);
      };

      const result = await chatWithAI(prompt, {
        debug: options.debug,
        onChunk
      });
      const duration = Date.now() - startTime;

      // 输出完成后换行
      console.log();
      console.log(chalk.gray(`(${formatDuration(duration)})`));

      // 调试模式下显示调试信息
      if (options.debug) {
        console.log(chalk.magenta('\n━━━ 调试信息 ━━━'));
        console.log(chalk.gray('系统信息: ') + result.debug.sysinfo);
        console.log(chalk.gray('模型: ') + result.debug.model);
        console.log(chalk.gray('对话历史轮数: ') + Math.floor(result.debug.chatHistory.length / 2));
        console.log(chalk.gray('System Prompt:'));
        console.log(chalk.dim(result.debug.systemPrompt));
        console.log(chalk.gray('User Prompt: ') + result.debug.userPrompt);
        console.log(chalk.magenta('━'.repeat(16)));
      }

    } catch (error) {
      console.error(chalk.red('\n❌ 错误: ') + error.message);
      process.exit(1);
    }
  });

// 默认命令（执行 prompt）
program
  .argument('[prompt...]', '自然语言描述你想执行的操作')
  .option('-d, --debug', '显示调试信息（系统信息、完整 prompt 等）')
  .action(async (promptArgs, options) => {
    if (promptArgs.length === 0) {
      program.help();
      return;
    }
    await runPrompt(promptArgs, { debug: options.debug });
  });

// 自定义帮助信息
program.addHelpText('after', `

${chalk.bold('示例:')}
  ${chalk.cyan('pls 安装 git')}                    让 AI 生成安装 git 的命令
  ${chalk.cyan('pls 查找大于 100MB 的文件')}        查找大文件
  ${chalk.cyan('pls 删除刚才创建的文件')}          AI 会参考历史记录
  ${chalk.cyan('pls --debug 压缩 logs 目录')}      显示调试信息
  ${chalk.cyan('pls chat tar 命令怎么用')}         AI 对话模式
  ${chalk.cyan('pls chat clear')}                 清空对话历史
  ${chalk.cyan('pls history')}                    查看 pls 命令历史
  ${chalk.cyan('pls history clear')}              清空历史记录
  ${chalk.cyan('pls hook')}                       查看 shell hook 状态
  ${chalk.cyan('pls hook install')}               安装 shell hook（增强功能）
  ${chalk.cyan('pls hook uninstall')}             卸载 shell hook
  ${chalk.cyan('pls config')}                     交互式配置
  ${chalk.cyan('pls config get')}                 查看当前配置
`);

program.parse();
