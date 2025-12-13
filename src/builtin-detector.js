/**
 * Shell builtin 命令检测器
 *
 * 用于检测命令中是否包含 shell 内置命令（builtin）
 * 这些命令在子进程中执行可能无效或行为异常
 */

// Shell 内置命令列表
const SHELL_BUILTINS = [
  // 目录相关
  'cd', 'pushd', 'popd', 'dirs',

  // 历史相关
  'history',

  // 别名和函数
  'alias', 'unalias',

  // 环境变量
  'export', 'set', 'unset', 'declare', 'local', 'readonly',

  // 脚本执行
  'source', '.',

  // 任务控制
  'jobs', 'fg', 'bg', 'disown',

  // 其他
  'ulimit', 'umask', 'builtin', 'command', 'type',
  'enable', 'hash', 'help', 'let', 'read', 'wait',
  'eval', 'exec', 'trap', 'times', 'shopt'
];

/**
 * 提取命令中的所有命令名
 * @param {string} command - 完整命令字符串
 * @returns {string[]} 命令名数组
 */
function extractCommandNames(command) {
  // 按分隔符拆分（&&, ||, ;, |, &, 换行）
  // 注意：| 是管道，两边都在子进程中执行，所以也算
  const parts = command.split(/[;&|]+|\n+/);

  const commandNames = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // 提取第一个单词（命令名）
    // 处理 sudo、env 等前缀
    let words = trimmed.split(/\s+/);

    // 跳过 sudo、env 等
    let i = 0;
    while (i < words.length && ['sudo', 'env', 'nohup', 'nice'].includes(words[i])) {
      i++;
    }

    if (i < words.length) {
      commandNames.push(words[i]);
    }
  }

  return commandNames;
}

/**
 * 检测命令中是否包含 builtin
 * @param {string} command - 要检测的命令
 * @returns {{ hasBuiltin: boolean, builtins: string[] }} 检测结果
 */
export function detectBuiltin(command) {
  const commandNames = extractCommandNames(command);
  const foundBuiltins = [];

  for (const name of commandNames) {
    if (SHELL_BUILTINS.includes(name)) {
      foundBuiltins.push(name);
    }
  }

  return {
    hasBuiltin: foundBuiltins.length > 0,
    builtins: [...new Set(foundBuiltins)] // 去重
  };
}

/**
 * 格式化 builtin 列表为易读的字符串
 * @param {string[]} builtins - builtin 命令数组
 * @returns {string} 格式化后的字符串
 */
export function formatBuiltins(builtins) {
  if (builtins.length === 0) return '';
  if (builtins.length === 1) return builtins[0];
  return builtins.join(', ');
}
