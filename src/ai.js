import OpenAI from 'openai';
import { getConfig } from './config.js';
import { formatSystemInfo } from './sysinfo.js';
import { formatHistoryForAI } from './history.js';
import { formatShellHistoryForAI, getShellHistory } from './shell-hook.js';

/**
 * 创建 OpenAI 客户端
 */
function createClient() {
  const config = getConfig();

  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl
  });
}

/**
 * 生成系统提示词
 * @param {string} sysinfo - 系统信息
 * @param {string} plsHistory - pls 命令历史
 * @param {string} shellHistory - shell 终端历史
 * @param {boolean} shellHookEnabled - 是否启用了 shell hook
 */
function buildSystemPrompt(sysinfo, plsHistory, shellHistory, shellHookEnabled) {
  let prompt = `你是一个专业的 shell 脚本生成器。用户会提供他们的系统信息和一个命令需求。
你的任务是返回一个可执行的、原始的 shell 命令或脚本来完成他们的目标。

重要规则：
1. 只返回可以直接执行的命令，不要有任何解释、注释或 markdown 格式
2. 不要添加 shebang（如 #!/bin/bash）
3. 如果需要多条命令，可以用 && 连接或换行
4. 根据用户的系统信息选择合适的命令（如包管理器）
5. 如果用户引用了之前的操作（如"刚才的"、"上一个"），请参考历史记录
6. 绝对不要输出 pls 或 please 命令！pls/please 是用户正在使用的 AI 命令生成工具（就是你），输出它会导致无限循环

关于 pls/please 工具：
用户正在使用 pls（pretty-please）工具，这是一个将自然语言转换为 shell 命令的 AI 助手。
当用户输入 "pls <描述>" 时，AI（也就是你）会生成对应的 shell 命令供用户确认执行。
历史记录中标记为 [pls] 的条目表示用户通过 pls 工具执行的命令。

用户的系统信息：${sysinfo}`;

  // 根据是否启用 shell hook 决定展示哪个历史
  if (shellHookEnabled && shellHistory) {
    // 启用了 shell hook：只展示 shell history（已包含增强的 pls 信息）
    prompt += `\n\n${shellHistory}`;
  } else if (plsHistory) {
    // 未启用 shell hook：只展示 pls history
    prompt += `\n\n${plsHistory}`;
  }

  return prompt;
}

/**
 * 调用 AI 生成命令
 * @param {string} prompt 用户输入的自然语言描述
 * @param {object} options 选项
 * @param {boolean} options.debug 是否返回调试信息
 */
export async function generateCommand(prompt, options = {}) {
  const config = getConfig();
  const client = createClient();
  const sysinfo = formatSystemInfo();
  const plsHistory = formatHistoryForAI();
  const shellHistory = formatShellHistoryForAI();
  const shellHookEnabled = config.shellHook && getShellHistory().length > 0;
  const systemPrompt = buildSystemPrompt(sysinfo, plsHistory, shellHistory, shellHookEnabled);

  const response = await client.chat.completions.create({
    model: config.model,
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    max_tokens: 1024,
    temperature: 0.2
  });

  const command = response.choices[0]?.message?.content?.trim();

  if (!command) {
    throw new Error('AI 返回了空的响应');
  }

  if (options.debug) {
    return {
      command,
      debug: {
        sysinfo,
        model: config.model,
        systemPrompt,
        userPrompt: prompt
      }
    };
  }

  return command;
}
