/**
 * Shell 历史记录测试数据
 */

// Zsh 扩展格式历史
export const zshExtendedHistory = `\
: 1700000000:0;ls -la
: 1700000010:2;git status
: 1700000020:0;npm install
: 1700000030:1;echo "hello world"
: 1700000040:0;cd ~/projects
`

// Zsh 简单格式历史
export const zshSimpleHistory = `\
ls -la
git status
npm install
echo "hello world"
cd ~/projects
`

// Bash 历史
export const bashHistory = `\
ls -la
git status
npm install
echo "hello world"
cd ~/projects
`

// Fish 历史 (YAML-like)
export const fishHistory = `\
- cmd: ls -la
  when: 1700000000
- cmd: git status
  when: 1700000010
- cmd: npm install
  when: 1700000020
- cmd: echo "hello world"
  when: 1700000030
- cmd: cd ~/projects
  when: 1700000040
`

// PowerShell 历史
export const powerShellHistory = `\
Get-ChildItem
Get-Process
Set-Location C:\\Users
Write-Host "Hello World"
Get-Content file.txt
`

// Shell Hook 记录 (JSONL 格式)
export const shellHookHistory = `\
{"cmd":"ls -la","exit":0,"time":"2024-01-01T10:00:00Z"}
{"cmd":"git status","exit":0,"time":"2024-01-01T10:00:10Z"}
{"cmd":"npm install","exit":1,"time":"2024-01-01T10:00:20Z"}
{"cmd":"echo hello","exit":0,"time":"2024-01-01T10:00:30Z"}
{"cmd":"pls install git","exit":0,"time":"2024-01-01T10:00:40Z"}
`

// 损坏的 JSONL (包含无效行)
export const corruptedShellHookHistory = `\
{"cmd":"ls -la","exit":0,"time":"2024-01-01T10:00:00Z"}
{invalid json line
{"cmd":"git status","exit":0,"time":"2024-01-01T10:00:10Z"}
{"cmd":"npm install","exit":1
{"cmd":"echo hello","exit":0,"time":"2024-01-01T10:00:30Z"}
`
