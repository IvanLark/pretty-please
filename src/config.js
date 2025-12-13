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
  shellHook: false  // 是否启用 shell hook 记录终端命令
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
  // 处理 boolean 类型
  if (key === 'shellHook') {
    config[key] = value === 'true' || value === true;
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
  console.log(chalk.gray('━'.repeat(40)));
  console.log(`  ${chalk.cyan('apiKey')}:    ${maskApiKey(config.apiKey)}`);
  console.log(`  ${chalk.cyan('baseUrl')}:   ${config.baseUrl}`);
  console.log(`  ${chalk.cyan('model')}:     ${config.model}`);
  console.log(`  ${chalk.cyan('shellHook')}: ${config.shellHook ? chalk.green('已启用') : chalk.gray('未启用')}`);
  console.log(chalk.gray('━'.repeat(40)));
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

  console.log(chalk.bold.magenta('\n🔧 Pretty Please 配置向导'));
  console.log(chalk.gray('━'.repeat(40)));

  try {
    // API Key
    const currentKeyDisplay = config.apiKey ? ` (当前: ${maskApiKey(config.apiKey)})` : '';
    const apiKey = await question(rl, chalk.cyan(`请输入 API Key${currentKeyDisplay}: `));
    if (apiKey.trim()) {
      config.apiKey = apiKey.trim();
    }

    // Base URL
    const baseUrl = await question(rl, chalk.cyan(`请输入 API Base URL (回车使用 ${config.baseUrl}): `));
    if (baseUrl.trim()) {
      config.baseUrl = baseUrl.trim();
    }

    // Model
    const model = await question(rl, chalk.cyan(`请输入模型名称 (回车使用 ${config.model}): `));
    if (model.trim()) {
      config.model = model.trim();
    }

    saveConfig(config);

    console.log(chalk.gray('━'.repeat(40)));
    console.log(chalk.green('✅ 配置已保存到 ') + chalk.gray(CONFIG_FILE));
    console.log();

  } finally {
    rl.close();
  }
}
