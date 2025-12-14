import chalk from 'chalk'

/**
 * 原生控制台输出工具函数
 * 用于不需要 Ink 的场景，避免清屏和性能问题
 */

// 主题色
const colors = {
  primary: '#00D9FF',
  secondary: '#A78BFA',
  accent: '#F472B6',
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
  muted: '#6B7280',
}

/**
 * 计算字符串的显示宽度（中文占2个宽度）
 */
export function getDisplayWidth(str) {
  let width = 0
  for (const char of str) {
    if (char.match(/[\u4e00-\u9fff\u3400-\u4dbf\uff00-\uffef\u3000-\u303f]/)) {
      width += 2
    } else {
      width += 1
    }
  }
  return width
}

/**
 * 绘制命令框（原生版本）
 */
export function drawCommandBox(command, title = '生成命令') {
  const lines = command.split('\n')
  const titleWidth = getDisplayWidth(title)
  const maxContentWidth = Math.max(...lines.map(l => getDisplayWidth(l)))
  const boxWidth = Math.max(maxContentWidth + 4, titleWidth + 6, 20)

  const topPadding = boxWidth - titleWidth - 5
  const topBorder = '┌─ ' + title + ' ' + '─'.repeat(topPadding) + '┐'
  const bottomBorder = '└' + '─'.repeat(boxWidth - 2) + '┘'

  console.log(chalk.hex(colors.warning)(topBorder))
  for (const line of lines) {
    const lineWidth = getDisplayWidth(line)
    const padding = ' '.repeat(boxWidth - lineWidth - 4)
    console.log(
      chalk.hex(colors.warning)('│ ') +
      chalk.hex(colors.primary)(line) +
      padding +
      chalk.hex(colors.warning)(' │')
    )
  }
  console.log(chalk.hex(colors.warning)(bottomBorder))
}

/**
 * 格式化耗时
 */
export function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`
  }
  return `${(ms / 1000).toFixed(2)}s`
}

/**
 * 输出分隔线
 */
export function printSeparator(text = '输出', length = 38) {
  const textPart = text ? ` ${text} ` : ''
  const lineLength = Math.max(0, length - textPart.length)
  const leftDashes = '─'.repeat(Math.floor(lineLength / 2))
  const rightDashes = '─'.repeat(Math.ceil(lineLength / 2))
  console.log(chalk.gray(`${leftDashes}${textPart}${rightDashes}`))
}

/**
 * 输出成功消息
 */
export function success(message) {
  console.log(chalk.hex(colors.success)('✓ ' + message))
}

/**
 * 输出错误消息
 */
export function error(message) {
  console.log(chalk.hex(colors.error)('✗ ' + message))
}

/**
 * 输出警告消息
 */
export function warning(message) {
  console.log(chalk.hex(colors.warning)('⚠️  ' + message))
}

/**
 * 输出信息消息
 */
export function info(message) {
  console.log(chalk.hex(colors.info)(message))
}

/**
 * 输出灰色文本
 */
export function muted(message) {
  console.log(chalk.hex(colors.muted)(message))
}

/**
 * 输出标题
 */
export function title(message) {
  console.log(chalk.bold(message))
}

/**
 * 输出主色文本
 */
export function primary(message) {
  console.log(chalk.hex(colors.primary)(message))
}
