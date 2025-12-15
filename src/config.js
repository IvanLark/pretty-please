import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import chalk from 'chalk';

const CONFIG_DIR = path.join(os.homedir(), '.please');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4-turbo',
  provider: 'openai',  // Mastra provider: openai, anthropic, deepseek, google, groq, mistral, cohere 等
  shellHook: false,  // 是否启用 shell hook 记录终端命令
  chatHistoryLimit: 10,  // chat 对话历史保留轮数
  commandHistoryLimit: 10,  // pls 命令历史条数（发送给 AI 的）
  shellHistoryLimit: 15,  // shell 历史条数（发送给 AI 的）
  editMode: 'manual',  // 编辑模式：manual=按E编辑，auto=自动进入编辑
};

// 导出配置目录路径
export { CONFIG_DIR };

/**
 * 确保配置目录存在
 */
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * 读取配置
 */
export function getConfig() {
  ensureConfigDir();

  if (!fs.existsSync(CONFIG_FILE)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(content) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * 保存配置
 */
export function saveConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * 设置单个配置项
 */
export function setConfigValue(key, value) {
  const config = getConfig();
  if (!(key in DEFAULT_CONFIG)) {
    throw new Error(`未知的配置项: ${key}`);
  }
  // 处理特殊类型
  if (key === 'shellHook') {
    config[key] = value === 'true' || value === true;
  } else if (key === 'chatHistoryLimit' || key === 'commandHistoryLimit' || key === 'shellHistoryLimit') {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 1) {
      throw new Error(`${key} 必须是大于 0 的整数`);
    }
    config[key] = num;
  } else if (key === 'provider') {
    // 验证 provider 值
    const validProviders = ['openai', 'anthropic', 'deepseek', 'google', 'groq', 'mistral', 'cohere', 'fireworks', 'together'];
    if (!validProviders.includes(value)) {
      throw new Error(`provider 必须是以下之一: ${validProviders.join(', ')}`);
    }
    config[key] = value;
  } else if (key === 'editMode') {
    // 验证 editMode 值
    const validModes = ['manual', 'auto'];
    if (!validModes.includes(value)) {
      throw new Error(`editMode 必须是以下之一: ${validModes.join(', ')}`);
    }
    config[key] = value;
  } else {
    config[key] = value;
  }
  saveConfig(config);
  return config;
}

/**
 * 检查配置是否有效
 */
export function isConfigValid() {
  const config = getConfig();
  return config.apiKey && config.apiKey.length > 0;
}

/**
 * 隐藏 API Key 中间部分
 */
export function maskApiKey(apiKey) {
  if (!apiKey || apiKey.length < 10) return apiKey || '(未设置)';
  return apiKey.slice(0, 6) + '****' + apiKey.slice(-4);
}

/**
 * 显示当前配置
 */
export function displayConfig() {
  const config = getConfig();
  console.log(chalk.bold('\n当前配置:'));
  console.log(chalk.gray('━'.repeat(50)));
  console.log(`  ${chalk.cyan('apiKey')}:              ${maskApiKey(config.apiKey)}`);
  console.log(`  ${chalk.cyan('baseUrl')}:             ${config.baseUrl}`);
  console.log(`  ${chalk.cyan('provider')}:            ${config.provider}`);
  console.log(`  ${chalk.cyan('model')}:               ${config.model}`);
  console.log(`  ${chalk.cyan('shellHook')}:           ${config.shellHook ? chalk.green('已启用') : chalk.gray('未启用')}`);
  console.log(`  ${chalk.cyan('editMode')}:            ${config.editMode === 'auto' ? chalk.hex('#00D9FF')('auto (自动编辑)') : chalk.gray('manual (按E编辑)')}`);
  console.log(`  ${chalk.cyan('chatHistoryLimit')}:    ${config.chatHistoryLimit} 轮`);
  console.log(`  ${chalk.cyan('commandHistoryLimit')}: ${config.commandHistoryLimit} 条`);
  console.log(`  ${chalk.cyan('shellHistoryLimit')}:   ${config.shellHistoryLimit} 条`);
  console.log(chalk.gray('━'.repeat(50)));
  console.log(chalk.gray(`配置文件: ${CONFIG_FILE}\n`));
}

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
 * 异步提问
 */
function question(rl, prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * 交互式配置向导
 */
export async function runConfigWizard() {
  const rl = createReadlineInterface();
  const config = getConfig();

  console.log(chalk.bold.hex('#00D9FF')('\n🔧 Pretty Please 配置向导'));
  console.log(chalk.gray('━'.repeat(50)));
  console.log(chalk.gray('直接回车使用默认值，输入值后回车确认\n'));

  try {
    // 1. Provider
    const validProviders = ['openai', 'anthropic', 'deepseek', 'google', 'groq', 'mistral', 'cohere', 'fireworks', 'together'];
    const providerHint = chalk.gray(`(可选: ${validProviders.join(', ')})`);
    const providerPrompt = `${chalk.cyan('Provider')} ${providerHint}\n${chalk.gray('默认:')} ${chalk.yellow(config.provider)} ${chalk.gray('→')} `;
    const provider = await question(rl, providerPrompt);
    if (provider.trim()) {
      if (!validProviders.includes(provider.trim())) {
        console.log(chalk.hex('#EF4444')(`\n✗ 无效的 provider，必须是以下之一: ${validProviders.join(', ')}`));
        console.log();
        rl.close();
        return;
      }
      config.provider = provider.trim();
    }

    // 2. Base URL
    const baseUrlPrompt = `${chalk.cyan('API Base URL')}\n${chalk.gray('默认:')} ${chalk.yellow(config.baseUrl)} ${chalk.gray('→')} `;
    const baseUrl = await question(rl, baseUrlPrompt);
    if (baseUrl.trim()) {
      config.baseUrl = baseUrl.trim();
    }

    // 3. API Key
    const currentKeyDisplay = config.apiKey ? maskApiKey(config.apiKey) : '(未设置)';
    const apiKeyPrompt = `${chalk.cyan('API Key')} ${chalk.gray(`(当前: ${currentKeyDisplay})`)}\n${chalk.gray('→')} `;
    const apiKey = await question(rl, apiKeyPrompt);
    if (apiKey.trim()) {
      config.apiKey = apiKey.trim();
    }

    // 4. Model
    const modelPrompt = `${chalk.cyan('Model')}\n${chalk.gray('默认:')} ${chalk.yellow(config.model)} ${chalk.gray('→')} `;
    const model = await question(rl, modelPrompt);
    if (model.trim()) {
      config.model = model.trim();
    }

    // 5. Shell Hook
    const shellHookPrompt = `${chalk.cyan('启用 Shell Hook')} ${chalk.gray('(记录终端命令历史)')}\n${chalk.gray('默认:')} ${chalk.yellow(config.shellHook ? 'true' : 'false')} ${chalk.gray('→')} `;
    const shellHook = await question(rl, shellHookPrompt);
    if (shellHook.trim()) {
      config.shellHook = shellHook.trim() === 'true';
    }

    // 6. Edit Mode
    const editModeHint = chalk.gray('(manual=按E编辑, auto=自动编辑)');
    const editModePrompt = `${chalk.cyan('编辑模式')} ${editModeHint}\n${chalk.gray('默认:')} ${chalk.yellow(config.editMode)} ${chalk.gray('→')} `;
    const editMode = await question(rl, editModePrompt);
    if (editMode.trim()) {
      const validModes = ['manual', 'auto'];
      if (!validModes.includes(editMode.trim())) {
        console.log(chalk.hex('#EF4444')(`\n✗ 无效的 editMode，必须是: manual 或 auto`));
        console.log();
        rl.close();
        return;
      }
      config.editMode = editMode.trim();
    }

    // 7. Chat History Limit
    const chatHistoryPrompt = `${chalk.cyan('Chat 历史保留轮数')}\n${chalk.gray('默认:')} ${chalk.yellow(config.chatHistoryLimit)} ${chalk.gray('→')} `;
    const chatHistoryLimit = await question(rl, chatHistoryPrompt);
    if (chatHistoryLimit.trim()) {
      const num = parseInt(chatHistoryLimit.trim(), 10);
      if (!isNaN(num) && num > 0) {
        config.chatHistoryLimit = num;
      }
    }

    // 8. Command History Limit
    const commandHistoryPrompt = `${chalk.cyan('命令历史保留条数')}\n${chalk.gray('默认:')} ${chalk.yellow(config.commandHistoryLimit)} ${chalk.gray('→')} `;
    const commandHistoryLimit = await question(rl, commandHistoryPrompt);
    if (commandHistoryLimit.trim()) {
      const num = parseInt(commandHistoryLimit.trim(), 10);
      if (!isNaN(num) && num > 0) {
        config.commandHistoryLimit = num;
      }
    }

    // 9. Shell History Limit
    const shellHistoryPrompt = `${chalk.cyan('Shell 历史保留条数')}\n${chalk.gray('默认:')} ${chalk.yellow(config.shellHistoryLimit)} ${chalk.gray('→')} `;
    const shellHistoryLimit = await question(rl, shellHistoryPrompt);
    if (shellHistoryLimit.trim()) {
      const num = parseInt(shellHistoryLimit.trim(), 10);
      if (!isNaN(num) && num > 0) {
        config.shellHistoryLimit = num;
      }
    }

    saveConfig(config);

    console.log('\n' + chalk.gray('━'.repeat(50)));
    console.log(chalk.hex('#10B981')('✅ 配置已保存'));
    console.log(chalk.gray(`   ${CONFIG_FILE}`));
    console.log();

  } catch (error) {
    console.log(chalk.hex('#EF4444')(`\n✗ 配置失败: ${error.message}`));
    console.log();
  } finally {
    rl.close();
  }
}
