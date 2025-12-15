import OpenAI from 'openai';
import { getConfig } from './config.js';
import { formatSystemInfo } from './sysinfo.js';
import { formatHistoryForAI } from './history.js';
import { formatShellHistoryForAI, getShellHistory } from './shell-hook.js';
import { getChatHistory, addChatMessage } from './chat-history.js';

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
1. 返回 JSON 格式，command 字段必须是可直接执行的命令（无解释、无注释、无 markdown）
2. 不要添加 shebang（如 #!/bin/bash）
3. command 可以包含多条命令（用 && 连接），但整体算一个命令
4. 根据用户的系统信息选择合适的命令（如包管理器）
5. 如果用户引用了之前的操作（如"刚才的"、"上一个"），请参考历史记录
6. 绝对不要输出 pls 或 please 命令！

【输出格式 - 非常重要】

单步模式（一个命令完成）：
如果任务只需要一个命令就能完成，只返回：
{
  "command": "ls -la"
}

多步模式（需要多个命令，后续依赖前面的结果）：
如果任务需要多个命令，且后续命令必须根据前面的执行结果来决定，则返回：

【多步骤完整示例】
用户："查找大于100MB的日志文件并压缩"

第一步你返回：
{
  "command": "find . -name '*.log' -size +100M",
  "continue": true,
  "reasoning": "查找大日志", （精简即可）
  "nextStepHint": "压缩找到的文件" （精简即可）
}

执行后你会收到：
命令已执行
退出码: 0
输出:
./app.log
./system.log

然后你返回第二步：
{
  "command": "tar -czf logs.tar.gz ./app.log ./system.log",
  "continue": false,
  "reasoning": "压缩日志文件"
}

关键判断标准：
- 多步 = 后续命令依赖前面的输出（如先 find 看有哪些，再根据结果操作具体文件）
- 单步 = 一个命令就能完成（即使命令里有 && 连接多条，也算一个命令）

常见场景举例：
- "删除空文件夹" → 单步：find . -empty -delete （一个命令完成）
- "查找大文件并压缩" → 多步：先 find 看有哪些，再 tar 压缩具体文件
- "安装 git" → 单步：brew install git
- "备份并删除旧日志" → 多步：先 mkdir backup，再 mv 文件到 backup
- "查看目录" → 单步：ls -la

严格要求：单步模式只返回 {"command": "xxx"}，绝对不要输出 continue/reasoning/nextStepHint！

【错误处理】
如果你收到命令执行失败的信息（退出码非0），你应该：
1. 分析错误原因
2. 调整命令策略，返回修正后的命令
3. 设置 continue: true 重试，或设置 continue: false 放弃

错误处理示例：
上一步失败，你收到：
命令已执行
退出码: 1
输出:
mv: rename ./test.zip to ./c/test.zip: No such file or directory

你分析后返回修正：
{
  "command": "cp test.zip a/ && cp test.zip b/ && cp test.zip c/",
  "continue": false,
  "reasoning": "改用 cp 复制而非 mv"
}

或者如果决定放弃（无法修正），返回：
{
  "command": "",
  "continue": false,
  "reasoning": "文件不存在且无法恢复，任务无法继续"
}

重要：当 continue: false 且决定放弃时，command 可以留空，重点是在 reasoning 中说明为什么放弃。

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

// 导出给其他模块使用
export { buildSystemPrompt };

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

/**
 * 生成 chat 模式的系统提示词
 * @param {string} sysinfo - 系统信息
 * @param {string} plsHistory - pls 命令历史
 * @param {string} shellHistory - shell 终端历史
 * @param {boolean} shellHookEnabled - 是否启用了 shell hook
 */
function buildChatSystemPrompt(sysinfo, plsHistory, shellHistory, shellHookEnabled) {
  let prompt = `你是一个命令行专家助手，帮助用户理解和使用命令行工具。

【你的能力】
- 解释命令的含义、参数、用法
- 分析命令的执行效果和潜在风险
- 回答命令行、Shell、系统管理相关问题
- 根据用户需求推荐合适的命令并解释

【回答要求】
- 简洁清晰，避免冗余
- 危险操作要明确警告
- 适当给出示例命令
- 结合用户的系统环境给出针对性建议

【用户系统信息】
${sysinfo}`;

  // 根据是否启用 shell hook 决定展示哪个历史
  if (shellHookEnabled && shellHistory) {
    prompt += `\n\n${shellHistory}`;
  } else if (plsHistory) {
    prompt += `\n\n${plsHistory}`;
  }

  return prompt;
}

/**
 * 调用 AI 进行对话（chat 模式，支持流式输出）
 * @param {string} prompt 用户输入的问题
 * @param {object} options 选项
 * @param {boolean} options.debug 是否返回调试信息
 * @param {function} options.onChunk 流式输出回调，接收每个文本片段
 */
export async function chatWithAI(prompt, options = {}) {
  const config = getConfig();
  const client = createClient();
  const sysinfo = formatSystemInfo();
  const plsHistory = formatHistoryForAI();
  const shellHistory = formatShellHistoryForAI();
  const shellHookEnabled = config.shellHook && getShellHistory().length > 0;
  const systemPrompt = buildChatSystemPrompt(sysinfo, plsHistory, shellHistory, shellHookEnabled);

  // 获取对话历史
  const chatHistory = getChatHistory();

  // 构建消息数组
  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatHistory,
    { role: 'user', content: prompt }
  ];

  // 流式输出模式
  if (options.onChunk) {
    const stream = await client.chat.completions.create({
      model: config.model,
      messages,
      max_tokens: 2048,
      temperature: 0.7,
      stream: true
    });

    let fullContent = '';

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullContent += content;
        options.onChunk(content);
      }
    }

    if (!fullContent) {
      throw new Error('AI 返回了空的响应');
    }

    // 保存对话历史
    addChatMessage(prompt, fullContent);

    if (options.debug) {
      return {
        reply: fullContent,
        debug: {
          sysinfo,
          model: config.model,
          systemPrompt,
          chatHistory,
          userPrompt: prompt
        }
      };
    }

    return fullContent;
  }

  // 非流式模式（保持兼容）
  const response = await client.chat.completions.create({
    model: config.model,
    messages,
    max_tokens: 2048,
    temperature: 0.7
  });

  const reply = response.choices[0]?.message?.content?.trim();

  if (!reply) {
    throw new Error('AI 返回了空的响应');
  }

  // 保存对话历史
  addChatMessage(prompt, reply);

  if (options.debug) {
    return {
      reply,
      debug: {
        sysinfo,
        model: config.model,
        systemPrompt,
        chatHistory,
        userPrompt: prompt
      }
    };
  }

  return reply;
}
