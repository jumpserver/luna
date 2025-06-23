package vncpass

import (
	"bytes"
	"crypto/des"
	"os"
	"path/filepath"
)

// 固定 VNC 原始密钥
var originalKey = []byte{0x17, 0x52, 0x6b, 0x09, 0x33, 0x51, 0x6e, 0x4b}

// Bit 反转一个字节（用于 TigerVNC 加密 key）
func reverseBits(b byte) byte {
	var rev byte
	for i := 0; i < 8; i++ {
		rev = (rev << 1) | (b & 1)
		b >>= 1
	}
	return rev
}

// 构造 VNC 所需的 DES key
func generateVNCKey() []byte {
	key := make([]byte, len(originalKey))
	for i, b := range originalKey {
		key[i] = reverseBits(b)
	}
	return key
}

// 明文密码转为 8 字节
func padPassword(pw string) []byte {
	p := []byte(pw)
	if len(p) > 8 {
		return p[:8]
	}
	return append(p, bytes.Repeat([]byte{0}, 8-len(p))...)
}

// 生成 .vncpass 文件并返回路径
func GenerateVNCPasswordFile(password string) (string, error) {
	// 获取 ~/.config/jumpserver-client 路径
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	currentPath := filepath.Join(configDir, "jumpserver-client")

	// 确保目录存在
	err = os.MkdirAll(currentPath, os.ModePerm)
	if err != nil {
		return "", err
	}

	// 随机文件名
	filename := ".vncpaxx"
	outputPath := filepath.Join(currentPath, filename)

	// 加密处理
	key := generateVNCKey()
	block, err := des.NewCipher(key)
	if err != nil {
		return "", err
	}
	plaintext := padPassword(password)
	ciphertext := make([]byte, 8)
	block.Encrypt(ciphertext, plaintext)

	// 写入文件
	err = os.WriteFile(outputPath, ciphertext, os.ModePerm)
	if err != nil {
		return "", err
	}

	return outputPath, nil
}
