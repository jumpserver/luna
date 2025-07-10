//go:build aix || darwin || dragonfly || freebsd || (js && wasm) || linux || netbsd || openbsd || solaris
// +build aix darwin dragonfly freebsd js,wasm linux netbsd openbsd solaris

package awaken

import (
	"go-client/pkg/config"
	"os/exec"
)

func handleRDP(r *Rouse, filePath string, cfg *config.AppConfig) *exec.Cmd {
	cmd := awakenRDPCommand(filePath, cfg)
	return cmd
}

func handleVNC(r *Rouse, cfg *config.AppConfig) *exec.Cmd {
	cmd := awakenVNCCommand(r, cfg)
	return cmd
}

func handleSSH(r *Rouse, cfg *config.AppConfig) *exec.Cmd {
	cmd := awakenSSHCommand(r, cfg)
	return cmd
}

func handleDB(r *Rouse, cfg *config.AppConfig) *exec.Cmd {
	cmd := awakenDBCommand(r, cfg)
	return cmd
}

func handleCommand(r *Rouse, cfg *config.AppConfig) *exec.Cmd {
	cmd := awakenOtherCommand(r, cfg)
	return cmd
}
