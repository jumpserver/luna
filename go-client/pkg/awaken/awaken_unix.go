//go:build aix || darwin || dragonfly || freebsd || (js && wasm) || linux || netbsd || openbsd || solaris
// +build aix darwin dragonfly freebsd js,wasm linux netbsd openbsd solaris

package awaken

import (
	"go-client/pkg/config"
	"os/exec"
)

func handleRDP(r *Rouse, filePath string, cfg *config.AppConfig) (*exec.Cmd, error) {
	cmd, err := awakenRDPCommand(filePath, cfg)
	return cmd, err
}

func handleVNC(r *Rouse, cfg *config.AppConfig) (*exec.Cmd, error) {
	cmd, err := awakenVNCCommand(r, cfg)
	return cmd, err
}

func handleSSH(r *Rouse, cfg *config.AppConfig) (*exec.Cmd, error) {
	cmd, err := awakenSSHCommand(r, cfg)
	return cmd, err
}

func handleDB(r *Rouse, cfg *config.AppConfig) (*exec.Cmd, error) {
	cmd, err := awakenDBCommand(r, cfg)
	return cmd, err
}

func handleCommand(r *Rouse, cfg *config.AppConfig) (*exec.Cmd, error) {
	cmd, err := awakenOtherCommand(r, cfg)
	return cmd, err
}
