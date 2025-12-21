#!/bin/bash
# Pretty-Please (pls) 安装脚本
# 使用方法: curl -fsSL https://raw.githubusercontent.com/IvanLark/pretty-please/main/install.sh | bash

set -e

REPO="IvanLark/pretty-please"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
BINARY_NAME="pls"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info() {
    echo -e "${CYAN}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# 检测系统架构
detect_platform() {
    local os arch

    os="$(uname -s | tr '[:upper:]' '[:lower:]')"
    arch="$(uname -m)"

    case "$os" in
        linux)
            case "$arch" in
                x86_64|amd64) echo "linux-x64" ;;
                aarch64|arm64) echo "linux-arm64" ;;
                *) error "不支持的 Linux 架构: $arch" ;;
            esac
            ;;
        darwin)
            case "$arch" in
                x86_64|amd64) echo "darwin-x64" ;;
                arm64) echo "darwin-arm64" ;;
                *) error "不支持的 macOS 架构: $arch" ;;
            esac
            ;;
        *)
            error "不支持的操作系统: $os"
            ;;
    esac
}

# 获取最新版本（通过重定向，避免 API 速率限制）
get_latest_version() {
    local url="https://github.com/${REPO}/releases/latest"
    # 如果设置了 PROXY，使用代理
    if [ -n "$PROXY" ]; then
        url="${PROXY%/}/${url}"
    fi
    # 使用 releases/latest 的重定向获取版本，不受 API 限制
    curl -fsSI "$url" | grep -i '^location:' | sed -E 's/.*\/tag\/([^[:space:]]+).*/\1/' | tr -d '\r'
}

# 主安装流程
main() {
    echo ""
    echo -e "${CYAN}╭─────────────────────────────────────────╮${NC}"
    echo -e "${CYAN}│${NC}     ${GREEN}Pretty-Please (pls) 安装程序${NC}        ${CYAN}│${NC}"
    echo -e "${CYAN}│${NC}     AI 驱动的命令行助手                ${CYAN}│${NC}"
    echo -e "${CYAN}╰─────────────────────────────────────────╯${NC}"
    echo ""

    # 检测平台
    info "检测系统平台..."
    PLATFORM=$(detect_platform)
    success "平台: $PLATFORM"

    # 获取版本
    info "获取最新版本..."
    VERSION=$(get_latest_version)
    if [ -z "$VERSION" ]; then
        error "无法获取最新版本"
    fi
    success "版本: $VERSION"

    # 构建下载 URL（支持新版本格式：pls-v{version}-{platform}.tar.gz）
    DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/pls-v${VERSION#v}-${PLATFORM}.tar.gz"

    # 如果设置了 PROXY 环境变量，使用代理
    if [ -n "$PROXY" ]; then
        # 移除末尾的斜杠（如果有）
        PROXY="${PROXY%/}"
        DOWNLOAD_URL="${PROXY}/${DOWNLOAD_URL}"
        info "使用代理: $PROXY"
    fi
    info "下载地址: $DOWNLOAD_URL"

    # 创建安装目录
    if [ ! -d "$INSTALL_DIR" ]; then
        info "创建目录: $INSTALL_DIR"
        mkdir -p "$INSTALL_DIR"
    fi

    # 下载并解压
    info "下载中..."
    TMP_DIR=$(mktemp -d)
    if ! curl -fsSL "$DOWNLOAD_URL" -o "${TMP_DIR}/archive.tar.gz"; then
        rm -rf "$TMP_DIR"
        error "下载失败，请检查网络或稍后重试"
    fi

    # 解压
    info "解压中..."
    tar -xzf "${TMP_DIR}/archive.tar.gz" -C "$TMP_DIR"

    # 安装
    info "安装到 $INSTALL_DIR/$BINARY_NAME"
    mv "${TMP_DIR}/pls" "$INSTALL_DIR/$BINARY_NAME"
    chmod +x "$INSTALL_DIR/$BINARY_NAME"
    rm -rf "$TMP_DIR"
    success "安装完成!"

    # 检查 PATH
    echo ""
    if ! echo "$PATH" | grep -q "$INSTALL_DIR"; then
        warn "$INSTALL_DIR 不在 PATH 中"
        echo ""
        echo "请将以下内容添加到你的 shell 配置文件 (~/.bashrc 或 ~/.zshrc):"
        echo ""
        echo -e "  ${GREEN}export PATH=\"\$HOME/.local/bin:\$PATH\"${NC}"
        echo ""
        echo "然后运行: source ~/.bashrc (或 source ~/.zshrc)"
    fi

    echo ""
    echo -e "${GREEN}安装成功!${NC} 运行 ${CYAN}pls --help${NC} 查看帮助"
    echo ""
    echo "首次使用请运行 ${CYAN}pls config${NC} 配置 API Key"
    echo ""
}

main "$@"
