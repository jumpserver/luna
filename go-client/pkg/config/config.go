package config

import (
	"encoding/json"
	"go-client/global"
	"os"
	"path/filepath"
)

type AppConfig struct {
	FileName string  `json:"filename"`
	Windows  AppType `json:"windows"`
	MacOS    AppType `json:"macos"`
	Linux    AppType `json:"linux"`
}

type AppType struct {
	Terminal      []AppItem `json:"terminal"`
	FileTransfer  []AppItem `json:"filetransfer"`
	RemoteDesktop []AppItem `json:"remotedesktop"`
	Databases     []AppItem `json:"databases"`
}

type AppItem struct {
	Name        string          `json:"name"`
	DisplayName string          `json:"display_name"`
	Protocol    []string        `json:"protocol"`
	Type        string          `json:"type"`
	MatchFirst  []string        `json:"match_first"`
	Path        string          `json:"path"`
	ArgFormat   string          `json:"arg_format"`
	AutoIt      []AutoItCommand `json:"autoit"`
	IsInternal  bool            `json:"is_internal"`
	IsDefault   bool            `json:"is_default"`
	IsSet       bool            `json:"is_set"`
}

type AutoItCommand struct {
	Cmd     string `json:"cmd"`
	Type    string `json:"type"`
	Element string `json:"element"`
}

func (a *AppItem) IsActive() bool {
	if a.IsSet {
		return true
	}
	return false
}

func (a *AppItem) IsSupportProtocol(protocol string) bool {
	for _, p := range a.Protocol {
		if p == protocol {
			return true
		}
	}
	return false
}

func (a *AppItem) IsMatchProtocol(protocol string) bool {
	for _, p := range a.MatchFirst {
		if p == protocol {
			return true
		}
	}
	return false
}

func GetConf() AppConfig {
	if GlobalConfig == nil {
		return getDefaultConfig()
	}
	return *GlobalConfig
}

var GlobalConfig *AppConfig

func getDefaultConfig() AppConfig {
	dir, _ := os.UserConfigDir()
	configDir := filepath.Join(dir, "jumpserver-client")

	// Plugin mode: build AppConfig from plugins/builtin
	if pluginCfg, ok := loadPluginConfig(configDir); ok {
		GlobalConfig = pluginCfg
		return *GlobalConfig
	}

	filePath := filepath.Join(configDir, "config.json")
	jsonFile, err := os.Open(filePath)
	if err != nil {
		global.LOG.Error(err.Error())
		return AppConfig{}
	}
	defer func(jsonFile *os.File) {
		err := jsonFile.Close()
		if err != nil {
			global.LOG.Error(err.Error())
		}
	}(jsonFile)
	decoder := json.NewDecoder(jsonFile)
	err = decoder.Decode(&GlobalConfig)
	if err != nil {
		global.LOG.Error(err.Error())
		return AppConfig{}
	}
	return *GlobalConfig
}

// loadPluginConfig is implemented in pkg/plugin to avoid an import cycle.
var loadPluginConfig = func(configDir string) (*AppConfig, bool) {
	return nil, false
}

// SetPluginLoader registers the plugin config loader (called from plugin init).
func SetPluginLoader(loader func(string) (*AppConfig, bool)) {
	loadPluginConfig = loader
}
