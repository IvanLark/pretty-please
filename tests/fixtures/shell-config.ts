/**
 * Hook 脚本测试数据
 */

// Zsh Hook 脚本标记
export const ZSH_HOOK_START_MARKER = '# >>> pretty-please shell hook >>>'
export const ZSH_HOOK_END_MARKER = '# <<< pretty-please shell hook <<<'

// 完整的 Zsh 配置文件（带 Hook）
export const zshrcWithHook = `\
# User configuration
export PATH="/usr/local/bin:$PATH"

${ZSH_HOOK_START_MARKER}
# Pretty Please Shell Hook
__pls_command=""
__pls_command_start_time=0

preexec() {
    __pls_command="$1"
    __pls_command_start_time=$SECONDS
}

precmd() {
    local exit_code=$?
    if [[ -n "$__pls_command" ]]; then
        local cmd_escaped=\${__pls_command//\\\\/\\\\\\\\}
        local json="{\\"cmd\\":\\"$cmd_escaped\\",\\"exit\\":$exit_code,\\"time\\":\\"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\\"}"
        echo "$json" >> ~/.please/shell_history.jsonl
    fi
    __pls_command=""
}
${ZSH_HOOK_END_MARKER}

# More user config
alias ll="ls -la"
`

// Zsh 配置文件（无 Hook）
export const zshrcWithoutHook = `\
# User configuration
export PATH="/usr/local/bin:$PATH"

# My aliases
alias ll="ls -la"
alias gs="git status"
`

// Bash 配置文件（带 Hook）
export const bashrcWithHook = `\
# User configuration
export PATH="/usr/local/bin:$PATH"

${ZSH_HOOK_START_MARKER}
# Pretty Please Shell Hook
__pls_last_cmd=""

__pls_capture_command() {
    local exit_code=$?
    local last_cmd=$(history 1 | sed 's/^[ ]*[0-9]*[ ]*//')

    if [[ "$last_cmd" != "$__pls_last_cmd" && -n "$last_cmd" ]]; then
        local json="{\\"cmd\\":\\"$last_cmd\\",\\"exit\\":$exit_code,\\"time\\":\\"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\\"}"
        echo "$json" >> ~/.please/shell_history.jsonl
        __pls_last_cmd="$last_cmd"
    fi
}

PROMPT_COMMAND="__pls_capture_command; $PROMPT_COMMAND"
${ZSH_HOOK_END_MARKER}

alias ll="ls -la"
`

// PowerShell Profile（带 Hook）
export const powerShellProfileWithHook = `\
# User configuration
\$env:PATH += ";C:\\Program Files\\Git\\bin"

${ZSH_HOOK_START_MARKER}
# Pretty Please Shell Hook
\$Global:__PlsDir = Join-Path \$env:USERPROFILE ".please"
\$Global:__PlsHistoryFile = Join-Path \$Global:__PlsDir "shell_history.jsonl"

if (-not (Test-Path \$Global:__PlsDir)) {
    New-Item -Path \$Global:__PlsDir -ItemType Directory -Force | Out-Null
}

\$Global:__PlsOriginalPrompt = \${function:prompt}.ToString()

function prompt {
    \$exitCode = \$LASTEXITCODE ?? 0
    \$lastCmd = (Get-History -Count 1).CommandLine

    if (\$lastCmd) {
        \$json = "{\`"cmd\`":\`"\$lastCmd\`",\`"exit\`":\$exitCode,\`"time\`":\`"$(Get-Date -Format 'o')\`"}"
        Add-Content -Path \$Global:__PlsHistoryFile -Value \$json
    }

    & ([ScriptBlock]::Create(\$Global:__PlsOriginalPrompt))
}
${ZSH_HOOK_END_MARKER}

# More user config
Set-Alias ll Get-ChildItem
`

// 空配置文件
export const emptyShellConfig = ''

// Hook 损坏的配置文件（只有开始标记，没有结束标记）
export const corruptedHookConfig = `\
# User configuration
export PATH="/usr/local/bin:$PATH"

${ZSH_HOOK_START_MARKER}
# Hook content here
# Missing end marker!

alias ll="ls -la"
`
