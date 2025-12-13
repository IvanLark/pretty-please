import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.please');
const HISTORY_FILE = path.join(CONFIG_DIR, 'history.json');
const MAX_HISTORY = 10;
const MAX_OUTPUT_LENGTH = 500;

/**
 * 确保配置目录存在
 */
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * 读取历史记录
 */
export function getHistory() {
  ensureConfigDir();

  if (!fs.existsSync(HISTORY_FILE)) {
    return [];
  }

  try {
    const content = fs.readFileSync(HISTORY_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

/**
 * 保存历史记录
 */
function saveHistory(history) {
  ensureConfigDir();
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

/**
 * 添加一条历史记录
 */
export function addHistory(record) {
  const history = getHistory();

  // 截断输出
  if (record.output && record.output.length > MAX_OUTPUT_LENGTH) {
    record.output = record.output.slice(0, MAX_OUTPUT_LENGTH) + '...(截断)';
  }

  // 添加时间戳
  record.timestamp = new Date().toISOString();

  // 添加到开头
  history.unshift(record);

  // 保留最近 N 条
  if (history.length > MAX_HISTORY) {
    history.length = MAX_HISTORY;
  }

  saveHistory(history);
}

/**
 * 清空历史记录
 */
export function clearHistory() {
  saveHistory([]);
}

/**
 * 格式化历史记录供 AI 使用
 */
export function formatHistoryForAI() {
  const history = getHistory();

  if (history.length === 0) {
    return '';
  }

  const lines = history.map((item, index) => {
    const timeAgo = getTimeAgo(item.timestamp);
    const status = item.executed
      ? (item.exitCode === 0 ? '✓' : `✗ 退出码:${item.exitCode}`)
      : '(未执行)';

    let line = `${index + 1}. [${timeAgo}] "${item.userPrompt}" → ${item.command} ${status}`;

    // 如果有输出且命令失败，附加输出摘要
    if (item.output && item.exitCode !== 0) {
      line += `\n   输出: ${item.output.split('\n')[0]}`; // 只取第一行
    }

    return line;
  }).reverse(); // 从旧到新排列

  return `【最近通过 pls 执行的命令】\n${lines.join('\n')}`;
}

/**
 * 计算时间差的友好显示
 */
function getTimeAgo(timestamp) {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  return `${Math.floor(diff / 86400)}天前`;
}

/**
 * 获取历史记录文件路径（供显示用）
 */
export function getHistoryFilePath() {
  return HISTORY_FILE;
}
