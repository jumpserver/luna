package plugin

import "go-client/pkg/config"

func init() {
	config.SetPluginLoader(func(configDir string) (*config.AppConfig, bool) {
		return LoadAppConfig(configDir)
	})
}
