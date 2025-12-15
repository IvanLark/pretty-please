import os from 'os'
import { execSync } from 'child_process'

/**
 * 系统信息
 */
export interface SystemInfo {
  os: NodeJS.Platform
  arch: string
  shell: string
  packageManager: string
  cwd: string
  user: string
}

/**
 * 检测包管理器
 */
function detectPackageManager(): string {
  const managers = [
    { name: 'brew', command: 'brew' },
    { name: 'apt', command: 'apt-get' },
    { name: 'dnf', command: 'dnf' },
    { name: 'yum', command: 'yum' },
    { name: 'pacman', command: 'pacman' },
    { name: 'zypper', command: 'zypper' },
    { name: 'apk', command: 'apk' },
  ]

  for (const mgr of managers) {
    try {
      execSync(`which ${mgr.command}`, { stdio: 'ignore' })
      return mgr.name
    } catch {
      // 继续检测下一个
    }
  }

  return 'unknown'
}

/**
 * 获取当前 Shell
 */
function getCurrentShell(): string {
  return process.env.SHELL || 'unknown'
}

/**
 * 收集系统信息
 */
export function collectSystemInfo(): SystemInfo {
  return {
    os: os.platform(),
    arch: os.arch(),
    shell: getCurrentShell(),
    packageManager: detectPackageManager(),
    cwd: process.cwd(),
    user: os.userInfo().username,
  }
}

/**
 * 将系统信息格式化为字符串（供 AI 使用）
 */
export function formatSystemInfo(): string {
  const info = collectSystemInfo()
  return `OS: ${info.os}, Arch: ${info.arch}, Shell: ${info.shell}, PkgMgr: ${info.packageManager}, CWD: ${info.cwd}`
}
