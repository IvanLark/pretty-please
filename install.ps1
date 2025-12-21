# Pretty-Please (pls) Windows 安装脚本
# 使用方法: irm https://raw.githubusercontent.com/IvanLark/pretty-please/main/install.ps1 | iex

$ErrorActionPreference = "Stop"

$REPO = "IvanLark/pretty-please"
$BINARY_NAME = "pls.exe"
$INSTALL_DIR = "$env:LOCALAPPDATA\Programs\pls"

function Write-Info { param($msg) Write-Host "[INFO] " -ForegroundColor Cyan -NoNewline; Write-Host $msg }
function Write-Success { param($msg) Write-Host "[OK] " -ForegroundColor Green -NoNewline; Write-Host $msg }
function Write-Warn { param($msg) Write-Host "[WARN] " -ForegroundColor Yellow -NoNewline; Write-Host $msg }
function Write-Error { param($msg) Write-Host "[ERROR] " -ForegroundColor Red -NoNewline; Write-Host $msg }

function Get-LatestVersion {
    # API 请求很小，直连 GitHub（代理通常不支持 api.github.com）
    $response = Invoke-WebRequest -Uri "https://api.github.com/repos/$REPO/releases/latest" -UseBasicParsing | ConvertFrom-Json
    return $response.tag_name
}

function Main {
    Write-Host ""
    Write-Host "╭─────────────────────────────────────────╮" -ForegroundColor Cyan
    Write-Host "│     Pretty-Please (pls) 安装程序        │" -ForegroundColor Cyan
    Write-Host "│     AI 驱动的命令行助手                 │" -ForegroundColor Cyan
    Write-Host "╰─────────────────────────────────────────╯" -ForegroundColor Cyan
    Write-Host ""

    # 检测架构
    Write-Info "检测系统架构..."
    $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture

    # 支持多种架构
    switch ($arch) {
        "X64" {
            $PLATFORM = "windows-x64"
            Write-Success "架构: Windows x64"
        }
        "Arm64" {
            # Windows ARM64 可以通过仿真运行 x64 程序
            $PLATFORM = "windows-x64"
            Write-Success "架构: Windows ARM64 (将使用 x64 版本)"
        }
        default {
            Write-Error "不支持的架构: $arch"
            exit 1
        }
    }

    # 获取版本
    Write-Info "获取最新版本..."
    try {
        $VERSION = Get-LatestVersion
    } catch {
        Write-Error "无法获取最新版本: $_"
        exit 1
    }
    Write-Success "版本: $VERSION"

    # 下载 URL（支持新版本格式：pls-v{version}-{platform}.exe）
    $VERSION_NO_V = $VERSION -replace '^v', ''
    $DOWNLOAD_URL = "https://github.com/$REPO/releases/download/$VERSION/pls-v${VERSION_NO_V}-${PLATFORM}.exe"

    # 如果设置了 PROXY 环境变量，使用代理
    if ($env:PROXY) {
        $PROXY = $env:PROXY.TrimEnd('/')
        $DOWNLOAD_URL = "$PROXY/$DOWNLOAD_URL"
        Write-Info "使用代理: $PROXY"
    }
    Write-Info "下载地址: $DOWNLOAD_URL"

    # 创建安装目录
    if (!(Test-Path $INSTALL_DIR)) {
        Write-Info "创建目录: $INSTALL_DIR"
        New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null
    }

    # 下载
    Write-Info "下载中..."
    $DEST_PATH = Join-Path $INSTALL_DIR $BINARY_NAME
    try {
        Invoke-WebRequest -Uri $DOWNLOAD_URL -OutFile $DEST_PATH -UseBasicParsing
    } catch {
        Write-Error "下载失败: $_"
        exit 1
    }
    Write-Success "安装完成!"

    # 检查 PATH
    Write-Host ""
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentPath -notlike "*$INSTALL_DIR*") {
        Write-Warn "$INSTALL_DIR 不在 PATH 中"
        Write-Host ""

        $addToPath = Read-Host "是否自动添加到 PATH? (Y/n)"
        if ($addToPath -ne "n" -and $addToPath -ne "N") {
            $newPath = "$currentPath;$INSTALL_DIR"
            [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
            $env:Path = "$env:Path;$INSTALL_DIR"
            Write-Success "已添加到 PATH"
            Write-Warn "请重启终端使 PATH 生效"
        } else {
            Write-Host ""
            Write-Host "请手动将以下路径添加到系统 PATH:" -ForegroundColor Yellow
            Write-Host "  $INSTALL_DIR" -ForegroundColor Green
        }
    }

    Write-Host ""
    Write-Host "安装成功! " -ForegroundColor Green -NoNewline
    Write-Host "运行 " -NoNewline
    Write-Host "pls --help" -ForegroundColor Cyan -NoNewline
    Write-Host " 查看帮助"
    Write-Host ""
    Write-Host "首次使用请运行 " -NoNewline
    Write-Host "pls config" -ForegroundColor Cyan -NoNewline
    Write-Host " 配置 API Key"
    Write-Host ""
}

Main
