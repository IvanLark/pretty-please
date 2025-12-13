#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import readline from 'readline';
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
import {
  addHistory,
  getHistory,
  clearHistory,
  getHistoryFilePath
} from '../src/history.js';

// 获取 package.json 版本
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(fs.readFileSync(join(__dirname, '../package.json'), 'utf-8'));

const program = new Command();

/**
 * 创建 readline 接口
 */
function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * 询问用户确认
 */
function askConfirmation(prompt) {
  return new Promise((resolve) => {
    const rl = createReadlineInterface();
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
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
    console.log(chalk.gray('\n🤔 正在思考...'));

    const result = await generateCommand(prompt, { debug });

    // 根据是否调试模式，解构结果
    const command = debug ? result.command : result;

    // 调试模式下显示调试信息
    if (debug) {
      displayDebugInfo(result.debug);
    }

    // 显示生成的命令
    console.log(chalk.yellow('\n━━━ AI 生成了以下命令 ━━━'));
    console.log(chalk.cyan(command));
    console.log(chalk.yellow('━'.repeat(26)));

    // 询问确认
    const confirmed = await askConfirmation(
      chalk.bold.yellow('是否执行？') + chalk.gray(' [y/N] ')
    );

    if (confirmed) {
      console.log(chalk.magenta('\n🚀 执行中...\n'));
      const { exitCode, output } = await executeCommand(command);

      // 记录历史
      addHistory({
        userPrompt: prompt,
        command,
        executed: true,
        exitCode,
        output
      });

      if (exitCode === 0) {
        console.log(chalk.green('\n✅ 执行完成'));
      } else {
        console.log(chalk.red(`\n❌ 命令执行失败，退出码: ${exitCode}`));
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
  ${chalk.cyan('pls history')}                    查看命令历史
  ${chalk.cyan('pls history clear')}              清空历史记录
  ${chalk.cyan('pls config')}                     交互式配置
  ${chalk.cyan('pls config get')}                 查看当前配置
  ${chalk.cyan('pls config set apiKey sk-xxx')}   设置 API Key
`);

program.parse();
