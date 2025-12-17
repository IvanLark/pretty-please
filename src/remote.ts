/**
 * 远程执行器模块
 * 通过 SSH 在远程服务器上执行命令
 */

import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import readline from 'readline'
import chalk from 'chalk'
import { CONFIG_DIR, getConfig, saveConfig, type RemoteConfig, type RemoteSysInfo } from './config.js'
import { getCurrentTheme } from './ui/theme.js'

// 获取主题颜色
function getColors() {
  const theme = getCurrentTheme()
  return {
    primary: theme.primary,
    secondary: theme.secondary,
    success: theme.success,
    error: theme.error,
    warning: theme.warning,
    muted: theme.text.muted,
  }
}

// 远程服务器数据目录
const REMOTES_DIR = path.join(CONFIG_DIR, 'remotes')

// SSH ControlMaster 配置
const SSH_CONTROL_PERSIST = '10m'  // 连接保持 10 分钟

/**
 * 确保远程服务器数据目录存在
 */
function ensureRemotesDir(): void {
  if (!fs.existsSync(REMOTES_DIR)) {
    fs.mkdirSync(REMOTES_DIR, { recursive: true })
  }
}

/**
 * 获取远程服务器数据目录
 */
function getRemoteDataDir(name: string): string {
  return path.join(REMOTES_DIR, name)
}

/**
 * 获取 SSH ControlMaster socket 路径
 */
function getSSHSocketPath(name: string): string {
  return path.join(REMOTES_DIR, name, 'ssh.sock')
}

/**
 * 检查 ControlMaster 连接是否存在
 */
function isControlMasterActive(name: string): boolean {
  const socketPath = getSSHSocketPath(name)
  return fs.existsSync(socketPath)
}

/**
 * 关闭 ControlMaster 连接
 */
export async function closeControlMaster(name: string): Promise<void> {
  const remote = getRemote(name)
  if (!remote) return

  const socketPath = getSSHSocketPath(name)
  if (!fs.existsSync(socketPath)) return

  // 使用 ssh -O exit 关闭 master 连接
  const args = ['-O', 'exit', '-o', `ControlPath=${socketPath}`, `${remote.user}@${remote.host}`]

  return new Promise((resolve) => {
    const child = spawn('ssh', args, { stdio: 'ignore' })
    child.on('close', () => {
      // 确保 socket 文件被删除
      if (fs.existsSync(socketPath)) {
        try {
          fs.unlinkSync(socketPath)
        } catch {
          // 忽略错误
        }
      }
      resolve()
    })
    child.on('error', () => resolve())
  })
}

/**
 * 确保远程服务器数据目录存在
 */
function ensureRemoteDataDir(name: string): void {
  const dir = getRemoteDataDir(name)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

// ================== 远程服务器管理 ==================

/**
 * 获取所有远程服务器配置
 */
export function getRemotes(): Record<string, RemoteConfig> {
  const config = getConfig()
  return config.remotes || {}
}

/**
 * 获取单个远程服务器配置
 */
export function getRemote(name: string): RemoteConfig | null {
  const remotes = getRemotes()
  return remotes[name] || null
}

/**
 * 解析 user@host:port 格式
 */
function parseHostString(hostStr: string): { user: string; host: string; port: number } {
  let user = ''
  let host = hostStr
  let port = 22

  // 解析 user@host
  if (hostStr.includes('@')) {
    const atIndex = hostStr.indexOf('@')
    user = hostStr.substring(0, atIndex)
    host = hostStr.substring(atIndex + 1)
  }

  // 解析 host:port
  if (host.includes(':')) {
    const colonIndex = host.lastIndexOf(':')
    const portStr = host.substring(colonIndex + 1)
    const parsedPort = parseInt(portStr, 10)
    if (!isNaN(parsedPort)) {
      port = parsedPort
      host = host.substring(0, colonIndex)
    }
  }

  return { user, host, port }
}

/**
 * 添加远程服务器
 */
export function addRemote(
  name: string,
  hostStr: string,
  options: { key?: string; password?: boolean } = {}
): void {
  // 验证名称
  if (!name || !name.trim()) {
    throw new Error('服务器名称不能为空')
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error('服务器名称只能包含字母、数字、下划线和连字符')
  }

  // 解析 host 字符串
  const { user, host, port } = parseHostString(hostStr)

  if (!host) {
    throw new Error('主机地址不能为空')
  }
  if (!user) {
    throw new Error('用户名不能为空，请使用 user@host 格式')
  }

  // 验证密钥文件
  if (options.key) {
    const keyPath = options.key.replace(/^~/, os.homedir())
    if (!fs.existsSync(keyPath)) {
      throw new Error(`密钥文件不存在: ${options.key}`)
    }
  }

  const config = getConfig()
  if (!config.remotes) {
    config.remotes = {}
  }

  // 检查是否已存在
  if (config.remotes[name]) {
    throw new Error(`服务器 "${name}" 已存在，请使用其他名称或先删除`)
  }

  config.remotes[name] = {
    host,
    user,
    port,
    key: options.key,
    password: options.password,
  }

  saveConfig(config)

  // 创建数据目录
  ensureRemoteDataDir(name)
}

/**
 * 删除远程服务器
 */
export function removeRemote(name: string): boolean {
  const config = getConfig()
  if (!config.remotes || !config.remotes[name]) {
    return false
  }

  delete config.remotes[name]
  saveConfig(config)

  // 删除数据目录
  const dataDir = getRemoteDataDir(name)
  if (fs.existsSync(dataDir)) {
    fs.rmSync(dataDir, { recursive: true })
  }

  return true
}

/**
 * 显示所有远程服务器
 */
export function displayRemotes(): void {
  const remotes = getRemotes()
  const config = getConfig()
  const colors = getColors()
  const names = Object.keys(remotes)

  console.log('')

  if (names.length === 0) {
    console.log(chalk.gray('  暂无远程服务器'))
    console.log('')
    console.log(chalk.gray('  使用 pls remote add <name> <user@host> 添加服务器'))
    console.log('')
    return
  }

  console.log(chalk.bold('远程服务器:'))
  console.log(chalk.gray('━'.repeat(60)))

  for (const name of names) {
    const remote = remotes[name]
    const authType = remote.password ? '密码' : remote.key ? '密钥' : '默认密钥'
    const isDefault = config.defaultRemote === name

    // 服务器名称，如果是默认则显示标记
    if (isDefault) {
      console.log(`  ${chalk.hex(colors.primary)(name)} ${chalk.hex(colors.success)('(default)')}`)
    } else {
      console.log(`  ${chalk.hex(colors.primary)(name)}`)
    }
    console.log(`    ${chalk.gray('→')} ${remote.user}@${remote.host}:${remote.port}`)
    console.log(`    ${chalk.gray('认证:')} ${authType}${remote.key ? ` (${remote.key})` : ''}`)

    // 显示工作目录
    if (remote.workDir) {
      console.log(`    ${chalk.gray('工作目录:')} ${remote.workDir}`)
    }

    // 检查是否有缓存的系统信息
    const sysInfo = getRemoteSysInfo(name)
    if (sysInfo) {
      console.log(`    ${chalk.gray('系统:')} ${sysInfo.os} ${sysInfo.osVersion} (${sysInfo.shell})`)
    }

    console.log('')
  }

  console.log(chalk.gray('━'.repeat(60)))
  console.log(chalk.gray('使用: pls -r <name> <prompt> 在远程服务器执行'))
  console.log('')
}

/**
 * 设置远程服务器工作目录
 */
export function setRemoteWorkDir(name: string, workDir: string): void {
  const config = getConfig()
  if (!config.remotes || !config.remotes[name]) {
    throw new Error(`远程服务器 "${name}" 不存在`)
  }

  // 清除工作目录
  if (!workDir || workDir === '-') {
    delete config.remotes[name].workDir
  } else {
    config.remotes[name].workDir = workDir
  }

  saveConfig(config)
}

/**
 * 获取远程服务器工作目录
 */
export function getRemoteWorkDir(name: string): string | undefined {
  const remote = getRemote(name)
  return remote?.workDir
}

// ================== SSH 执行 ==================

/**
 * SSH 执行选项
 */
export interface SSHExecOptions {
  timeout?: number      // 超时时间（毫秒）
  stdin?: string        // 输入
  onStdout?: (data: string) => void
  onStderr?: (data: string) => void
}

/**
 * SSH 执行结果
 */
export interface SSHExecResult {
  exitCode: number
  stdout: string
  stderr: string
  output: string       // stdout + stderr
}

/**
 * 读取密码（交互式）
 */
async function readPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    // 隐藏输入
    const stdin = process.stdin
    if (stdin.isTTY) {
      stdin.setRawMode(true)
    }

    process.stdout.write(prompt)

    let password = ''

    stdin.on('data', (char: Buffer) => {
      const c = char.toString()
      switch (c) {
        case '\n':
        case '\r':
        case '\u0004': // Ctrl+D
          if (stdin.isTTY) {
            stdin.setRawMode(false)
          }
          console.log('')
          rl.close()
          resolve(password)
          break
        case '\u0003': // Ctrl+C
          if (stdin.isTTY) {
            stdin.setRawMode(false)
          }
          console.log('')
          rl.close()
          process.exit(0)
        case '\u007F': // Backspace
          if (password.length > 0) {
            password = password.slice(0, -1)
            process.stdout.write('\b \b')
          }
          break
        default:
          password += c
          process.stdout.write('*')
          break
      }
    })
  })
}

/**
 * 构建 SSH 命令参数
 * @param remote 远程服务器配置
 * @param command 要执行的命令
 * @param options.password 密码（用于首次建立连接）
 * @param options.socketPath ControlMaster socket 路径
 * @param options.isMaster 是否建立 master 连接
 */
function buildSSHArgs(
  remote: RemoteConfig,
  command: string,
  options: { password?: string; socketPath?: string; isMaster?: boolean } = {}
): { cmd: string; args: string[] } {
  const args: string[] = []

  // 使用 sshpass 处理密码认证（仅在建立新连接时需要）
  let cmd = 'ssh'
  if (options.password) {
    cmd = 'sshpass'
    args.push('-p', options.password, 'ssh')
  }

  // SSH 选项
  args.push('-o', 'StrictHostKeyChecking=accept-new')
  args.push('-o', 'ConnectTimeout=10')

  // ControlMaster 选项
  if (options.socketPath) {
    if (options.isMaster) {
      // 建立 master 连接
      args.push('-o', 'ControlMaster=yes')
      args.push('-o', `ControlPersist=${SSH_CONTROL_PERSIST}`)
    } else {
      // 复用已有连接
      args.push('-o', 'ControlMaster=no')
    }
    args.push('-o', `ControlPath=${options.socketPath}`)
  }

  // 端口
  if (remote.port !== 22) {
    args.push('-p', remote.port.toString())
  }

  // 密钥
  if (remote.key) {
    const keyPath = remote.key.replace(/^~/, os.homedir())
    args.push('-i', keyPath)
  }

  // 目标
  args.push(`${remote.user}@${remote.host}`)

  // 命令
  args.push(command)

  return { cmd, args }
}

/**
 * 执行 SSH 命令的内部实现
 */
function spawnSSH(
  cmd: string,
  args: string[],
  options: SSHExecOptions
): Promise<SSHExecResult> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''

    const child = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // 超时处理
    let timeoutId: NodeJS.Timeout | null = null
    if (options.timeout) {
      timeoutId = setTimeout(() => {
        child.kill('SIGTERM')
        reject(new Error(`命令执行超时 (${options.timeout}ms)`))
      }, options.timeout)
    }

    child.stdout.on('data', (data) => {
      const str = data.toString()
      stdout += str
      options.onStdout?.(str)
    })

    child.stderr.on('data', (data) => {
      const str = data.toString()
      stderr += str
      options.onStderr?.(str)
    })

    // 写入 stdin
    if (options.stdin) {
      child.stdin.write(options.stdin)
      child.stdin.end()
    }

    child.on('close', (code) => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      resolve({
        exitCode: code || 0,
        stdout,
        stderr,
        output: stdout + stderr,
      })
    })

    child.on('error', (err) => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      // 检查是否是 sshpass 未安装
      if (err.message.includes('ENOENT') && cmd === 'sshpass') {
        reject(new Error('密码认证需要安装 sshpass，请运行: brew install hudochenkov/sshpass/sshpass'))
      } else {
        reject(err)
      }
    })
  })
}

/**
 * 通过 SSH 执行命令
 * 使用 ControlMaster 实现连接复用，密码认证只需输入一次
 */
export async function sshExec(
  name: string,
  command: string,
  options: SSHExecOptions = {}
): Promise<SSHExecResult> {
  const remote = getRemote(name)
  if (!remote) {
    throw new Error(`远程服务器 "${name}" 不存在`)
  }

  // 确保数据目录存在
  ensureRemoteDataDir(name)

  const socketPath = getSSHSocketPath(name)
  const masterActive = isControlMasterActive(name)

  // 如果需要密码认证且没有活跃的 master 连接
  if (remote.password && !masterActive) {
    // 读取密码并建立 master 连接
    const password = await readPassword(`${name} 密码: `)

    // 建立 master 连接（执行一个简单命令来建立连接）
    const { cmd: masterCmd, args: masterArgs } = buildSSHArgs(remote, 'true', {
      password,
      socketPath,
      isMaster: true,
    })

    try {
      const masterResult = await spawnSSH(masterCmd, masterArgs, { timeout: 30000 })
      if (masterResult.exitCode !== 0) {
        throw new Error(`SSH 连接失败: ${masterResult.stderr}`)
      }
    } catch (err) {
      throw err
    }
  }

  // 使用 ControlMaster 连接（或直接连接）执行命令
  const useSocket = remote.password || isControlMasterActive(name)
  const { cmd, args } = buildSSHArgs(remote, command, {
    socketPath: useSocket ? socketPath : undefined,
    isMaster: false,
  })

  return spawnSSH(cmd, args, options)
}

/**
 * 测试远程连接
 */
export async function testRemoteConnection(name: string): Promise<{ success: boolean; message: string }> {
  const colors = getColors()

  try {
    const result = await sshExec(name, 'echo "pls-connection-test"', { timeout: 15000 })

    if (result.exitCode === 0 && result.stdout.includes('pls-connection-test')) {
      return { success: true, message: chalk.hex(colors.success)('连接成功') }
    } else {
      return { success: false, message: chalk.hex(colors.error)(`连接失败，退出码: ${result.exitCode}`) }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, message: chalk.hex(colors.error)(`连接失败: ${message}`) }
  }
}

// ================== 系统信息采集 ==================

/**
 * 获取缓存的远程系统信息
 */
export function getRemoteSysInfo(name: string): RemoteSysInfo | null {
  const dataDir = getRemoteDataDir(name)
  const sysInfoPath = path.join(dataDir, 'sysinfo.json')

  if (!fs.existsSync(sysInfoPath)) {
    return null
  }

  try {
    const content = fs.readFileSync(sysInfoPath, 'utf-8')
    return JSON.parse(content) as RemoteSysInfo
  } catch {
    return null
  }
}

/**
 * 保存远程系统信息
 */
function saveRemoteSysInfo(name: string, sysInfo: RemoteSysInfo): void {
  ensureRemoteDataDir(name)
  const dataDir = getRemoteDataDir(name)
  const sysInfoPath = path.join(dataDir, 'sysinfo.json')
  fs.writeFileSync(sysInfoPath, JSON.stringify(sysInfo, null, 2))
}

/**
 * 采集远程系统信息
 */
export async function collectRemoteSysInfo(name: string, force: boolean = false): Promise<RemoteSysInfo> {
  // 检查缓存
  if (!force) {
    const cached = getRemoteSysInfo(name)
    if (cached) {
      // 检查缓存是否过期（7天）
      const cachedAt = new Date(cached.cachedAt)
      const now = new Date()
      const daysDiff = (now.getTime() - cachedAt.getTime()) / (1000 * 60 * 60 * 24)
      if (daysDiff < 7) {
        return cached
      }
    }
  }

  // 采集系统信息
  const collectScript = `
echo "OS:$(uname -s)"
echo "OS_VERSION:$(uname -r)"
echo "SHELL:$(basename "$SHELL")"
echo "HOSTNAME:$(hostname)"
`.trim()

  const result = await sshExec(name, collectScript, { timeout: 30000 })

  if (result.exitCode !== 0) {
    throw new Error(`无法采集系统信息: ${result.stderr}`)
  }

  // 解析输出
  const lines = result.stdout.split('\n')
  const info: Record<string, string> = {}

  for (const line of lines) {
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim()
      const value = line.substring(colonIndex + 1).trim()
      info[key] = value
    }
  }

  const sysInfo: RemoteSysInfo = {
    os: info['OS'] || 'unknown',
    osVersion: info['OS_VERSION'] || 'unknown',
    shell: info['SHELL'] || 'bash',
    hostname: info['HOSTNAME'] || 'unknown',
    cachedAt: new Date().toISOString(),
  }

  // 保存缓存
  saveRemoteSysInfo(name, sysInfo)

  return sysInfo
}

/**
 * 格式化远程系统信息供 AI 使用
 */
export function formatRemoteSysInfoForAI(name: string, sysInfo: RemoteSysInfo): string {
  const remote = getRemote(name)
  if (!remote) return ''

  let info = `【远程服务器信息】
服务器: ${name} (${remote.user}@${remote.host})
操作系统: ${sysInfo.os} ${sysInfo.osVersion}
Shell: ${sysInfo.shell}
主机名: ${sysInfo.hostname}`

  // 如果有工作目录，告知 AI 当前工作目录（执行时会自动 cd）
  if (remote.workDir) {
    info += `\n当前工作目录: ${remote.workDir}`
  }

  return info
}

// ================== 批量远程执行 ==================

/**
 * 批量远程执行结果
 */
export interface BatchRemoteResult {
  server: string
  command: string
  exitCode: number
  stdout: string
  stderr: string
  output: string
  sysInfo: RemoteSysInfo
}

/**
 * 批量远程执行命令
 * 每个服务器单独生成命令，支持异构环境
 */
export async function generateBatchRemoteCommands(
  serverNames: string[],
  userPrompt: string,
  options: { debug?: boolean } = {}
): Promise<Array<{ server: string; command: string; sysInfo: RemoteSysInfo }>> {
  const { generateMultiStepCommand } = await import('./multi-step.js')
  const { fetchRemoteShellHistory } = await import('./remote-history.js')

  // 1. 验证所有服务器是否存在
  const invalidServers = serverNames.filter(name => !getRemote(name))
  if (invalidServers.length > 0) {
    throw new Error(`以下服务器不存在: ${invalidServers.join(', ')}`)
  }

  // 2. 并发采集所有服务器的系统信息
  const servers = await Promise.all(
    serverNames.map(async (name) => ({
      name,
      sysInfo: await collectRemoteSysInfo(name),
      shellHistory: await fetchRemoteShellHistory(name),
    }))
  )

  // 3. 并发为每个服务器生成命令
  const commandResults = await Promise.all(
    servers.map(async (server) => {
      const remoteContext: any = {
        name: server.name,
        sysInfo: server.sysInfo,
        shellHistory: server.shellHistory,
      }

      const result = await generateMultiStepCommand(
        userPrompt,
        [],  // 批量执行不支持多步骤，只生成单个命令
        { debug: options.debug, remoteContext }
      )

      return {
        server: server.name,
        command: result.stepData.command,
        sysInfo: server.sysInfo,
      }
    })
  )

  return commandResults
}

/**
 * 执行批量远程命令
 */
export async function executeBatchRemoteCommands(
  commands: Array<{ server: string; command: string; sysInfo: RemoteSysInfo }>
): Promise<BatchRemoteResult[]> {
  // 并发执行所有命令
  const results = await Promise.all(
    commands.map(async ({ server, command, sysInfo }) => {
      let stdout = ''
      let stderr = ''

      const result = await sshExec(server, command, {
        onStdout: (data) => { stdout += data },
        onStderr: (data) => { stderr += data },
      })

      return {
        server,
        command,
        exitCode: result.exitCode,
        stdout,
        stderr,
        output: stdout + stderr,
        sysInfo,
      }
    })
  )

  return results
}
