import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { CONFIG_DIR, getConfig, setConfigValue } from './config.js';

const SHELL_HISTORY_FILE = path.join(CONFIG_DIR, 'shell_history.jsonl');
const MAX_SHELL_HISTORY = 20;

// Hook 标记，用于识别我们添加的内容
const HOOK_START_MARKER = '# >>> pretty-please shell hook >>>';
const HOOK_END_MARKER = '# <<< pretty-please shell hook <<<';

/**
 * 检测当前 shell 类型
 */
export function detectShell() {
  const shell = process.env.SHELL || '';
  if (shell.includes('zsh')) return 'zsh';
  if (shell.includes('bash')) return 'bash';
  // Windows PowerShell
  if (process.platform === 'win32') return 'powershell';
  return 'unknown';
}

/**
 * 获取 shell 配置文件路径
 */
export function getShellConfigPath(shellType) {
  const home = os.homedir();
  switch (shellType) {
    case 'zsh':
      return path.join(home, '.zshrc');
    case 'bash':
      // macOS 使用 .bash_profile，Linux 使用 .bashrc
      if (process.platform === 'darwin') {
        return path.join(home, '.bash_profile');
      }
      return path.join(home, '.bashrc');
    case 'powershell':
      // PowerShell profile 路径
      return path.join(home, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1');
    default:
      return null;
  }
}

/**
 * 生成 zsh hook 脚本
 */
function generateZshHook() {
  return `
${HOOK_START_MARKER}
# 记录命令到 pretty-please 历史
__pls_preexec() {
  __PLS_LAST_CMD="$1"
  __PLS_CMD_START=$(date +%s)
}

__pls_precmd() {
  local exit_code=$?
  if [[ -n "$__PLS_LAST_CMD" ]]; then
    local end_time=$(date +%s)
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    # 转义命令中的特殊字符
    local escaped_cmd=$(echo "$__PLS_LAST_CMD" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g')
    echo "{\\"cmd\\":\\"$escaped_cmd\\",\\"exit\\":$exit_code,\\"time\\":\\"$timestamp\\"}" >> "${CONFIG_DIR}/shell_history.jsonl"
    # 保持文件不超过 ${MAX_SHELL_HISTORY} 行
    tail -n ${MAX_SHELL_HISTORY} "${CONFIG_DIR}/shell_history.jsonl" > "${CONFIG_DIR}/shell_history.jsonl.tmp" && mv "${CONFIG_DIR}/shell_history.jsonl.tmp" "${CONFIG_DIR}/shell_history.jsonl"
    unset __PLS_LAST_CMD
  fi
}

autoload -Uz add-zsh-hook
add-zsh-hook preexec __pls_preexec
add-zsh-hook precmd __pls_precmd
${HOOK_END_MARKER}
`;
}

/**
 * 生成 bash hook 脚本
 */
function generateBashHook() {
  return `
${HOOK_START_MARKER}
# 记录命令到 pretty-please 历史
__pls_prompt_command() {
  local exit_code=$?
  local last_cmd=$(history 1 | sed 's/^ *[0-9]* *//')
  if [[ -n "$last_cmd" && "$last_cmd" != "$__PLS_LAST_CMD" ]]; then
    __PLS_LAST_CMD="$last_cmd"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local escaped_cmd=$(echo "$last_cmd" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g')
    echo "{\\"cmd\\":\\"$escaped_cmd\\",\\"exit\\":$exit_code,\\"time\\":\\"$timestamp\\"}" >> "${CONFIG_DIR}/shell_history.jsonl"
    tail -n ${MAX_SHELL_HISTORY} "${CONFIG_DIR}/shell_history.jsonl" > "${CONFIG_DIR}/shell_history.jsonl.tmp" && mv "${CONFIG_DIR}/shell_history.jsonl.tmp" "${CONFIG_DIR}/shell_history.jsonl"
  fi
}

if [[ ! "$PROMPT_COMMAND" =~ __pls_prompt_command ]]; then
  PROMPT_COMMAND="__pls_prompt_command;\${PROMPT_COMMAND}"
fi
${HOOK_END_MARKER}
`;
}

/**
 * 生成 PowerShell hook 脚本
 */
function generatePowerShellHook() {
  return `
${HOOK_START_MARKER}
# 记录命令到 pretty-please 历史
$Global:__PlsLastCmd = ""

function __Pls_RecordCommand {
    $lastCmd = (Get-History -Count 1).CommandLine
    if ($lastCmd -and $lastCmd -ne $Global:__PlsLastCmd) {
        $Global:__PlsLastCmd = $lastCmd
        $exitCode = $LASTEXITCODE
        if ($null -eq $exitCode) { $exitCode = 0 }
        $timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        $escapedCmd = $lastCmd -replace '\\\\', '\\\\\\\\' -replace '"', '\\\\"'
        $json = "{\`"cmd\`":\`"$escapedCmd\`",\`"exit\`":$exitCode,\`"time\`":\`"$timestamp\`"}"
        Add-Content -Path "${CONFIG_DIR}/shell_history.jsonl" -Value $json
        # 保持文件不超过 ${MAX_SHELL_HISTORY} 行
        $content = Get-Content "${CONFIG_DIR}/shell_history.jsonl" -Tail ${MAX_SHELL_HISTORY}
        $content | Set-Content "${CONFIG_DIR}/shell_history.jsonl"
    }
}

if (-not (Get-Variable -Name __PlsPromptBackup -ErrorAction SilentlyContinue)) {
    $Global:__PlsPromptBackup = $function:prompt
    function Global:prompt {
        __Pls_RecordCommand
        & $Global:__PlsPromptBackup
    }
}
${HOOK_END_MARKER}
`;
}

/**
 * 生成 hook 脚本
 */
function generateHookScript(shellType) {
  switch (shellType) {
    case 'zsh':
      return generateZshHook();
    case 'bash':
      return generateBashHook();
    case 'powershell':
      return generatePowerShellHook();
    default:
      return null;
  }
}

/**
 * 安装 shell hook
 */
export async function installShellHook() {
  const shellType = detectShell();
  const configPath = getShellConfigPath(shellType);

  if (!configPath) {
    console.log(chalk.red(`❌ 不支持的 shell 类型: ${shellType}`));
    return false;
  }

  const hookScript = generateHookScript(shellType);
  if (!hookScript) {
    console.log(chalk.red(`❌ 无法为 ${shellType} 生成 hook 脚本`));
    return false;
  }

  // 检查是否已安装
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf-8');
    if (content.includes(HOOK_START_MARKER)) {
      console.log(chalk.yellow('⚠️  Shell hook 已安装，跳过'));
      setConfigValue('shellHook', true);
      return true;
    }
  }

  // 确保配置目录存在
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  // 备份原配置文件
  if (fs.existsSync(configPath)) {
    const backupPath = configPath + '.pls-backup';
    fs.copyFileSync(configPath, backupPath);
    console.log(chalk.gray(`已备份原配置文件到: ${backupPath}`));
  }

  // 追加 hook 脚本
  fs.appendFileSync(configPath, hookScript);

  // 更新配置
  setConfigValue('shellHook', true);

  console.log(chalk.green(`✅ Shell hook 已安装到: ${configPath}`));
  console.log(chalk.yellow('⚠️  请重启终端或执行以下命令使其生效:'));
  console.log(chalk.cyan(`   source ${configPath}`));

  return true;
}

/**
 * 卸载 shell hook
 */
export function uninstallShellHook() {
  const shellType = detectShell();
  const configPath = getShellConfigPath(shellType);

  if (!configPath || !fs.existsSync(configPath)) {
    console.log(chalk.yellow('⚠️  未找到 shell 配置文件'));
    setConfigValue('shellHook', false);
    return true;
  }

  let content = fs.readFileSync(configPath, 'utf-8');

  // 移除 hook 脚本
  const startIndex = content.indexOf(HOOK_START_MARKER);
  const endIndex = content.indexOf(HOOK_END_MARKER);

  if (startIndex === -1 || endIndex === -1) {
    console.log(chalk.yellow('⚠️  未找到已安装的 hook'));
    setConfigValue('shellHook', false);
    return true;
  }

  // 移除从标记开始到结束的所有内容（包括换行符）
  const before = content.substring(0, startIndex);
  const after = content.substring(endIndex + HOOK_END_MARKER.length);
  content = before + after.replace(/^\n/, '');

  fs.writeFileSync(configPath, content);
  setConfigValue('shellHook', false);

  // 清空 shell 历史文件
  if (fs.existsSync(SHELL_HISTORY_FILE)) {
    fs.unlinkSync(SHELL_HISTORY_FILE);
  }

  console.log(chalk.green('✅ Shell hook 已卸载'));
  console.log(chalk.yellow('⚠️  请重启终端使其生效'));

  return true;
}

/**
 * 读取 shell 历史记录
 */
export function getShellHistory() {
  const config = getConfig();

  // 如果未启用 shell hook，返回空数组
  if (!config.shellHook) {
    return [];
  }

  if (!fs.existsSync(SHELL_HISTORY_FILE)) {
    return [];
  }

  try {
    const content = fs.readFileSync(SHELL_HISTORY_FILE, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim());

    return lines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * 格式化 shell 历史供 AI 使用
 */
export function formatShellHistoryForAI() {
  const history = getShellHistory();

  if (history.length === 0) {
    return '';
  }

  const lines = history.map((item, index) => {
    const status = item.exit === 0 ? '✓' : `✗ 退出码:${item.exit}`;
    return `${index + 1}. ${item.cmd} ${status}`;
  });

  return `【用户终端最近执行的命令】\n${lines.join('\n')}`;
}

/**
 * 获取 hook 状态
 */
export function getHookStatus() {
  const config = getConfig();
  const shellType = detectShell();
  const configPath = getShellConfigPath(shellType);

  let installed = false;
  if (configPath && fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf-8');
    installed = content.includes(HOOK_START_MARKER);
  }

  return {
    enabled: config.shellHook,
    installed,
    shellType,
    configPath,
    historyFile: SHELL_HISTORY_FILE
  };
}
