package plugin

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadAppConfigSanitizesLegacyMacSelections(t *testing.T) {
	if osKey() != "macos" {
		t.Skip("macOS-specific plugin defaults")
	}

	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	repoRoot := filepath.Clean(filepath.Join(wd, "..", "..", ".."))
	if err := os.Chdir(repoRoot); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(wd)
	})

	configDir := t.TempDir()
	config := `{"_plugins":{"enabled":true}}`
	state := `{
  "version": 1,
  "selections": {
    "terminal:ssh": "builtin.putty",
    "terminal:telnet": "builtin.putty",
    "filetransfer:sftp": "builtin.iterm-sftp"
  },
  "plugins": {}
}`

	if err := os.WriteFile(filepath.Join(configDir, "config.json"), []byte(config), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(configDir, "plugins-state.json"), []byte(state), 0644); err != nil {
		t.Fatal(err)
	}

	cfg, ok := LoadAppConfig(configDir)
	if !ok {
		t.Fatal("expected plugin config to load")
	}

	var terminal *string
	for _, item := range cfg.MacOS.Terminal {
		if item.Name == "terminal" && item.IsActive() && item.IsMatchProtocol("ssh") {
			name := item.DisplayName
			terminal = &name
			break
		}
	}
	if terminal == nil || *terminal != "Terminal" {
		t.Fatalf("expected ssh to use Terminal, got %#v", cfg.MacOS.Terminal)
	}

	for _, item := range cfg.MacOS.FileTransfer {
		if item.Name == "iterm-sftp" && item.IsMatchProtocol("sftp") {
			t.Fatalf("legacy iTerm SFTP should not match sftp by default: %#v", item)
		}
	}
}

func TestBuildMatchFirstUsesSelectionsOnly(t *testing.T) {
	selections := map[string]string{
		"terminal:ssh": "windows.putty",
	}
	got := buildMatchFirst("windows.putty", "terminal", []string{"ssh", "telnet"}, selections)
	if len(got) != 1 || got[0] != "ssh" {
		t.Fatalf("expected only selected ssh, got %#v", got)
	}

	got = buildMatchFirst("windows.putty", "terminal", []string{"ssh", "telnet"}, map[string]string{
		"terminal:ssh": "",
	})
	if len(got) != 0 {
		t.Fatalf("expected no match after explicit disable, got %#v", got)
	}

	got = buildMatchFirst("windows.putty", "terminal", []string{"ssh", "telnet"}, map[string]string{})
	if len(got) != 0 {
		t.Fatalf("expected no match when selection missing, got %#v", got)
	}
}

func TestLoadAppConfigDoesNotFallbackMatchFirst(t *testing.T) {
	if osKey() != "macos" {
		t.Skip("macOS-specific plugin defaults")
	}

	wd, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	repoRoot := filepath.Clean(filepath.Join(wd, "..", "..", ".."))
	if err := os.Chdir(repoRoot); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(wd)
	})

	configDir := t.TempDir()
	config := `{"_plugins":{"enabled":true}}`
	state := `{
  "version": 1,
  "selections": {
    "terminal:ssh": "builtin.terminal"
  },
  "plugins": {
    "builtin.terminal": {"enabled": true}
  }
}`

	if err := os.WriteFile(filepath.Join(configDir, "config.json"), []byte(config), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(configDir, "plugins-state.json"), []byte(state), 0644); err != nil {
		t.Fatal(err)
	}

	cfg, ok := LoadAppConfig(configDir)
	if !ok {
		t.Fatal("expected plugin config to load")
	}

	for _, item := range cfg.MacOS.Terminal {
		if item.Name == "terminal" && item.IsMatchProtocol("telnet") {
			t.Fatalf("expected no telnet fallback from connect.json match_first, got %#v", item)
		}
	}
}
