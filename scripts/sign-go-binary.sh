#!/bin/bash

# Sign embedded Go client binary for macOS
# This script signs the Go client binaries that are embedded in the Tauri app

set -e

# Check required environment variables
if [ -z "$APPLE_SIGNING_IDENTITY" ]; then
  echo "Error: APPLE_SIGNING_IDENTITY environment variable is required"
  exit 1
fi

# Get target architecture from argument or environment variable
TARGET_ARCH="${1:-${TARGET_ARCH}}"

if [ -z "$TARGET_ARCH" ]; then
  echo "Error: Target architecture is required (arm64 or amd64)"
  exit 1
fi

echo "Signing embedded Go client binary..."

BIN_DIR="src-tauri/resources/bin/darwin-${TARGET_ARCH}"
BINARIES=("client" "JumpServerClient")

for BIN_NAME in "${BINARIES[@]}"; do
  BIN_PATH="$BIN_DIR/$BIN_NAME"

  if [ ! -f "$BIN_PATH" ]; then
    echo "❌ Embedded binary not found: $BIN_PATH"
    ls -R src-tauri/resources/bin || true
    exit 1
  fi

  echo "Found $BIN_NAME binary: $BIN_PATH"

  codesign --force --options runtime --timestamp \
    --sign "$APPLE_SIGNING_IDENTITY" \
    "$BIN_PATH"
done

echo "✓ Embedded Go client binary signed successfully."

