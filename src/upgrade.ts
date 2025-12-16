/**
 * 版本升级模块
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import https from 'https'
import http from 'http'
import { execSync, spawn } from 'child_process'
import chalk from 'chalk'
import * as console2 from './utils/console.js'

const REPO = 'IvanLark/pretty-please'
const UPDATE_CHECK_FILE = path.join(os.homedir(), '.please', 'update-check.json')
const CHECK_INTERVAL = 24 * 60 * 60 * 1000 // 24 小时

interface UpdateCheckCache {
  lastCheck: number
  latestVersion: string | null
}

/**
 * 获取最新版本（通过重定向，避免 API 限制）
 * 优先使用 curl（支持代理），fallback 到 https 模块
 */
export async function getLatestVersion(): Promise<string | null> {
  // 先尝试用 curl（支持环境变量代理）
  try {
    const result = execSync(
      `curl -fsSI "https://github.com/${REPO}/releases/latest" 2>/dev/null | grep -i "^location:" | head -1`,
      { timeout: 10000, encoding: 'utf-8' }
    )
    const match = result.match(/\/tag\/([^\s\r\n]+)/)
    if (match) {
      return match[1].trim()
    }
  } catch {
    // curl 失败，尝试 https 模块
  }

  // fallback: 使用 https 模块
  return new Promise((resolve) => {
    const req = https.request(
      `https://github.com/${REPO}/releases/latest`,
      { method: 'HEAD' },
      (res) => {
        const location = res.headers.location
        if (location) {
          const match = location.match(/\/tag\/([^/]+)$/)
          if (match) {
            resolve(match[1])
            return
          }
        }
        resolve(null)
      }
    )
    req.on('error', () => resolve(null))
    req.setTimeout(5000, () => {
      req.destroy()
      resolve(null)
    })
    req.end()
  })
}

/**
 * 比较版本号
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
export function compareVersions(v1: string, v2: string): number {
  const normalize = (v: string) => v.replace(/^v/, '').split('.').map(Number)
  const parts1 = normalize(v1)
  const parts2 = normalize(v2)

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0
    const p2 = parts2[i] || 0
    if (p1 > p2) return 1
    if (p1 < p2) return -1
  }
  return 0
}

/**
 * 检测当前平台
 */
export function detectPlatform(): { os: string; arch: string; artifact: string } | null {
  const platform = os.platform()
  const arch = os.arch()

  if (platform === 'darwin') {
    if (arch === 'arm64') {
      return { os: 'darwin', arch: 'arm64', artifact: 'pls-darwin-arm64' }
    } else if (arch === 'x64') {
      return { os: 'darwin', arch: 'x64', artifact: 'pls-darwin-x64' }
    }
  } else if (platform === 'linux') {
    if (arch === 'arm64') {
      return { os: 'linux', arch: 'arm64', artifact: 'pls-linux-arm64' }
    } else if (arch === 'x64') {
      return { os: 'linux', arch: 'x64', artifact: 'pls-linux-x64' }
    }
  } else if (platform === 'win32') {
    if (arch === 'x64') {
      return { os: 'windows', arch: 'x64', artifact: 'pls-windows-x64.exe' }
    }
  }

  return null
}

/**
 * 获取当前可执行文件路径
 */
export function getCurrentExecutablePath(): string {
  return process.execPath
}

/**
 * 读取更新检查缓存
 */
function readUpdateCache(): UpdateCheckCache | null {
  try {
    if (fs.existsSync(UPDATE_CHECK_FILE)) {
      const data = fs.readFileSync(UPDATE_CHECK_FILE, 'utf-8')
      return JSON.parse(data)
    }
  } catch {
    // 忽略错误
  }
  return null
}

/**
 * 写入更新检查缓存
 */
function writeUpdateCache(cache: UpdateCheckCache): void {
  try {
    const dir = path.dirname(UPDATE_CHECK_FILE)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(UPDATE_CHECK_FILE, JSON.stringify(cache, null, 2))
  } catch {
    // 忽略错误
  }
}

/**
 * 检查是否有新版本（带缓存）
 */
export async function checkForUpdates(
  currentVersion: string,
  force = false
): Promise<{ hasUpdate: boolean; latestVersion: string | null }> {
  const cache = readUpdateCache()
  const now = Date.now()

  // 如果不是强制检查，且缓存有效，使用缓存
  if (!force && cache && now - cache.lastCheck < CHECK_INTERVAL) {
    if (cache.latestVersion) {
      const hasUpdate = compareVersions(cache.latestVersion, currentVersion) > 0
      return { hasUpdate, latestVersion: cache.latestVersion }
    }
    return { hasUpdate: false, latestVersion: null }
  }

  // 获取最新版本
  const latestVersion = await getLatestVersion()

  // 更新缓存
  writeUpdateCache({ lastCheck: now, latestVersion })

  if (latestVersion) {
    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0
    return { hasUpdate, latestVersion }
  }

  return { hasUpdate: false, latestVersion: null }
}

/**
 * 显示更新提示
 */
export function showUpdateNotice(currentVersion: string, latestVersion: string): void {
  // 使用简洁的单行提示，避免复杂的对齐问题
  console.log('')
  console2.warning(`发现新版本: ${currentVersion} → ${chalk.green(latestVersion)}，运行 ${chalk.cyan('pls upgrade')} 更新`)
}

/**
 * 下载文件（使用 curl，支持代理）
 */
function downloadFile(url: string, dest: string, onProgress?: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    // 使用 curl 下载，支持代理和进度显示
    const args = ['-fSL', '--progress-bar', '-o', dest, url]
    const curl = spawn('curl', args, { stdio: ['ignore', 'pipe', 'pipe'] })

    let lastPercent = 0

    // curl 进度输出在 stderr
    curl.stderr?.on('data', (data: Buffer) => {
      const str = data.toString()
      // 解析 curl 进度条输出，格式如: "###                                               6.2%"
      const match = str.match(/(\d+\.?\d*)%/)
      if (match && onProgress) {
        const percent = Math.round(parseFloat(match[1]))
        if (percent > lastPercent) {
          lastPercent = percent
          onProgress(percent)
        }
      }
    })

    curl.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`curl 退出码: ${code}`))
      }
    })

    curl.on('error', (err) => {
      reject(err)
    })
  })
}

/**
 * 检测是否是 Bun 编译的二进制
 */
export function isBunBinary(): boolean {
  const execPath = process.execPath.toLowerCase()
  // npm/node 运行时，execPath 会包含 node
  // tsx 开发时，execPath 会包含 node 或 tsx
  // Bun 编译的二进制，execPath 就是程序自己的路径
  return !execPath.includes('node') && !execPath.includes('bun')
}

/**
 * 执行升级
 */
export async function performUpgrade(currentVersion: string): Promise<boolean> {
  console.log('')
  console2.title('🚀 Pretty-Please 升级')
  console2.muted('━'.repeat(40))

  // 检测平台
  console2.info('检测系统平台...')
  const platform = detectPlatform()
  if (!platform) {
    console2.error('不支持的平台')
    return false
  }
  console2.success(`平台: ${platform.os} ${platform.arch}`)

  // 获取最新版本
  console2.info('获取最新版本...')
  const latestVersion = await getLatestVersion()
  if (!latestVersion) {
    console2.error('无法获取最新版本')
    return false
  }

  // 比较版本
  if (compareVersions(latestVersion, currentVersion) <= 0) {
    console2.success(`当前已是最新版本 (${currentVersion})`)
    console.log('')
    return true
  }

  console2.success(`发现新版本: ${currentVersion} → ${latestVersion}`)

  // 检查安装方式
  if (!isBunBinary()) {
    // 如果是通过 npm/node 运行的，提示使用 npm 更新
    console.log('')
    console2.warning('检测到你是通过 npm 安装的，请使用以下命令更新:')
    console.log('')
    console.log(chalk.cyan('  npm update -g @yivan-lab/pretty-please'))
    console.log('')
    return false
  }

  // 获取当前可执行文件路径
  const execPath = getCurrentExecutablePath()
  console2.info(`当前程序: ${execPath}`)

  // 下载新版本
  const downloadUrl = `https://github.com/${REPO}/releases/download/${latestVersion}/${platform.artifact}`
  const tempFile = path.join(os.tmpdir(), `pls-upgrade-${Date.now()}`)

  console2.info('下载中...')

  try {
    let lastPercent = 0
    await downloadFile(downloadUrl, tempFile, (percent) => {
      if (percent - lastPercent >= 10 || percent === 100) {
        process.stdout.write(`\r${chalk.hex('#00D9FF')('[INFO]')} 下载中... ${percent}%`)
        lastPercent = percent
      }
    })
    console.log('') // 换行
    console2.success('下载完成')
  } catch (err: any) {
    console2.error(`下载失败: ${err.message}`)
    return false
  }

  // 替换当前程序
  console2.info('安装新版本...')

  try {
    // 设置可执行权限
    fs.chmodSync(tempFile, 0o755)

    // 备份旧版本
    const backupPath = `${execPath}.backup`
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath)
    }

    // Windows 需要特殊处理
    if (platform.os === 'windows') {
      // Windows 上无法替换正在运行的程序，创建一个批处理脚本
      const batchScript = `@echo off
timeout /t 1 /nobreak >nul
move /y "${execPath}" "${backupPath}" >nul
move /y "${tempFile}" "${execPath}" >nul
del "${backupPath}" >nul 2>&1
echo.
echo 升级完成! ${currentVersion} → ${latestVersion}
echo.
pause
`
      const batchPath = path.join(os.tmpdir(), 'pls-upgrade.bat')
      fs.writeFileSync(batchPath, batchScript)

      console.log('')
      console2.warning('Windows 上需要额外步骤完成升级:')
      console.log('')
      console.log(chalk.cyan(`  请运行: ${batchPath}`))
      console.log('')
      return true
    }

    // Unix 系统：直接替换
    fs.renameSync(execPath, backupPath)
    fs.renameSync(tempFile, execPath)

    // 删除备份
    try {
      fs.unlinkSync(backupPath)
    } catch {
      // 忽略删除备份失败
    }

    console2.muted('━'.repeat(40))
    console2.success(`升级成功: ${currentVersion} → ${latestVersion}`)
    console.log('')

    return true
  } catch (err: any) {
    console2.error(`安装失败: ${err.message}`)

    // 尝试清理
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile)
      }
    } catch {}

    // 如果是权限问题，提示使用 sudo
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      console.log('')
      console2.warning('权限不足，请尝试使用 sudo:')
      console.log('')
      console.log(chalk.cyan('  sudo pls upgrade'))
      console.log('')
    }

    return false
  }
}
