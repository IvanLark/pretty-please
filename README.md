# Pretty Please (pls)

<p align="center">
  <strong>"Pretty please?" — 用最礼貌的方式，让 AI 帮你干活</strong>
</p>

> `please 查看当前目录` — 就像在跟电脑说话一样自然

<p align="center">
  <img src="https://github.com/user-attachments/assets/e06a562c-f899-41d2-8870-d38ebc249904" alt="Pretty Please Demo" width="800">
</p>

## 这是啥？

忘了 Shell 命令怎么写？没关系，用人话告诉 `pls` 你想干嘛就行。

**pretty please** 是英语里"拜托了"的意思，而我们的命令就叫 `pls` / `please`，所以每次执行命令都像是在礼貌地请求：

```bash
please 帮我压缩这个文件夹
pls 找出占用 8080 端口的进程
pls 在服务器上重启 nginx
```

AI 生成命令 → 你确认 → 执行 → 搞定。

## ✨ 命令打错了？直接 `pls` 就行

像 [thefuck](https://github.com/nvbn/thefuck) 一样，命令执行失败后，直接输入 `pls` 让 AI 自动修复：

```bash
❯ python --version
zsh: command not found: python

❯ pls  # ← 就这么简单！
✓ 生成命令: python3 --version
Python 3.9.6
```

```bash
❯ git pus origin main
git: 'pus' is not a git command. See 'git --help'.

❯ pls
✓ 生成命令: git push origin main
Enumerating objects: 5, done.
...
```

不用说"修复上一条命令"，不用重新输入，**直接 `pls`，AI 自动检测失败的命令并生成正确版本**。

## 为什么用这个？

- **命令打错了？** 直接 `pls` 自动修复，像 thefuck 一样方便，但更智能
- 记不住 `tar` 的一堆参数
- 想批量处理文件但懒得写脚本
- 需要在多台服务器上执行同样的操作
- 想问问某个命令怎么用

## 能干啥？

**核心特性：**
- **自动修复错误** - 命令失败后直接 `pls`，AI 自动检测并生成正确命令（像 thefuck，但更智能）
- **自然语言转命令** - 生成前让你确认或编辑
- **智能多步任务** - 复杂任务自动拆分，每步基于上一步的结果
- **错误恢复重试** - 命令失败了 AI 会分析原因并调整策略

**高级功能：**
- **远程执行** - 通过 SSH 在服务器上跑命令，支持批量（`-r server1,server2,server3`）
- **对话模式** - `pls chat grep 怎么用`，随时问问题
- **命令别名** - 把常用操作存成快捷方式
- **主题系统** - 7 个内置主题 + 自定义主题
- **自动升级** - `pls upgrade` 一键更新

## 安装

**方式一：npm（推荐）**

```bash
npm i -g @yivan-lab/pretty-please
```

**方式二：一键脚本（无需 Node.js）**

```bash
# Linux / macOS
curl -fsSL https://raw.githubusercontent.com/IvanLark/pretty-please/main/install.sh | bash

# Windows PowerShell
irm https://raw.githubusercontent.com/IvanLark/pretty-please/main/install.ps1 | iex
```

支持平台：Linux (x64/arm64) / macOS (Intel/Apple Silicon) / Windows x64

## 快速开始

**第一步：配置 API**

```bash
pls config
```

按提示输入你的 AI API 信息（支持 OpenAI、DeepSeek、Claude 等）

**第二步：开始用**

```bash
pls 查看当前目录
pls 找出大于100MB的文件
pls chat grep 怎么用
```

## 使用示例

### 基础用法

最简单的方式，直接说你想干啥：

```bash
pls 查看当前目录
pls 安装 git
pls 找出占用 8080 端口的进程
pls 删除所有 .DS_Store 文件
```

AI 生成命令，你确认后执行。

### 多步骤任务

复杂的任务 AI 会自动拆分，每步基于上一步的结果：

```bash
pls 找出大于100MB的日志文件并压缩
```

**执行流程：**
1. 步骤 1：`find . -name '*.log' -size +100M` 找到了 `app.log` 和 `system.log`
2. 步骤 2：根据上一步的结果，生成 `tar -czf logs.tar.gz app.log system.log`
3. 完成！

### 引用历史

AI 记得你之前干了啥：

```bash
pls 创建一个 test.txt
pls 删除刚才的文件  # AI 知道你说的是 test.txt

# 或者
mkdir my-project
cd my-project
pls 在这个目录初始化 git 仓库  # AI 知道当前上下文
```

### 错误恢复

命令失败了 AI 会分析并重试：

```bash
pls 把 test.zip 移动到 a、b、c 三个文件夹
```

**执行过程：**
1. `mv test.zip a/` ✓ 成功
2. `mv test.zip b/` ✗ 失败（文件已被移走）
3. AI 分析错误，改用复制：`cp a/test.zip b/ && cp a/test.zip c/` ✓ 成功

### 编辑命令

生成的命令不满意？按 `E` 编辑：

```
┌─ 生成命令 ───────┐
│ ls -la           │
└──────────────────┘

执行？ [回车执行 / E 编辑 / Esc 取消]

# 按 E 后进入编辑
> ls -l█  ← 可以修改

[回车执行 / Esc 返回]
```

或者用 `auto` 模式，自动进入编辑：

```bash
pls config set editMode auto
```

### 对话模式

想问问命令怎么用：

```bash
pls chat tar 命令怎么用
pls chat grep 和 awk 有什么区别
pls chat 刚才那个命令是干嘛的？  # 会解释你最近执行的命令
```

### 远程执行

在服务器上跑命令：

```bash
# 添加服务器
pls remote add myserver root@192.168.1.100

# 远程执行
pls -r myserver 查看磁盘使用情况
pls -r myserver 重启 nginx

# 批量执行（在多台服务器上同时跑）
pls -r web1,web2,web3 查看 nginx 状态
```

### 命令别名

把常用操作存成快捷方式：

```bash
# 添加别名
pls alias add disk "查看磁盘使用情况，按使用率排序"

# 使用
pls disk

# 带参数的别名
pls alias add taillog "查看 {{file}} 的最后 {{lines:20}} 行"
pls taillog --file=/var/log/system.log --lines=50
```

## 更多功能

### 历史记录

```bash
pls history              # 命令历史
pls history chat         # 对话历史
pls history shell        # Shell 历史（需要启用 Shell Hook）

pls history clear        # 清空命令历史
pls history chat clear   # 清空对话历史
```

### Shell Hook

记录你在终端执行的所有命令，让 AI 更了解上下文：

```bash
pls hook install    # 安装 hook
pls hook status     # 查看状态
pls hook uninstall  # 卸载 hook
```

支持 zsh / bash / PowerShell。

### 主题

7 个内置主题 + 自定义主题：

```bash
pls theme              # 查看当前主题
pls theme list         # 查看所有主题
pls theme nord         # 切换主题
```

**内置主题：** dark、light、nord、dracula、retro、contrast、monokai

**自定义主题：**

```bash
pls theme create my-theme --display-name "我的主题"
vim ~/.please/themes/my-theme.json  # 编辑主题配置
pls theme validate ~/.please/themes/my-theme.json  # 验证
pls theme my-theme  # 应用
```

### 远程执行详细说明

**添加服务器：**

```bash
pls remote add myserver root@192.168.1.100
pls remote add myserver root@192.168.1.100 --key ~/.ssh/my_key
pls remote add myserver root@192.168.1.100 --password  # 密码认证
```

**管理服务器：**

```bash
pls remote                    # 查看所有服务器
pls remote test myserver      # 测试连接
pls remote remove myserver    # 删除
pls remote default myserver   # 设置默认服务器
pls remote workdir myserver /var/www  # 设置工作目录
```

**远程执行：**

```bash
pls -r myserver 查看磁盘使用情况
pls -r 查看当前目录  # 使用默认服务器

# 批量执行
pls -r web1,web2,web3 重启 nginx
```

批量执行会为每个服务器生成适配其环境的命令，并发执行。

**远程历史：**

```bash
pls remote history show myserver        # 查看
pls remote history clear myserver       # 清空
pls remote hook install myserver        # 安装远程 Hook
```

### 配置

查看和修改配置：

```bash
pls config           # 交互式配置
pls config list      # 查看配置
pls config set <key> <value>  # 修改单项
```

主要配置项：
- `apiKey` / `baseUrl` / `provider` / `model` - AI API 配置
- `editMode` - 命令编辑模式（manual / auto）
- `theme` - 界面主题
- `shellHook` - 是否启用 Shell Hook
- `chatHistoryLimit` / `commandHistoryLimit` - 历史条数限制

支持的 Provider：openai、deepseek、anthropic、google、groq、mistral、cohere、fireworks、together

### 升级

```bash
pls upgrade  # 升级到最新版本
```

程序每 24 小时自动检查更新，发现新版本会提示。

## 命令速查

```bash
# 基础
pls <需求>                  # 生成并执行命令
pls -d <需求>               # Debug 模式
pls -v                      # 查看版本

# 配置
pls config                  # 交互式配置
pls config list             # 查看配置
pls config set <key> <val>  # 修改配置

# 历史
pls history                 # 命令历史
pls history chat            # 对话历史
pls history shell           # Shell 历史
pls history clear           # 清空历史

# 对话
pls chat <问题>             # 问问题
pls history chat clear      # 清空对话

# Hook
pls hook install            # 安装
pls hook status             # 状态
pls hook uninstall          # 卸载

# 主题
pls theme                   # 当前主题
pls theme list              # 所有主题
pls theme <name>            # 切换

# 别名
pls alias                   # 查看
pls alias add <name> "<prompt>"  # 添加
pls alias remove <name>     # 删除

# 远程
pls remote add <name> <user@host>  # 添加服务器
pls remote list             # 查看
pls -r <name> <需求>        # 远程执行
pls -r <n1,n2,n3> <需求>    # 批量执行

# 升级
pls upgrade                 # 升级到最新版本
```

## 技术栈

- **React + Ink** - 终端 UI 组件化
- **Mastra** - AI Agent 框架
- **TypeScript** - 100% 类型安全
- **Commander** - CLI 参数解析

## 开发

```bash
git clone https://github.com/IvanLark/pretty-please.git
cd pretty-please
pnpm install
pnpm build
pnpm link --global
```

开发模式（热重载）：

```bash
pnpm add -g tsx
pnpm link:dev
pls-dev <命令>  # 代码修改立即生效
```

## 常见问题

**为什么 Chat 会清空终端历史？**

这是 Ink 的设计局限。命令执行使用原生输出保留历史，只有 Chat 模式会清空。

**支持哪些 AI？**

支持 OpenAI、DeepSeek、Claude、Gemini、Groq、Mistral、Cohere 等，只要兼容 OpenAI API 格式就行。

## 许可证

MIT

## 致谢

- [thefuck](https://github.com/nvbn/thefuck) - 启发了自动修复功能，一个超火的命令纠错工具
- [fuckit.sh](https://github.com/faithleysath/fuckit.sh) - 提供了灵感，一个优雅的 AI 命令行工具
- [Ink](https://github.com/vadimdemedes/ink) - 终端 React 渲染器
- [Mastra](https://mastra.ai) - AI Agent 框架

---

**Made with ❤️ and AI**
