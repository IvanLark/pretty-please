import OpenAI from 'openai';
import { getConfig } from './config.js';
import { formatSystemInfo } from './sysinfo.js';

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
 */
function buildSystemPrompt(sysinfo) {
  return `你是一个专业的 shell 脚本生成器。用户会提供他们的系统信息和一个命令需求。
你的任务是返回一个可执行的、原始的 shell 命令或脚本来完成他们的目标。

重要规则：
1. 只返回可以直接执行的命令，不要有任何解释、注释或 markdown 格式
2. 不要添加 shebang（如 #!/bin/bash）
3. 如果需要多条命令，可以用 && 连接或换行
4. 根据用户的系统信息选择合适的命令（如包管理器）

用户的系统信息：${sysinfo}`;
}

/**
 * 调用 AI 生成命令
 */
export async function generateCommand(prompt) {
  const config = getConfig();
  const client = createClient();
  const sysinfo = formatSystemInfo();

  const response = await client.chat.completions.create({
    model: config.model,
    messages: [
      {
        role: 'system',
        content: buildSystemPrompt(sysinfo)
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

  return command;
}
