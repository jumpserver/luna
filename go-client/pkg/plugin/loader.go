package plugin

import (
	"encoding/json"
	"go-client/pkg/config"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

const (
	categoryTerminal      = "terminal"
	categoryRemoteDesktop = "remotedesktop"
	categoryFileTransfer  = "filetransfer"
	categoryDatabases     = "databases"
)

type indexFile struct {
	Plugins []indexEntry `json:"plugins"`
}

type indexEntry struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Category string   `json:"category"`
	Platforms []string `json:"platforms"`
}

type pluginState struct {
	Version    int                       `json:"version"`
	Selections map[string]string         `json:"selections"`
	Plugins    map[string]pluginStateItem `json:"plugins"`
}

type pluginStateItem struct {
	Enabled bool   `json:"enabled"`
	Path    string `json:"path"`
}

type manifest struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	DisplayName string            `json:"display_name"`
	Category    string            `json:"category"`
	Protocols   []string          `json:"protocols"`
	DownloadURL string            `json:"download_url"`
	Comment     map[string]string `json:"comment"`
}

type connectFile struct {
	Platforms map[string]platformConnect `json:"platforms"`
}

type platformConnect struct {
	DisplayName string                 `json:"display_name"`
	Executable  executableConfig       `json:"executable"`
	Launch      map[string]interface{} `json:"launch"`
}

type executableConfig struct {
	Type    string `json:"type"`
	Default string `json:"default"`
}

type defaultsFile struct {
	Platforms map[string]platformDefaults `json:"platforms"`
}

type platformDefaults struct {
	MatchFirst  []string `json:"match_first"`
	IsDefault   bool     `json:"is_default"`
	IsSet       bool     `json:"is_set"`
	IsInternal  bool     `json:"is_internal"`
	Path        string   `json:"path"`
}

func osKey() string {
	switch runtime.GOOS {
	case "darwin":
		return "macos"
	case "windows":
		return "windows"
	default:
		return "linux"
	}
}

func resolveBuiltinDir() string {
	candidates := []string{}

	if exe, err := os.Executable(); err == nil {
		base := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(base, "resources", "plugins", "builtin"),
			filepath.Join(base, "..", "resources", "plugins", "builtin"),
			filepath.Join(base, "plugins", "builtin"),
		)
	}

	if cwd, err := os.Getwd(); err == nil {
		candidates = append(candidates,
			filepath.Join(cwd, "plugins", "builtin"),
			filepath.Join(cwd, "..", "plugins", "builtin"),
			filepath.Join(cwd, "..", "..", "plugins", "builtin"),
		)
	}

	for _, dir := range candidates {
		if _, err := os.Stat(filepath.Join(dir, "index.json")); err == nil {
			return dir
		}
	}
	return ""
}

func resolveStatePath(configDir string) string {
	statePath := filepath.Join(configDir, "plugins-state.json")
	if _, err := os.Stat(statePath); err == nil {
		return statePath
	}

	candidates := []string{
		filepath.Join("plugins", "plugins-state.defaults.json"),
		filepath.Join("..", "plugins", "plugins-state.defaults.json"),
		filepath.Join("..", "..", "plugins", "plugins-state.defaults.json"),
	}
	if exe, err := os.Executable(); err == nil {
		base := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(base, "resources", "plugins", "plugins-state.defaults.json"),
		)
	}

	for _, path := range candidates {
		if _, err := os.Stat(path); err == nil {
			_ = copyFile(path, statePath)
			return statePath
		}
	}
	return statePath
}

func copyFile(src, dst string) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, data, 0644)
}

func readJSON(path string, target interface{}) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, target)
}

func launchToArgFormat(launch map[string]interface{}) (string, []config.AutoItCommand) {
	launchType, _ := launch["type"].(string)
	switch launchType {
	case "autoit":
		raw, _ := json.Marshal(launch["steps"])
		var steps []config.AutoItCommand
		_ = json.Unmarshal(raw, &steps)
		return "", steps
	case "file":
		if template, ok := launch["arg_template"].(string); ok && template != "" {
			return template, nil
		}
		return "{file}", nil
	default:
		template, _ := launch["template"].(string)
		return template, nil
	}
}

func resolvePath(pluginID string, defaults platformDefaults, connect platformConnect, state pluginState) (string, bool, bool) {
	userPath := ""
	enabled := true
	if item, ok := state.Plugins[pluginID]; ok {
		userPath = strings.TrimSpace(item.Path)
		enabled = item.Enabled
	}

	path := defaults.Path
	if userPath != "" {
		path = userPath
	} else if path == "" {
		path = connect.Executable.Default
	}

	isSet := (defaults.IsSet || userPath != "") && enabled
	return path, isSet, defaults.IsInternal
}

func buildMatchFirst(pluginID, category string, protocols []string, selections map[string]string, fallback []string) []string {
	matched := []string{}
	for _, proto := range protocols {
		key := category + ":" + proto
		if selections[key] == pluginID {
			matched = append(matched, proto)
		}
	}
	if len(matched) > 0 {
		return matched
	}
	return fallback
}

func LoadAppConfig(configDir string) (*config.AppConfig, bool) {
	configPath := filepath.Join(configDir, "config.json")
	raw, err := os.ReadFile(configPath)
	if err != nil {
		return nil, false
	}

	var root map[string]interface{}
	if err := json.Unmarshal(raw, &root); err != nil {
		return nil, false
	}

	pluginsMeta, ok := root["_plugins"].(map[string]interface{})
	if !ok {
		return nil, false
	}
	enabled, _ := pluginsMeta["enabled"].(bool)
	if !enabled {
		return nil, false
	}

	builtinDir := resolveBuiltinDir()
	if builtinDir == "" {
		return nil, false
	}

	var index indexFile
	if err := readJSON(filepath.Join(builtinDir, "index.json"), &index); err != nil {
		return nil, false
	}

	statePath := resolveStatePath(configDir)
	var state pluginState
	_ = readJSON(statePath, &state)
	if state.Selections == nil {
		state.Selections = map[string]string{}
	}
	if state.Plugins == nil {
		state.Plugins = map[string]pluginStateItem{}
	}

	osName := osKey()
	appType := config.AppType{}
	categoryItems := map[string]*[]config.AppItem{
		categoryTerminal:      &appType.Terminal,
		categoryRemoteDesktop: &appType.RemoteDesktop,
		categoryFileTransfer:  &appType.FileTransfer,
		categoryDatabases:     &appType.Databases,
	}

	for _, entry := range index.Plugins {
		pluginDir := filepath.Join(builtinDir, entry.ID)
		var manifest manifest
		var connect connectFile
		var defaults defaultsFile

		if err := readJSON(filepath.Join(pluginDir, "manifest.json"), &manifest); err != nil {
			continue
		}
		if err := readJSON(filepath.Join(pluginDir, "connect.json"), &connect); err != nil {
			continue
		}
		_ = readJSON(filepath.Join(pluginDir, "defaults.json"), &defaults)

		platformConnect, ok := connect.Platforms[osName]
		if !ok {
			continue
		}
		platformDefaults := defaults.Platforms[osName]

		displayName := platformConnect.DisplayName
		if displayName == "" {
			displayName = manifest.DisplayName
		}

		argFormat, autoit := launchToArgFormat(platformConnect.Launch)
		path, isSet, isInternal := resolvePath(entry.ID, platformDefaults, platformConnect, state)
		matchFirst := buildMatchFirst(entry.ID, manifest.Category, manifest.Protocols, state.Selections, platformDefaults.MatchFirst)

		item := config.AppItem{
			Name:        manifest.Name,
			DisplayName: displayName,
			Protocol:    manifest.Protocols,
			Type:        manifest.Category,
			MatchFirst:  matchFirst,
			Path:        path,
			ArgFormat:   argFormat,
			AutoIt:      autoit,
			IsInternal:  isInternal,
			IsDefault:   platformDefaults.IsDefault,
			IsSet:       isSet,
		}

		if list, ok := categoryItems[manifest.Category]; ok {
			*list = append(*list, item)
		}
	}

	cfg := &config.AppConfig{}
	switch osName {
	case "windows":
		cfg.Windows = appType
	case "macos":
		cfg.MacOS = appType
	default:
		cfg.Linux = appType
	}

	return cfg, true
}
