//go:build windows

package main

import (
	"os"

	"golang.org/x/crypto/ssh"
)

func watchTerminalResize(_ *ssh.Session, _ *os.File) func() {
	return func() {}
}
