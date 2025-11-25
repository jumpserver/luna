#!/bin/bash

# Import and verify Apple Developer Certificate
# This script imports the certificate to keychain and sets up environment variables

set -e

# Check required environment variables
if [ -z "$APPLE_CERTIFICATE" ]; then
  echo "Error: APPLE_CERTIFICATE environment variable is required"
  exit 1
fi

if [ -z "$APPLE_CERTIFICATE_PASSWORD" ]; then
  echo "Error: APPLE_CERTIFICATE_PASSWORD environment variable is required"
  exit 1
fi

if [ -z "$KEYCHAIN_PASSWORD" ]; then
  echo "Error: KEYCHAIN_PASSWORD environment variable is required"
  exit 1
fi

# Mask sensitive values in logs
echo "::add-mask::$KEYCHAIN_PASSWORD"
echo "::add-mask::$APPLE_CERTIFICATE_PASSWORD"

# Decode certificate without echoing it
echo "$APPLE_CERTIFICATE" | base64 --decode > certificate.p12

# Create and setup keychain
security create-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
security default-keychain -s build.keychain
security unlock-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
security set-keychain-settings -t 3600 -u build.keychain

# Import certificate
security import certificate.p12 -k build.keychain -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" build.keychain

# Clean up certificate file
rm -f certificate.p12

# List identities (only show count, not full details)
IDENTITY_COUNT=$(security find-identity -v -p codesigning build.keychain | grep -c "valid identities found" || echo "0")
echo "Found $IDENTITY_COUNT valid code signing identity/identities"

# Verify certificate
# Try to find valid code signing certificate (Developer ID, Apple Distribution, or Apple Development)
# Priority: Developer ID Application > Apple Distribution > Apple Development
CERT_INFO=$(security find-identity -v -p codesigning build.keychain 2>/dev/null | grep -E "Developer ID Application|Apple Distribution|Apple Development" | head -n 1)

if [ -z "$CERT_INFO" ]; then
  echo "Error: No valid Apple certificate found in keychain"
  # Only show certificate count, not full details
  CERT_COUNT=$(security find-identity -v -p codesigning build.keychain 2>/dev/null | grep -c "valid identities found" || echo "0")
  echo "Found $CERT_COUNT certificate(s) in keychain"
  exit 1
fi

CERT_ID=$(echo "$CERT_INFO" | awk '{print $2}')

if [ -z "$CERT_ID" ]; then
  echo "Error: Failed to extract certificate ID"
  exit 1
fi

# Extract certificate name (content between quotes)
# Format: 1) CERT_ID "Certificate Name"
CERT_NAME=$(echo "$CERT_INFO" | sed -n 's/.*"\(.*\)".*/\1/p')

if [ -z "$CERT_NAME" ]; then
  echo "Error: Failed to extract certificate name"
  exit 1
fi

# Mask certificate ID and name in logs
echo "::add-mask::$CERT_ID"
echo "::add-mask::$CERT_NAME"

# Extract Team ID from certificate name (format: "Developer ID Application: Name (TEAM_ID)")
# Use sed to extract content between parentheses
TEAM_ID=$(echo "$CERT_NAME" | sed -n 's/.*(\([A-Z0-9]*\)).*/\1/p' | head -n 1)

if [ -z "$TEAM_ID" ]; then
  echo "Warning: Failed to extract Team ID from certificate name, trying alternative method"
  # Alternative: try to get from certificate directly using openssl (without outputting full subject)
  CERT_SUBJECT=$(security find-certificate -c "$CERT_ID" -p build.keychain 2>/dev/null | openssl x509 -noout -subject 2>/dev/null || echo "")
  if [ -n "$CERT_SUBJECT" ]; then
    TEAM_ID=$(echo "$CERT_SUBJECT" | sed -n 's/.*OU=\([^/]*\).*/\1/p' | head -n 1)
  fi
fi

# Mask Team ID in logs
if [ -n "$TEAM_ID" ]; then
  echo "::add-mask::$TEAM_ID"
fi

# Set environment variables
# Use certificate name (not ID) for APPLE_SIGNING_IDENTITY as required by tauri-action
echo "APPLE_SIGNING_IDENTITY=$CERT_NAME" >> $GITHUB_ENV
if [ -n "$TEAM_ID" ]; then
  echo "APPLE_TEAM_ID=$TEAM_ID" >> $GITHUB_ENV
fi

# Show sanitized info (only certificate type, not full details)
CERT_TYPE=$(echo "$CERT_INFO" | sed -n 's/.*"\(Developer ID Application\|Apple Distribution\|Apple Development\).*/\1/p')
echo "✓ Certificate verified: $CERT_TYPE"
echo "✓ Certificate imported and verified successfully."

