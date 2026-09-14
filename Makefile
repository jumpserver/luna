# JumpServer Electron project

.DEFAULT_GOAL := help
DOCKER_COMPOSE ?= docker compose

.PHONY: run stop
run: check-env ## 启动开发代理、Nuxt 和 Electron（http://localhost:8888）
	@cleanup() { \
		status=$$?; \
		trap - EXIT INT TERM; \
		$(DOCKER_COMPOSE) down; \
		exit $$status; \
	}; \
	trap cleanup EXIT; \
	trap 'exit 130' INT; \
	trap 'exit 143' TERM; \
	$(DOCKER_COMPOSE) up -d && npm run dev

stop: ## 停止并移除开发代理
	$(DOCKER_COMPOSE) down

.PHONY: help
help: ## 显示帮助信息
	@echo "JumpServer (Electron)"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: check-env
check-env: ## 检查 Node.js 和 pnpm 环境
	@command -v node >/dev/null 2>&1 || { echo "错误: Node.js 未安装"; exit 1; }
	@command -v pnpm >/dev/null 2>&1 || { echo "错误: pnpm 未安装"; exit 1; }

.PHONY: install
install: check-env ## 安装项目依赖
	pnpm install

.PHONY: dev
dev: ## 启动 Electron 开发模式
	pnpm electron:dev

.PHONY: dev-web
dev-web: ## 仅启动 Web 开发服务器
	pnpm web:dev

.PHONY: build
build: ## 构建 Electron 安装包
	pnpm electron:build

.PHONY: package-dir
package-dir: ## 构建未打包的 Electron 应用目录
	pnpm electron:package:dir

.PHONY: docker-build
docker-build: ## 构建 Web Docker 镜像
	docker build -t jumpserver/luna:local .

.PHONY: check
check: ## 执行应用检查
	pnpm typecheck
	pnpm lint:check

.PHONY: test
test: ## 执行测试
	pnpm test

.PHONY: fmt
fmt: ## 格式化应用代码
	pnpm fmt

.PHONY: clean
clean: ## 清理构建产物和依赖
	pnpm reset

.PHONY: bump
bump: ## 更新版本号
	pnpm bump
