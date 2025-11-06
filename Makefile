# JumpServer Client Tauri Project Makefile
# Author: ZhaoJiSen
# Version: 1.4.0

# 颜色定义
RED=\033[0;31m
GREEN=\033[0;32m
YELLOW=\033[1;33m
BLUE=\033[0;34m
NC=\033[0m # No Color

# 项目信息
PROJECT_NAME=jumpserver-client
VERSION=1.4.0
NODE_VERSION=23
PNPM_VERSION=10.17.0

# 默认目标
.DEFAULT_GOAL := help

# 帮助信息
.PHONY: help
help: ## 显示帮助信息
	@echo "$(GREEN)JumpServer Client Tauri Project$(NC)"
	@echo "$(BLUE)Version: $(VERSION)$(NC)"
	@echo ""
	@echo "$(YELLOW)可用命令:$(NC)"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# 环境检查
.PHONY: check-env
check-env: ## 检查开发环境
	@echo "$(BLUE)检查开发环境...$(NC)"
	@command -v node >/dev/null 2>&1 || { echo "$(RED)错误: Node.js 未安装$(NC)"; exit 1; }
	@command -v pnpm >/dev/null 2>&1 || { echo "$(RED)错误: pnpm 未安装$(NC)"; exit 1; }
	@command -v cargo >/dev/null 2>&1 || { echo "$(RED)错误: Rust/Cargo 未安装$(NC)"; exit 1; }
	@command -v tauri >/dev/null 2>&1 || { echo "$(RED)错误: Tauri CLI 未安装$(NC)"; exit 1; }
	@echo "$(GREEN)✓ 环境检查通过$(NC)"

# 安装依赖
.PHONY: install
install: check-env ## 安装项目依赖
	@echo "$(BLUE)安装前端依赖...$(NC)"
	pnpm install
	@echo "$(GREEN)✓ 依赖安装完成$(NC)"

# 开发模式运行
.PHONY: dev
dev: install ## 启动开发模式 (热重载)
	@echo "$(BLUE)启动 Tauri 开发模式...$(NC)"
	pnpm run tauri:dev

# 仅前端开发
.PHONY: dev-frontend
dev-frontend: install ## 仅启动前端开发服务器
	@echo "$(BLUE)启动前端开发服务器...$(NC)"
	pnpm run dev

# 构建项目
.PHONY: build
build: install ## 构建生产版本
	@echo "$(BLUE)构建生产版本...$(NC)"
	pnpm run tauri:build
	@echo "$(GREEN)✓ 构建完成$(NC)"

# 调试构建
.PHONY: build-debug
build-debug: install ## 构建调试版本
	@echo "$(BLUE)构建调试版本...$(NC)"
	pnpm run tauri:build:debug
	@echo "$(GREEN)✓ 调试构建完成$(NC)"

# 代码检查
.PHONY: lint
lint: ## 运行代码检查
	@echo "$(BLUE)运行代码检查...$(NC)"
	pnpm run lint
	@echo "$(GREEN)✓ 代码检查完成$(NC)"

# 清理项目
.PHONY: clean
clean: ## 清理构建文件和依赖
	@echo "$(BLUE)清理项目...$(NC)"
	pnpm run reset
	@echo "$(GREEN)✓ 清理完成$(NC)"

# 完全重新开始
.PHONY: fresh-start
fresh-start: clean install dev ## 完全重新开始 (清理 + 安装 + 开发)

# 版本管理
.PHONY: bump
bump: ## 更新版本号
	@echo "$(BLUE)更新版本号...$(NC)"
	pnpm run bump
	@echo "$(GREEN)✓ 版本更新完成$(NC)"

# 生成静态文件
.PHONY: generate
generate: ## 生成静态文件
	@echo "$(BLUE)生成静态文件...$(NC)"
	pnpm run generate
	@echo "$(GREEN)✓ 静态文件生成完成$(NC)"

# 运行清理脚本
.PHONY: cleanup
cleanup: ## 运行清理脚本
	@echo "$(BLUE)运行清理脚本...$(NC)"
	pnpm run cleanup
	@echo "$(GREEN)✓ 清理脚本执行完成$(NC)"

# 检查 Rust 依赖
.PHONY: check-rust
check-rust: ## 检查 Rust 依赖
	@echo "$(BLUE)检查 Rust 依赖...$(NC)"
	cd src-tauri && cargo check
	@echo "$(GREEN)✓ Rust 依赖检查完成$(NC)"

# 更新 Rust 依赖
.PHONY: update-rust
update-rust: ## 更新 Rust 依赖
	@echo "$(BLUE)更新 Rust 依赖...$(NC)"
	cd src-tauri && cargo update
	@echo "$(GREEN)✓ Rust 依赖更新完成$(NC)"

# 运行 Rust 测试
.PHONY: test-rust
test-rust: ## 运行 Rust 测试
	@echo "$(BLUE)运行 Rust 测试...$(NC)"
	cd src-tauri && cargo test
	@echo "$(GREEN)✓ Rust 测试完成$(NC)"

# 格式化 Rust 代码
.PHONY: fmt-rust
fmt-rust: ## 格式化 Rust 代码
	@echo "$(BLUE)格式化 Rust 代码...$(NC)"
	cd src-tauri && cargo fmt
	@echo "$(GREEN)✓ Rust 代码格式化完成$(NC)"

# 检查 Rust 代码
.PHONY: clippy
clippy: ## 运行 Rust clippy 检查
	@echo "$(BLUE)运行 Rust clippy 检查...$(NC)"
	cd src-tauri && cargo clippy
	@echo "$(GREEN)✓ Rust clippy 检查完成$(NC)"

# 开发环境设置
.PHONY: setup-dev
setup-dev: check-env install ## 设置开发环境
	@echo "$(GREEN)✓ 开发环境设置完成$(NC)"
	@echo "$(YELLOW)提示: 运行 'make dev' 开始开发$(NC)"

# 显示项目信息
.PHONY: info
info: ## 显示项目信息
	@echo "$(GREEN)项目信息:$(NC)"
	@echo "  名称: $(PROJECT_NAME)"
	@echo "  版本: $(VERSION)"
	@echo "  Node.js: $(NODE_VERSION)"
	@echo "  pnpm: $(PNPM_VERSION)"
	@echo ""
	@echo "$(BLUE)技术栈:$(NC)"
	@echo "  前端: Nuxt 3 + Vue 3 + TypeScript"
	@echo "  后端: Tauri + Rust"
	@echo "  包管理: pnpm"
	@echo "  构建工具: Vite"

# 快速开发命令
.PHONY: quick-dev
quick-dev: ## 快速开发 (跳过环境检查)
	@echo "$(BLUE)快速启动开发模式...$(NC)"
	pnpm run tauri:dev

# 监控模式
.PHONY: watch
watch: ## 监控文件变化并自动重启
	@echo "$(BLUE)启动监控模式...$(NC)"
	pnpm run dev -- --watch

# 生产环境预览
.PHONY: preview
preview: build ## 预览生产构建
	@echo "$(BLUE)启动生产预览...$(NC)"
	pnpm run tauri:dev -- --mode production
