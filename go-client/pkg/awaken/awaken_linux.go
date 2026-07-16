package awaken

import (
	"fmt"
	"go-client/global"
	"go-client/pkg/config"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

func getCommandFromArgs(connectInfo map[string]string, argFormat string) string {
	for key, value := range connectInfo {
		argFormat = strings.Replace(argFormat, "{"+key+"}", value, 1)
	}
	return argFormat
}

// validateAppPath checks if the application path exists
func validateAppPath(appPath string) error {
	if appPath == "" {
		return fmt.Errorf("application path is empty")
	}
	// Check if path exists
	if _, err := os.Stat(appPath); os.IsNotExist(err) {
		return fmt.Errorf("application path does not exist: %s", appPath)
	}
	return nil
}

func shellQuote(value string) string {
	if value == "" {
		return "''"
	}
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}

func buildLinuxClientSnippet(clientPath, commands string) string {
	return fmt.Sprintf("%s %s", shellQuote(clientPath), commands)
}

func splitArgsWithLiteral(template string, literals map[string]string) []string {
	if strings.TrimSpace(template) == "" {
		return nil
	}

	replaced := template
	tokenValues := map[string]string{}
	index := 0

	for placeholder, value := range literals {
		token := fmt.Sprintf("__JMS_LITERAL_%d__", index)
		replaced = strings.ReplaceAll(replaced, placeholder, token)
		tokenValues[token] = value
		index++
	}

	fields := strings.Fields(replaced)
	args := make([]string, 0, len(fields))
	for _, field := range fields {
		if value, ok := tokenValues[field]; ok {
			args = append(args, value)
			continue
		}
		for token, value := range tokenValues {
			field = strings.ReplaceAll(field, token, value)
		}
		args = append(args, field)
	}

	return args
}

func buildLinuxTerminalCommand(terminalPath, clientPath, commands string) *exec.Cmd {
	terminalName := strings.ToLower(filepath.Base(strings.TrimSpace(terminalPath)))
	if terminalName == "" {
		return nil
	}

	snippet := buildLinuxClientSnippet(clientPath, commands)

	switch terminalName {
	case "gnome-terminal":
		return exec.Command(terminalPath, "--", "bash", "-c",
			fmt.Sprintf("%s; exec bash -i", snippet),
		)
	case "x-terminal-emulator":
		return exec.Command(terminalPath, "-e", "bash", "-lc", snippet)
	case "deepin-terminal":
		return exec.Command(terminalPath, "--keep-open", "-C", snippet)
	case "konsole":
		return exec.Command(terminalPath, "--noclose", "-e", "bash", "-lc", snippet)
	case "xfce4-terminal":
		return exec.Command(terminalPath, "--hold", "-e", "bash", "-lc", snippet)
	case "lxterminal":
		return exec.Command(terminalPath, "-e", "bash", "-lc", snippet)
	case "xterm":
		return exec.Command(terminalPath, "-hold", "-e", "bash", "-lc", snippet)
	default:
		return nil
	}
}

func awakenRDPCommand(filePath string, cfg *config.AppConfig) *exec.Cmd {
	global.LOG.Debug(filePath)
	var appItem *config.AppItem
	appLst := cfg.Linux.RemoteDesktop
	for _, app := range appLst {
		if app.IsActive() && app.IsMatchProtocol("rdp") {
			appItem = &app
			break
		}
	}
	if appItem == nil {
		return nil
	}
	args := splitArgsWithLiteral(appItem.ArgFormat, map[string]string{
		"{file}": filePath,
	})
	cmd := exec.Command(appItem.Name, args...)
	return cmd
}

func awakenVNCCommand(r *Rouse, cfg *config.AppConfig) *exec.Cmd {
	var appItem *config.AppItem
	appLst := cfg.Linux.RemoteDesktop
	for _, app := range appLst {
		if app.IsActive() && app.IsMatchProtocol("vnc") {
			appItem = &app
			break
		}
	}
	if appItem == nil {
		return nil
	}
	connectMap := map[string]string{
		"name":     r.getName(),
		"protocol": r.Protocol,
		"username": r.getUserName(),
		"value":    r.Value,
		"host":     r.Host,
		"port":     strconv.Itoa(r.Port),
	}

	if !appItem.IsInternal {
		if err := validateAppPath(appItem.Path); err != nil {
			global.LOG.Error(err.Error())
			return nil
		}
	}
	commands := getCommandFromArgs(connectMap, appItem.ArgFormat)
	cmd := exec.Command(appItem.Path, strings.Split(commands, " ")...)
	// 设置环境变量（只对这个子进程有效）
	cmd.Env = append(os.Environ(),
		"VNC_USERNAME="+r.getUserName(),
		"VNC_PASSWORD="+r.Value,
	)
	return cmd
}

func awakenSSHCommand(r *Rouse, cfg *config.AppConfig) *exec.Cmd {
	var appItem *config.AppItem
	var appLst []config.AppItem
	switch r.Protocol {
	case "ssh", "telnet":
		appLst = cfg.Linux.Terminal
	case "sftp":
		appLst = append(cfg.Linux.FileTransfer, cfg.Linux.Terminal...)
	}

	for _, app := range appLst {
		if app.IsActive() && app.IsMatchProtocol(r.Protocol) {
			appItem = &app
			break
		}
	}
	if appItem == nil {
		return nil
	}

	// telnet 协议使用 ssh 的配置参数格式
	protocol := r.Protocol
	if protocol == "telnet" {
		protocol = "ssh"
	}

	var cmd *exec.Cmd
	connectMap := map[string]string{
		"name":     r.getName(),
		"protocol": protocol,
		"username": r.getUserName(),
		"value":    r.Value,
		"host":     r.Host,
		"port":     strconv.Itoa(r.Port),
	}

	if appItem.IsInternal {
		currentPath, _ := filepath.Abs(filepath.Dir(os.Args[0]))
		commands := getCommandFromArgs(connectMap, appItem.ArgFormat)
		clientPath := filepath.Join(currentPath, "client")
		if appItem.Path != "" {
			cmd = buildLinuxTerminalCommand(appItem.Path, clientPath, commands)
		}
		if cmd == nil {
			out, err := exec.Command("bash", "-c", "echo $XDG_CURRENT_DESKTOP").CombinedOutput()
			if err != nil {
				global.LOG.Error(fmt.Sprintf("Failed to detect desktop environment: %v", err))
				return nil
			}

			currentDesktop := strings.ToLower(strings.TrimSpace(string(out)))
			snippet := buildLinuxClientSnippet(clientPath, commands)

			switch currentDesktop {
			case "gnome", "ubuntu:gnome", "ukui", "cinnamon", "x-cinnamon":
				cmd = exec.Command("gnome-terminal", "--", "bash", "-c",
					fmt.Sprintf("%s; exec bash -i", snippet),
				)
			case "unity":
				cmd = exec.Command("x-terminal-emulator", "-e", "bash", "-lc", snippet)
			case "deepin":
				cmd = exec.Command("deepin-terminal", "--keep-open", "-C", snippet)
			case "kde":
				cmd = exec.Command("konsole", "--noclose", "-e", "bash", "-lc", snippet)
			case "xfce":
				cmd = exec.Command("xfce4-terminal", "--hold", "-e", "bash", "-lc", snippet)
			case "lxde":
				cmd = exec.Command("lxterminal", "-e", "bash", "-lc", snippet)
			default:
				msg := fmt.Sprintf("Not yet supported %s desktop system", currentDesktop)
				global.LOG.Info(msg)
			}
		}
	} else {
		if r.Protocol == "sqlserver" {
			connectMap["protocol"] = "mssql_jdbc_ms_new"
		}
		appPath := appItem.Path
		if !appItem.IsInternal {
			if err := validateAppPath(appItem.Path); err != nil {
				global.LOG.Error(err.Error())
				return nil
			}
		}
		commands := getCommandFromArgs(connectMap, appItem.ArgFormat)
		cmd = exec.Command(appPath, strings.Split(commands, " ")...)
	}
	return cmd
}

func awakenDBCommand(r *Rouse, cfg *config.AppConfig) *exec.Cmd {
	var appItem *config.AppItem
	appLst := cfg.Linux.Databases
	for _, app := range appLst {
		if app.IsActive() && app.IsMatchProtocol(r.Protocol) {
			appItem = &app
			break
		}
	}
	if appItem == nil {
		return nil
	}
	var cmd *exec.Cmd
	connectMap := map[string]string{
		"name":     r.getName(),
		"protocol": r.Protocol,
		"username": r.getUserName(),
		"value":    r.Value,
		"host":     r.Host,
		"port":     strconv.Itoa(r.Port),
		"dbname":   r.DBName,
	}
	if r.Protocol == "oracle" {
		connectMap["dbname"] = r.getUserName()
	}
	if appItem.IsInternal {
		var argFormat string
		switch r.Protocol {
		case "redis":
			argFormat = "redis-cli -h {host} -p {port} -a {username}@{value}"
		case "oracle":
			argFormat = "sqlplus {username}/{value}@{host}:{port}/{dbname}"
		case "postgresql":
			argFormat = "psql 'user={username} password={value} host={host} dbname={dbname} port={port}'"
		case "mysql", "mariadb":
			argFormat = "mysql -u {username} -p{value} -h {host} -P {port} {dbname}"
		case "sqlserver":
			argFormat = "sqlcmd -S {host},{port} -U {username} -P {value} -d {dbname}"
		case "mongodb":
			argFormat = "mongosh mongodb://{username}:{value}@{host}:{port}/{dbname}"
		}
		commands := getCommandFromArgs(connectMap, argFormat)

		out, _ := exec.Command("bash", "-c", "echo $XDG_CURRENT_DESKTOP").CombinedOutput()
		currentDesktop := strings.ToLower(strings.Trim(string(out), "\n"))

		switch currentDesktop {
		case "gnome", "ubuntu:gnome", "ukui":
			cmd = exec.Command(
				"gnome-terminal", "--", "bash", "-c",
				fmt.Sprintf("%s; exec bash -i", commands),
			)
		case "deepin":
			cmd = exec.Command("deepin-terminal", "--keep-open", "-C", commands)
		default:
			msg := fmt.Sprintf("Not yet supported %s desktop system", currentDesktop)
			global.LOG.Info(msg)
		}
		return cmd
	} else {
		appPath := appItem.Path
		if !appItem.IsInternal {
			if err := validateAppPath(appItem.Path); err != nil {
				global.LOG.Error(err.Error())
				return nil
			}
		}
		commands := getCommandFromArgs(connectMap, appItem.ArgFormat)
		return exec.Command(appPath, strings.Split(commands, " ")...)
	}
}

func awakenOtherCommand(r *Rouse, cfg *config.AppConfig) *exec.Cmd {
	cmd := new(exec.Cmd)
	return cmd
}
