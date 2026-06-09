NAME=go-client
BUILDDIR=build

BASEPATH := $(shell pwd)
CLIENTSRCFILE := $(BASEPATH)/cmd/awaken/
SSHCSRCFILE := $(BASEPATH)/cmd/sshc/

LDFLAGS=-w -s

CLIENTBUILD=CGO_ENABLED=0 go build -trimpath

# Default OS detection
DEFAULT_OS := $(shell uname -s 2>/dev/null | tr '[:upper:]' '[:lower:]' | sed 's/.*mingw.*/windows/; s/.*cygwin.*/windows/; s/.*msys.*/windows/' || echo "unknown")
# Default ARCH detection
DEFAULT_ARCH := $(shell uname -m 2>/dev/null | sed 's/x86_64/amd64/; s/aarch64/arm64/; s/arm64/arm64/; s/i686/386/' || echo "amd64")

# Parse TARGET if provided, otherwise use defaults
# TARGET format: aarch64-apple-darwin, x86_64-apple-darwin, etc.
# Use shell to parse TARGET and set CURRENT_OS and CURRENT_ARCH
ifeq ($(TARGET),)
  # TARGET is empty or not set, use defaults
  CURRENT_OS := $(DEFAULT_OS)
  CURRENT_ARCH := $(DEFAULT_ARCH)
else
  # Parse TARGET using shell
  CURRENT_OS := $(shell if echo "$(TARGET)" | grep -q "apple-darwin"; then echo "darwin"; elif echo "$(TARGET)" | grep -q "linux"; then echo "linux"; elif echo "$(TARGET)" | grep -q "windows"; then echo "windows"; else echo "$(DEFAULT_OS)"; fi)
  CURRENT_ARCH := $(shell if echo "$(TARGET)" | grep -q "aarch64"; then echo "arm64"; elif echo "$(TARGET)" | grep -q "x86_64"; then echo "amd64"; else echo "$(DEFAULT_ARCH)"; fi)
endif

# 默认目标：构建并安装当前平台
.PHONY: default
default: build-current install

# 构建当前平台
.PHONY: build-current
build-current:
	@echo "Building for current platform: $(CURRENT_OS)/$(CURRENT_ARCH)"
	@rm -rf $(BUILDDIR)
	@mkdir -p $(BUILDDIR)/$(CURRENT_OS)-$(CURRENT_ARCH)
	@if [ "$(CURRENT_OS)" = "windows" ]; then \
		$(CLIENTBUILD) -ldflags "$(LDFLAGS) -H windowsgui" -o $(BUILDDIR)/$(CURRENT_OS)-$(CURRENT_ARCH)/JumpServerClient.exe $(CLIENTSRCFILE); \
		echo "Skipping sshc build on Windows (not supported)"; \
	else \
		$(CLIENTBUILD) -ldflags "$(LDFLAGS)" -o $(BUILDDIR)/$(CURRENT_OS)-$(CURRENT_ARCH)/JumpServerClient $(CLIENTSRCFILE); \
		$(CLIENTBUILD) -ldflags "$(LDFLAGS)" -o $(BUILDDIR)/$(CURRENT_OS)-$(CURRENT_ARCH)/client $(SSHCSRCFILE); \
	fi
	@if [ "$(CURRENT_OS)" = "darwin" ]; then \
		cp -R $(BASEPATH)/Scripts $(BUILDDIR)/$(CURRENT_OS)-$(CURRENT_ARCH)/; \
	fi
	@mkdir -p $(BASEPATH)/../src-tauri/resources/bin/
	@cp -R $(BUILDDIR)/* $(BASEPATH)/../src-tauri/resources/bin/
	@cp $(BASEPATH)/config.json $(BASEPATH)/../src-tauri/resources/bin/
	@mkdir -p $(BASEPATH)/../src-tauri/resources/plugins/
	@cp -R $(BASEPATH)/../plugins/builtin $(BASEPATH)/../src-tauri/resources/plugins/
	@cp $(BASEPATH)/../plugins/plugins-state.defaults.json $(BASEPATH)/../src-tauri/resources/plugins/
	@if [ "$(CURRENT_OS)" = "windows" ]; then \
		cp $(BASEPATH)/putty.exe $(BASEPATH)/../src-tauri/resources/bin/windows/; \
		cp $(BASEPATH)/pkg/autoit/*.dll $(BASEPATH)/../src-tauri/resources/bin/windows/; \
	fi

# 构建所有平台 - 优化版本：在一个任务中构建所有目标
.PHONY: build-all
build-all:
	@echo "Building all platforms in one task..."
	@rm -rf $(BUILDDIR)
	@mkdir -p $(BUILDDIR)/{darwin-amd64,darwin-arm64,linux-amd64,linux-arm64,windows}
	
	@echo "Building Darwin AMD64..."
	GOARCH=amd64 GOOS=darwin $(CLIENTBUILD) -ldflags "$(LDFLAGS)" -o $(BUILDDIR)/darwin-amd64/JumpServerClient $(CLIENTSRCFILE)
	GOARCH=amd64 GOOS=darwin $(CLIENTBUILD) -ldflags "$(LDFLAGS)" -o $(BUILDDIR)/darwin-amd64/client $(SSHCSRCFILE)
	
	@echo "Building Darwin ARM64..."
	GOARCH=arm64 GOOS=darwin $(CLIENTBUILD) -ldflags "$(LDFLAGS)" -o $(BUILDDIR)/darwin-arm64/JumpServerClient $(CLIENTSRCFILE)
	GOARCH=arm64 GOOS=darwin $(CLIENTBUILD) -ldflags "$(LDFLAGS)" -o $(BUILDDIR)/darwin-arm64/client $(SSHCSRCFILE)
	
	@echo "Building Linux AMD64..."
	GOARCH=amd64 GOOS=linux $(CLIENTBUILD) -ldflags "$(LDFLAGS)" -o $(BUILDDIR)/linux-amd64/JumpServerClient $(CLIENTSRCFILE)
	GOARCH=amd64 GOOS=linux $(CLIENTBUILD) -ldflags "$(LDFLAGS)" -o $(BUILDDIR)/linux-amd64/client $(SSHCSRCFILE)
	
	@echo "Building Linux ARM64..."
	GOARCH=arm64 GOOS=linux $(CLIENTBUILD) -ldflags "$(LDFLAGS)" -o $(BUILDDIR)/linux-arm64/JumpServerClient $(CLIENTSRCFILE)
	GOARCH=arm64 GOOS=linux $(CLIENTBUILD) -ldflags "$(LDFLAGS)" -o $(BUILDDIR)/linux-arm64/client $(SSHCSRCFILE)
	
	@echo "Building Windows AMD64..."
	GOARCH=amd64 GOOS=windows $(CLIENTBUILD) -ldflags "$(LDFLAGS) -H windowsgui" -o $(BUILDDIR)/windows/JumpServerClient.exe $(CLIENTSRCFILE)
	
	@echo "Building Windows 386..."
	GOARCH=386 GOOS=windows $(CLIENTBUILD) -ldflags "$(LDFLAGS) -H windowsgui" -o $(BUILDDIR)/windows/JumpServerClient32.exe $(CLIENTSRCFILE)
	
	@echo "Copying platform-specific resources..."
	@cp -R $(BASEPATH)/Scripts $(BUILDDIR)/darwin-amd64/
	@cp -R $(BASEPATH)/Scripts $(BUILDDIR)/darwin-arm64/
	@cp $(BASEPATH)/putty.exe $(BUILDDIR)/windows/
	@cp $(BASEPATH)/pkg/autoit/*.dll $(BUILDDIR)/windows/
	
	@echo "Build completed for all platforms!"

# 安装到 Tauri resources 目录 - 只复制当前平台
# 支持通过 TARGET 参数传入，例如: make install TARGET=aarch64-apple-darwin
# 如果不传 TARGET 或 TARGET 为空，则使用默认的自动检测
.PHONY: install
install:
	@echo "Installing Go client for platform: $(CURRENT_OS)/$(CURRENT_ARCH)"
	@mkdir -p $(BASEPATH)/../src-tauri/resources/bin/
	@if [ -d "$(BUILDDIR)/$(CURRENT_OS)-$(CURRENT_ARCH)" ]; then \
		echo "Copying $(CURRENT_OS)-$(CURRENT_ARCH) files..."; \
		cp -R $(BUILDDIR)/$(CURRENT_OS)-$(CURRENT_ARCH) $(BASEPATH)/../src-tauri/resources/bin/; \
		chmod +x $(BASEPATH)/../src-tauri/resources/bin/$(CURRENT_OS)-$(CURRENT_ARCH)/*; \
	elif [ "$(CURRENT_OS)" = "windows" ] && [ -d "$(BUILDDIR)/windows" ]; then \
		echo "Copying Windows files..."; \
		cp -R $(BUILDDIR)/windows $(BASEPATH)/../src-tauri/resources/bin/; \
		chmod +x $(BASEPATH)/../src-tauri/resources/bin/windows/*.exe; \
	else \
		echo "Error: No build files found for $(CURRENT_OS)/$(CURRENT_ARCH)"; \
		echo "Available platforms:"; \
		ls -la $(BUILDDIR)/ 2>/dev/null || echo "No build directory found"; \
		exit 1; \
	fi
	@cp $(BASEPATH)/config.json $(BASEPATH)/../src-tauri/resources/bin/
	@mkdir -p $(BASEPATH)/../src-tauri/resources/plugins/
	@cp -R $(BASEPATH)/../plugins/builtin $(BASEPATH)/../src-tauri/resources/plugins/
	@cp $(BASEPATH)/../plugins/plugins-state.defaults.json $(BASEPATH)/../src-tauri/resources/plugins/
	@echo "Install completed!"

# 帮助信息
.PHONY: help
help:
	@echo "Available targets:"
	@echo "  make           - Build and install current platform (default)"
	@echo "  make build-client - Build and install current platform"
	@echo "  make build-current - Build current platform only (no install)"
	@echo "  make build-all - Build for all platforms (darwin, windows, linux)"
	@echo "  make install   - Install current platform files to Tauri resources"
	@echo "  make help      - Show this help message"
	@echo ""
	@echo "Current platform: $(CURRENT_OS)/$(CURRENT_ARCH)"

# build-client 就是 build-current + install
.PHONY: build-client
build-client: build-current install
