package awaken

import (
	"fmt"
	"go-client/global"
	"go-client/pkg/config"
	"io/ioutil"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
)

/*{
	"id": "f",
	"value": "q",
	"protocol": "ssh",
	"command": "xxx"
	"file": {
		"name": "name",
		"content": "content",
	}
}*/

type File struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

type Endpoint struct {
	Host string `json:"host"`
	Port int    `json:"port"`
}

type Token struct {
	ID    string `json:"id"`
	Value string `json:"value"`
}

type Asset struct {
	ID       string `json:"id"`
	Category string `json:"category"`
	Type     string `json:"type"`
	Name     string `json:"name"`
	Address  string `json:"address"`
	DBInfo   `json:"info"`
}

type DBInfo struct {
	DBName           string `json:"db_name"`
	UseSsl           string `json:"use_ssl"`
	AllowInvalidCert string `json:"allow_invalid_cert"`
}

type Info struct {
	Version  string `json:"version"`
	Name     string `json:"name"`
	Protocol string `json:"protocol"`
	Command  string `json:"command"`
	Asset    `json:"asset"`
	Endpoint `json:"endpoint"`
	Token    `json:"token"`
	File     `json:"file"`
}

type Rouse struct {
	Info
}

func (r *Rouse) getUserName() string {
	username := r.Token.ID
	if r.Protocol == "ssh" || r.Protocol == "sftp" || r.Protocol == "telnet" {
		username = "JMS-" + username
	}
	return username
}

func (r *Rouse) getName() string {
	name, _ := url.QueryUnescape(r.Name)
	replacer := strings.NewReplacer(" ", "", ":", "_", "-", "_")
	return replacer.Replace(name)
}

// reportError 统一处理错误输出：记录日志并输出到 stderr
func reportError(msg string) {
	global.LOG.Error(msg)
	fmt.Fprintf(os.Stderr, "Error: %s\n", msg)
}

// reportErrorf 格式化错误消息并统一处理
func reportErrorf(format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	reportError(msg)
}

func removeCurRdpVncFile() {
	re := regexp.MustCompile(`(?i)\.(rdp|vnc|vncpaxx)$`)
	dir, _ := os.UserConfigDir()
	rd, _ := ioutil.ReadDir(filepath.Join(dir, "jumpserver-client"))
	for _, v := range rd {
		if !v.IsDir() && re.MatchString(v.Name()) {
			os.Remove(filepath.Join(dir, "jumpserver-client", v.Name()))
		}
	}
}

func currentRemoteDesktopApps(appConfig *config.AppConfig) []config.AppItem {
	switch runtime.GOOS {
	case "windows":
		return appConfig.Windows.RemoteDesktop
	case "darwin":
		return appConfig.MacOS.RemoteDesktop
	default:
		return appConfig.Linux.RemoteDesktop
	}
}

func currentDatabaseApps(appConfig *config.AppConfig) []config.AppItem {
	switch runtime.GOOS {
	case "windows":
		return appConfig.Windows.Databases
	case "darwin":
		return appConfig.MacOS.Databases
	default:
		return appConfig.Linux.Databases
	}
}

func currentTerminalApps(appConfig *config.AppConfig) []config.AppItem {
	switch runtime.GOOS {
	case "windows":
		return append(appConfig.Windows.Terminal, appConfig.Windows.FileTransfer...)
	case "darwin":
		return append(appConfig.MacOS.Terminal, appConfig.MacOS.FileTransfer...)
	default:
		return append(appConfig.Linux.Terminal, appConfig.Linux.FileTransfer...)
	}
}

func quoteConfiguredPath(path string) string {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return "(empty)"
	}
	return trimmed
}

func buildConfiguredAppDetails(apps []config.AppItem, protocol string) string {
	var matched []string
	for _, app := range apps {
		if !app.IsMatchProtocol(protocol) {
			continue
		}
		matched = append(matched, fmt.Sprintf("%s=%s", app.DisplayName, quoteConfiguredPath(app.Path)))
	}

	if len(matched) > 0 {
		return fmt.Sprintf("matched configured path(s): %s", strings.Join(matched, ", "))
	}

	var supported []string
	for _, app := range apps {
		if !app.IsSupportProtocol(protocol) || !app.IsActive() {
			continue
		}
		supported = append(supported, fmt.Sprintf("%s=%s", app.DisplayName, quoteConfiguredPath(app.Path)))
	}
	if len(supported) > 0 {
		return fmt.Sprintf("enabled application(s) support %s but none is selected via match_first: %s", protocol, strings.Join(supported, ", "))
	}

	return fmt.Sprintf("no enabled application is configured for protocol %s", protocol)
}

func missingAppError(label string, apps []config.AppItem, protocol string) string {
	return fmt.Sprintf("No %s application configured or found (%s)", label, buildConfiguredAppDetails(apps, protocol))
}

func (r *Rouse) HandleRDP(appConfig *config.AppConfig) {
	removeCurRdpVncFile()
	fileName, _ := url.QueryUnescape(r.File.Name)
	replacer := strings.NewReplacer(" ", "", ":", "_", "-", "_")
	dir, _ := os.UserConfigDir()
	filePath := filepath.Join(dir, "jumpserver-client", replacer.Replace(fileName)+".rdp")
	err := ioutil.WriteFile(filePath, []byte(r.Content), os.ModePerm)
	if err != nil {
		reportError(err.Error())
		return
	}
	cmd, resolveErr := handleRDP(r, filePath, appConfig)
	if resolveErr != nil {
		reportError(resolveErr.Error())
		return
	}
	if cmd != nil {
		if err := cmd.Run(); err != nil {
			reportErrorf("Failed to execute RDP application: %v", err)
		}
	} else {
		reportError("No RDP application configured or found")
	}
}

func (r *Rouse) HandleVNC(appConfig *config.AppConfig) {
	removeCurRdpVncFile()
	cmd, resolveErr := handleVNC(r, appConfig)
	if resolveErr != nil {
		reportError(resolveErr.Error())
		return
	}
	if cmd != nil {
		if err := cmd.Run(); err != nil {
			reportErrorf("Failed to execute VNC application: %v", err)
		}
	} else {
		reportError(missingAppError("VNC", currentRemoteDesktopApps(appConfig), "vnc"))
	}
}

func (r *Rouse) HandleSSH(appConfig *config.AppConfig) {
	cmd, resolveErr := handleSSH(r, appConfig)
	if resolveErr != nil {
		reportError(resolveErr.Error())
		return
	}
	if cmd != nil {
		if err := cmd.Run(); err != nil {
			reportErrorf("Failed to execute %s application: %v", strings.ToUpper(r.Protocol), err)
		}
	} else {
		reportError(missingAppError(strings.ToUpper(r.Protocol), currentTerminalApps(appConfig), r.Protocol))
	}
}

func (r *Rouse) HandleDB(appConfig *config.AppConfig) {
	cmd, resolveErr := handleDB(r, appConfig)
	if resolveErr != nil {
		reportError(resolveErr.Error())
		return
	}
	if cmd != nil {
		if err := cmd.Run(); err != nil {
			reportErrorf("Failed to execute database application: %v", err)
		}
	} else {
		reportError(missingAppError("database", currentDatabaseApps(appConfig), r.Protocol))
	}
}

func (r *Rouse) HandleCommand(appConfig *config.AppConfig) {
	cmd, resolveErr := handleCommand(r, appConfig)
	if resolveErr != nil {
		reportError(resolveErr.Error())
		return
	}
	if cmd != nil {
		if err := cmd.Run(); err != nil {
			reportErrorf("Failed to execute command: %v", err)
		}
	} else {
		reportError("No command application configured or found")
	}
}

func (r *Rouse) Run() {
	protocol := r.Protocol
	appConfig := config.GetConf()
	if r.Command == "" {
		switch protocol {
		case "rdp":
			r.HandleRDP(&appConfig)
		case "vnc":
			r.HandleVNC(&appConfig)
		case "ssh", "sftp", "telnet":
			r.HandleSSH(&appConfig)
		case "mysql", "mariadb", "postgresql", "redis", "oracle", "sqlserver", "mongodb":
			r.HandleDB(&appConfig)
		default:
			reportErrorf("Unsupported protocol: %s", protocol)
		}
	} else {
		r.HandleCommand(&appConfig)
	}

}
