#!/usr/bin/env node

/**
 * 构建后处理脚本
 * 1. 修复 shebang：tsx → node
 * 2. 修复 package.json 路径：../ → ../../
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.join(__dirname, '..')

const targetFile = path.join(rootDir, 'dist/bin/pls.js')

if (!fs.existsSync(targetFile)) {
  console.error('❌ dist/bin/pls.js 不存在，请先运行 tsc')
  process.exit(1)
}

let content = fs.readFileSync(targetFile, 'utf-8')

// 1. 修复 shebang
content = content.replace(/^#!\/usr\/bin\/env tsx/, '#!/usr/bin/env node')

// 2. 修复 package.json 路径（从 dist/bin/ 往上两级）
content = content.replace(
  /join\(__dirname, ['"]\.\.\/package\.json['"]\)/g,
  "join(__dirname, '../../package.json')"
)

fs.writeFileSync(targetFile, content)

console.log('✅ 后处理完成：')
console.log('   - shebang: tsx → node')
console.log('   - package.json 路径: ../ → ../../')
