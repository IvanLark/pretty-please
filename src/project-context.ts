import fs from 'fs'
import path from 'path'
import { detect as detectPM } from 'detect-package-manager'
import { execSync } from 'child_process'

/**
 * 项目上下文信息
 */
export interface ProjectContext {
  types: string[]           // 项目类型 ['nodejs', 'docker', 'git']
  packageManager?: string   // 包管理器 'pnpm' | 'yarn' | 'bun' | 'npm' | 'uv' | 'poetry' | 'cargo'
  git?: {
    branch: string          // Git 分支名
    status: 'clean' | 'dirty' | 'unknown'
  }
  scripts?: string[]        // 可用脚本（如 package.json scripts）
}

/**
 * 检测项目上下文（优化版：< 30ms）
 * 若未识别到任何特征，返回 null
 */
export async function detectProjectContext(cwd: string): Promise<ProjectContext | null> {
  const types: string[] = []
  let packageManager: string | undefined
  let git: ProjectContext['git'] | undefined
  let scripts: string[] | undefined

  try {
    // 1. 快速读取目录文件列表（同步，< 5ms）
    const files = fs.readdirSync(cwd)

    // 2. 检测项目类型（纯文件检查，< 10ms）
    if (files.includes('package.json')) {
      types.push('nodejs')

      // 检测 Node.js 包管理器
      try {
        packageManager = await detectPM({ cwd })
      } catch {
        // 降级：根据 lock 文件推断
        if (files.includes('pnpm-lock.yaml')) packageManager = 'pnpm'
        else if (files.includes('yarn.lock')) packageManager = 'yarn'
        else if (files.includes('bun.lockb')) packageManager = 'bun'
        else packageManager = 'npm'
      }

      // 读取 package.json scripts（最多 5 个）
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'))
        if (pkg.scripts) {
          scripts = Object.keys(pkg.scripts).slice(0, 5)
        }
      } catch {
        // 忽略读取错误
      }
    }

    // Python
    if (files.some(f => ['pyproject.toml', 'requirements.txt', 'Pipfile', 'uv.lock', 'poetry.lock'].includes(f))) {
      types.push('python')
      if (files.includes('uv.lock')) packageManager = 'uv'
      else if (files.includes('poetry.lock')) packageManager = 'poetry'
      else if (files.includes('Pipfile')) packageManager = 'pipenv'
      else packageManager = 'pip'
    }

    // Rust
    if (files.includes('Cargo.toml')) {
      types.push('rust')
      packageManager = 'cargo'
    }

    // Go
    if (files.includes('go.mod')) {
      types.push('go')
    }

    // Docker
    if (files.some(f => f.includes('docker') || f === 'Dockerfile' || f === 'compose.yaml')) {
      types.push('docker')
    }

    // Makefile
    if (files.includes('Makefile')) {
      types.push('make')
    }

    // 3. Git 检测优化（< 20ms）
    if (files.includes('.git') || fs.existsSync(path.join(cwd, '.git'))) {
      types.push('git')

      try {
        // 读取 .git/HEAD 文件获取分支（最快，< 5ms）
        const headFile = fs.readFileSync(path.join(cwd, '.git/HEAD'), 'utf-8')
        const refMatch = headFile.match(/ref: refs\/heads\/(.+)/)

        if (refMatch) {
          // 正常分支
          git = {
            branch: refMatch[1].trim(),
            status: quickGitStatus(cwd),
          }
        } else {
          // detached HEAD 状态（直接 commit hash）
          const shortHash = headFile.trim().substring(0, 7)
          git = {
            branch: `HEAD (${shortHash})`,
            status: quickGitStatus(cwd),
          }
        }
      } catch {
        // Git 检测失败，只标记类型，不提供详细信息
      }
    }

  } catch (error) {
    // 检测失败，返回空上下文
  }

  const hasContext =
    types.length > 0 ||
    !!packageManager ||
    !!git ||
    (scripts && scripts.length > 0)

  if (!hasContext) {
    return null
  }

  return { types, packageManager, git, scripts }
}

/**
 * Git status 快速检测（带超时）
 */
function quickGitStatus(cwd: string): 'clean' | 'dirty' | 'unknown' {
  try {
    // 使用 git status --porcelain，带超时保护
    const result = execSync('git status --porcelain', {
      cwd,
      stdio: 'pipe',
      timeout: 100,  // 100ms 超时
      encoding: 'utf-8',
    })
    return result.trim() === '' ? 'clean' : 'dirty'
  } catch {
    // 超时或失败，返回 unknown
    return 'unknown'
  }
}

/**
 * 格式化项目上下文为字符串（供 AI 使用）
 * 格式：当前项目: nodejs+docker+git | pnpm | Git分支: main (有改动) | 脚本: dev, build, test
 */
export function formatProjectContext(project: ProjectContext): string {
  if (project.types.length === 0) {
    return ''
  }

  const parts: string[] = []

  // 项目类型
  parts.push(`当前项目: ${project.types.join('+')}`)

  // 包管理器
  if (project.packageManager) {
    parts.push(` | ${project.packageManager}`)
  }

  // Git 信息
  if (project.git) {
    let statusDesc = ''
    if (project.git.status === 'clean') {
      statusDesc = '干净'
    } else if (project.git.status === 'dirty') {
      statusDesc = '有改动'
    } else {
      statusDesc = '未知'
    }
    parts.push(` | Git分支: ${project.git.branch} (${statusDesc})`)
  }

  // 可用脚本
  if (project.scripts && project.scripts.length > 0) {
    parts.push(` | 脚本: ${project.scripts.join(', ')}`)
  }

  return parts.join('')
}
