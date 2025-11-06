#!/bin/bash

# Tauri + Nuxt 项目缓存清理脚本
# 解决 spawn EBADF 错误

echo "🧹 开始清理项目缓存..."

# 1. 停止可能运行的进程
echo "⏹️  停止开发服务器进程..."
#pkill -f "tauri dev" || true
pkill -f "nuxt dev" || true  
pkill -f "vite" || true
pkill -f "node" || true

# 等待进程完全退出
sleep 2

# 2. 清理 Node.js 相关缓存
echo "🗂️  清理 Node.js 缓存..."
rm -rf node_modules
rm -rf .nuxt
rm -rf .output
rm -rf dist
rm -rf .turbo

# 3. 清理 pnpm 缓存
echo "📦 清理 pnpm 缓存..."
pnpm store prune || true

# 4. 清理 Rust/Cargo 缓存
echo "🦀 清理 Rust 缓存..."
cd src-tauri
cargo clean
rm -rf target
cd ..

# 5. 清理系统临时文件
echo "🗑️  清理临时文件..."
rm -rf /tmp/tauri-* 2>/dev/null || true
rm -rf ~/.cargo/registry/cache/* 2>/dev/null || true

# 6. 清理可能的锁文件
echo "🔓 清理锁文件..."
find . -name "*.lock" -not -path "./pnpm-lock.yaml" -delete 2>/dev/null || true
find . -name ".DS_Store" -delete 2>/dev/null || true

# 7. 增加文件描述符限制（macOS）
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "🍎 设置 macOS 文件描述符限制..."
    ulimit -n 65536 2>/dev/null || true
fi

echo "✅ 缓存清理完成！"
echo ""
echo "📋 接下来请运行："
echo "   pnpm install"
echo "   pnpm run tauri:dev"
