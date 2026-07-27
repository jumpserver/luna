BUILDDIR := build
BASEPATH := $(shell pwd)
CLIENTSRC := $(BASEPATH)/cmd/sshc/

DEFAULT_OS := $(shell uname -s 2>/dev/null | tr '[:upper:]' '[:lower:]' || echo "unknown")
DEFAULT_ARCH := $(shell uname -m 2>/dev/null | sed 's/x86_64/amd64/; s/aarch64/arm64/; s/arm64/arm64/; s/i686/386/' || echo "amd64")

ifeq ($(TARGET),)
  CURRENT_OS := $(DEFAULT_OS)
  CURRENT_ARCH := $(DEFAULT_ARCH)
else
  CURRENT_OS := $(shell if echo "$(TARGET)" | grep -q "apple-darwin"; then echo "darwin"; elif echo "$(TARGET)" | grep -q "linux"; then echo "linux"; elif echo "$(TARGET)" | grep -q "windows"; then echo "windows"; else echo "$(DEFAULT_OS)"; fi)
  CURRENT_ARCH := $(shell if echo "$(TARGET)" | grep -q "aarch64"; then echo "arm64"; elif echo "$(TARGET)" | grep -q "x86_64"; then echo "amd64"; else echo "$(DEFAULT_ARCH)"; fi)
endif

.PHONY: default build-current build-all install
default: build-current install

build-current:
	@echo "Building SSH helper for $(CURRENT_OS)/$(CURRENT_ARCH)"
	@mkdir -p $(BUILDDIR)/$(CURRENT_OS)-$(CURRENT_ARCH)
	@if [ "$(CURRENT_OS)" = "windows" ]; then \
		echo "SSH helper is not built for Windows"; \
	else \
		CGO_ENABLED=0 GOOS=$(CURRENT_OS) GOARCH=$(CURRENT_ARCH) go build -trimpath -ldflags "-w -s" -o $(BUILDDIR)/$(CURRENT_OS)-$(CURRENT_ARCH)/client $(CLIENTSRC); \
	fi

build-all:
	@rm -rf $(BUILDDIR)
	@set -e; for target in darwin-amd64 darwin-arm64 linux-amd64 linux-arm64; do \
		os=$${target%-*}; arch=$${target#*-}; \
		echo "Building SSH helper for $$os/$$arch"; \
		mkdir -p $(BUILDDIR)/$$target; \
		CGO_ENABLED=0 GOOS=$$os GOARCH=$$arch go build -trimpath -ldflags "-w -s" -o $(BUILDDIR)/$$target/client $(CLIENTSRC); \
	done

install:
	@mkdir -p $(BASEPATH)/../src-tauri/resources/bin/$(CURRENT_OS)-$(CURRENT_ARCH)
	@if [ -f "$(BUILDDIR)/$(CURRENT_OS)-$(CURRENT_ARCH)/client" ]; then \
		cp $(BUILDDIR)/$(CURRENT_OS)-$(CURRENT_ARCH)/client $(BASEPATH)/../src-tauri/resources/bin/$(CURRENT_OS)-$(CURRENT_ARCH)/client; \
		chmod +x $(BASEPATH)/../src-tauri/resources/bin/$(CURRENT_OS)-$(CURRENT_ARCH)/client; \
	fi
	@mkdir -p $(BASEPATH)/../src-tauri/resources/plugins
	@rm -rf $(BASEPATH)/../src-tauri/resources/plugins/windows $(BASEPATH)/../src-tauri/resources/plugins/macos $(BASEPATH)/../src-tauri/resources/plugins/linux
	@cp -R $(BASEPATH)/../plugins/windows $(BASEPATH)/../src-tauri/resources/plugins/
	@cp -R $(BASEPATH)/../plugins/macos $(BASEPATH)/../src-tauri/resources/plugins/
	@cp -R $(BASEPATH)/../plugins/linux $(BASEPATH)/../src-tauri/resources/plugins/
