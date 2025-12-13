import fs from 'fs';
import path from 'path';
import os from 'os';
import { getConfig } from './config.js';

const CONFIG_DIR = path.join(os.homedir(), '.please');
const CHAT_HISTORY_FILE = path.join(CONFIG_DIR, 'chat_history.json');

/**
 * 确保配置目录存在
 */
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * 读取对话历史
 * @returns {Array<{role: string, content: string}>} messages 数组
 */
export function getChatHistory() {
  ensureConfigDir();

  if (!fs.existsSync(CHAT_HISTORY_FILE)) {
    return [];
  }

  try {
    const content = fs.readFileSync(CHAT_HISTORY_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

/**
 * 保存对话历史
 * @param {Array<{role: string, content: string}>} history
 */
function saveChatHistory(history) {
  ensureConfigDir();
  fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify(history, null, 2));
}

/**
 * 添加一轮对话（用户问题 + AI 回答）
 * @param {string} userMessage - 用户消息
 * @param {string} assistantMessage - AI 回复
 */
export function addChatMessage(userMessage, assistantMessage) {
  const config = getConfig();
  const history = getChatHistory();

  // 添加新的对话
  history.push({ role: 'user', content: userMessage });
  history.push({ role: 'assistant', content: assistantMessage });

  // 计算当前轮数（每 2 条消息 = 1 轮）
  const currentRounds = Math.floor(history.length / 2);
  const maxRounds = config.chatHistoryLimit || 10;

  // 如果超出限制，移除最早的对话
  if (currentRounds > maxRounds) {
    // 需要移除的轮数
    const removeRounds = currentRounds - maxRounds;
    // 移除最早的 N 轮（N*2 条消息）
    history.splice(0, removeRounds * 2);
  }

  saveChatHistory(history);
}

/**
 * 清空对话历史
 */
export function clearChatHistory() {
  saveChatHistory([]);
}

/**
 * 获取对话历史文件路径
 */
export function getChatHistoryFilePath() {
  return CHAT_HISTORY_FILE;
}

/**
 * 获取当前对话轮数
 */
export function getChatRoundCount() {
  const history = getChatHistory();
  return Math.floor(history.length / 2);
}
