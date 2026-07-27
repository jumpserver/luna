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
	ID       string `json:"id"`
	Name     string `json:"name"`
	Category string `json:"category"`
}

type pluginState struct {
	Version           int                        `json:"version"`
	Selections        map[string]string          `json:"selections"`
	EnabledSelections map[string][]string        `json:"enabled_selections"`
	Plugins           map[string]pluginStateItem `json:"plugins"`
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

type platformConnect struct {
	DisplayName string                 `json:"display_name"`
	Executable  executableConfig       `json:"executable"`
	Launch      map[string]interface{} `json:"launch"`
	MatchFirst  []string               `json:"match_first"`
	IsDefault   bool                   `json:"is_default"`
	IsSet       bool                   `json:"is_set"`
	IsInternal  bool                   `json:"is_internal"`
}

type executableConfig struct {
	Type    string `json:"type"`
	Default string `json:"default"`
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
	osName := osKey()

	if exe, err := os.Executable(); err == nil {
		base := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(base, "resources", "plugins", osName),
			filepath.Join(base, "..", "resources", "plugins", osName),
			filepath.Join(base, "..", "..", "plugins", osName),
			filepath.Join(base, "..", "..", "resources", "plugins", osName),
			filepath.Join(base, "plugins", osName),
			filepath.Join(base, "resources", "plugins", "builtin"),
			filepath.Join(base, "..", "resources", "plugins", "builtin"),
			filepath.Join(base, "..", "..", "plugins", "builtin"),
			filepath.Join(base, "..", "..", "resources", "plugins", "builtin"),
			filepath.Join(base, "plugins", "builtin"),
		)
	}

	if cwd, err := os.Getwd(); err == nil {
		candidates = append(candidates,
			filepath.Join(cwd, "plugins", osName),
			filepath.Join(cwd, "..", "plugins", osName),
			filepath.Join(cwd, "..", "..", "plugins", osName),
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

	osName := osKey()
	candidates := []string{
		filepath.Join("plugins", osName, "plugins-state.defaults.json"),
		filepath.Join("..", "plugins", osName, "plugins-state.defaults.json"),
		filepath.Join("..", "..", "plugins", osName, "plugins-state.defaults.json"),
		filepath.Join("plugins", "plugins-state.defaults.json"),
		filepath.Join("..", "plugins", "plugins-state.defaults.json"),
		filepath.Join("..", "..", "plugins", "plugins-state.defaults.json"),
	}
	if exe, err := os.Executable(); err == nil {
		base := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(base, "resources", "plugins", osName, "plugins-state.defaults.json"),
			filepath.Join(base, "..", "..", "plugins", osName, "plugins-state.defaults.json"),
			filepath.Join(base, "..", "..", "resources", "plugins", osName, "plugins-state.defaults.json"),
			filepath.Join(base, "resources", "plugins", "plugins-state.defaults.json"),
			filepath.Join(base, "..", "..", "plugins", "plugins-state.defaults.json"),
			filepath.Join(base, "..", "..", "resources", "plugins", "plugins-state.defaults.json"),
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

func readConnect(path, osName string) (platformConnect, bool, error) {
	var raw map[string]json.RawMessage
	if err := readJSON(path, &raw); err != nil {
		return platformConnect{}, false, err
	}

	if platformsRaw, ok := raw["platforms"]; ok {
		var platforms map[string]platformConnect
		if err := json.Unmarshal(platformsRaw, &platforms); err != nil {
			return platformConnect{}, false, err
		}
		connect, ok := platforms[osName]
		return connect, ok, nil
	}

	var connect platformConnect
	data, err := os.ReadFile(path)
	if err != nil {
		return platformConnect{}, false, err
	}
	if err := json.Unmarshal(data, &connect); err != nil {
		return platformConnect{}, false, err
	}
	return connect, true, nil
}

func sanitizeState(state *pluginState) bool {
	if state == nil || state.Selections == nil {
		return false
	}

	changed := false
	osName := osKey()
	for key, value := range state.Selections {
		if strings.HasPrefix(value, "builtin.") {
			state.Selections[key] = osName + strings.TrimPrefix(value, "builtin")
			changed = true
		}
	}
	for pluginID, item := range state.Plugins {
		if strings.HasPrefix(pluginID, "builtin.") {
			state.Plugins[osName+strings.TrimPrefix(pluginID, "builtin")] = item
			delete(state.Plugins, pluginID)
			changed = true
		}
	}

	if runtime.GOOS != "windows" {
		for _, key := range []string{"terminal:ssh", "terminal:telnet"} {
			if state.Selections[key] == osName+".putty" {
				state.Selections[key] = osName + ".terminal"
				changed = true
			}
		}
	}

	if runtime.GOOS == "linux" {
		switch state.Selections["remotedesktop:rdp"] {
		case "linux.mstsc", "linux.remmina":
			state.Selections["remotedesktop:rdp"] = "linux.xfreerdp"
			changed = true
		}
	}
	if state.Selections["filetransfer:sftp"] != osName+".iterm-sftp" {
		return changed
	}

	item, ok := state.Plugins[osName+".iterm-sftp"]
	if ok && (item.Enabled || strings.TrimSpace(item.Path) != "") {
		return changed
	}

	delete(state.Selections, "filetransfer:sftp")
	return true
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

func resolvePath(pluginID string, connect platformConnect, state pluginState) (string, bool, bool) {
	userPath := ""
	enabled := true
	hasUserPlugin := false
	if item, ok := state.Plugins[pluginID]; ok {
		hasUserPlugin = true
		userPath = strings.TrimSpace(item.Path)
		enabled = item.Enabled
	}

	path := connect.Executable.Default
	if userPath != "" {
		path = userPath
	}

	isSet := (connect.IsSet || userPath != "" || (connect.IsInternal && path != "" && hasUserPlugin)) && enabled
	return path, isSet, connect.IsInternal
}

func buildMatchFirst(pluginID, category string, protocols []string, selections map[string]string) []string {
	matched := []string{}
	for _, proto := range protocols {
		key := category + ":" + proto
		if selections[key] == pluginID {
			matched = append(matched, proto)
		}
	}
	return matched
}

func buildEnabledProtocols(
	pluginID, category string,
	protocols []string,
	selections map[string]string,
	enabledSelections map[string][]string,
) []string {
	enabled := []string{}
	for _, proto := range protocols {
		key := category + ":" + proto
		pluginIDs, explicitlyConfigured := enabledSelections[key]
		if !explicitlyConfigured {
			if selections[key] == pluginID {
				enabled = append(enabled, proto)
			}
			continue
		}
		for _, enabledPluginID := range pluginIDs {
			if enabledPluginID == pluginID {
				enabled = append(enabled, proto)
				break
			}
		}
	}
	return enabled
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
	if sanitizeState(&state) {
		if raw, err := json.MarshalIndent(state, "", "  "); err == nil {
			_ = os.WriteFile(statePath, raw, 0644)
		}
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

		if err := readJSON(filepath.Join(pluginDir, "manifest.json"), &manifest); err != nil {
			continue
		}
		platformConnect, ok, err := readConnect(filepath.Join(pluginDir, "connect.json"), osName)
		if err != nil || !ok || platformConnect.Executable.Type == "" {
			continue
		}

		displayName := platformConnect.DisplayName
		if displayName == "" {
			displayName = manifest.DisplayName
		}

		argFormat, autoit := launchToArgFormat(platformConnect.Launch)
		matchFirst := buildMatchFirst(entry.ID, manifest.Category, manifest.Protocols, state.Selections)
		enabledProtocols := buildEnabledProtocols(
			entry.ID,
			manifest.Category,
			manifest.Protocols,
			state.Selections,
			state.EnabledSelections,
		)
		path, isSet, isInternal := resolvePath(entry.ID, platformConnect, state)
		if len(enabledProtocols) > 0 {
			isSet = true
		}

		item := config.AppItem{
			Name:             manifest.Name,
			DisplayName:      displayName,
			Protocol:         manifest.Protocols,
			Type:             manifest.Category,
			MatchFirst:       matchFirst,
			EnabledProtocols: enabledProtocols,
			Path:             path,
			ArgFormat:        argFormat,
			AutoIt:           autoit,
			IsInternal:       isInternal,
			IsDefault:        platformConnect.IsDefault,
			IsSet:            isSet,
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
