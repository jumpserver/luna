package main

import (
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/term"
)

const (
	defaultPort   = 22
	defaultWidth  = 120
	defaultHeight = 30

	sftpTransportEnv = "JMS_SSH_SFTP_TRANSPORT"
	sftpUsernameEnv  = "JMS_SSH_SFTP_USERNAME"
	sftpHostEnv      = "JMS_SSH_SFTP_HOST"
	sftpPortEnv      = "JMS_SSH_SFTP_PORT"
	sftpPasswordEnv  = "JMS_SSH_SFTP_PASSWORD"
)

type options struct {
	protocol string
	username string
	host     string
	port     int
	password string
}

func parseOptions(args []string) (options, error) {
	parsed := options{port: defaultPort}
	if len(args) > 0 {
		switch args[0] {
		case "ssh":
			args = args[1:]
		case "sftp":
			parsed.protocol = "sftp"
			args = args[1:]
		}
	}

	destination := ""
	for index := 0; index < len(args); index++ {
		value := args[index]
		switch value {
		case "-p", "-P":
			index++
			if index >= len(args) {
				return options{}, fmt.Errorf("missing value for %s", value)
			}
			if value == "-P" {
				parsed.password = args[index]
				continue
			}
			port, err := strconv.Atoi(args[index])
			if err != nil || port < 1 || port > 65535 {
				return options{}, errors.New("invalid SSH port")
			}
			parsed.port = port
		default:
			if strings.HasPrefix(value, "-") || destination != "" {
				return options{}, fmt.Errorf("unsupported SSH helper argument: %s", value)
			}
			destination = value
		}
	}

	separator := strings.LastIndex(destination, "@")
	if separator < 1 || separator == len(destination)-1 {
		return options{}, errors.New("destination must be username@host")
	}
	parsed.username = destination[:separator]
	parsed.host = strings.Trim(destination[separator+1:], "[]")
	return parsed, nil
}

func sftpTransportOptions() (options, error) {
	parsed := options{
		protocol: "sftp",
		username: os.Getenv(sftpUsernameEnv),
		host:     os.Getenv(sftpHostEnv),
		password: os.Getenv(sftpPasswordEnv),
	}
	port, err := strconv.Atoi(os.Getenv(sftpPortEnv))
	if err != nil || port < 1 || port > 65535 {
		return options{}, errors.New("invalid SFTP transport port")
	}
	parsed.port = port
	if parsed.username == "" || parsed.host == "" {
		return options{}, errors.New("missing SFTP transport destination")
	}
	return parsed, nil
}

func terminalSize(fd int) (width, height int) {
	width, height, err := term.GetSize(fd)
	if err != nil || width < 1 || height < 1 {
		return defaultWidth, defaultHeight
	}
	return width, height
}

func dial(parsed options) (*ssh.Client, error) {
	config := &ssh.ClientConfig{
		User:            parsed.username,
		Auth:            []ssh.AuthMethod{ssh.Password(parsed.password)},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // JumpServer issues a short-lived local proxy endpoint.
		Timeout:         time.Minute,
	}
	return ssh.Dial("tcp", net.JoinHostPort(parsed.host, strconv.Itoa(parsed.port)), config)
}

func runSSH(parsed options, stdin io.Reader, stdout, stderr io.Writer) int {
	client, err := dial(parsed)
	if err != nil {
		fmt.Fprintf(stderr, "SSH connection failed: %v\n", err)
		return 1
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		fmt.Fprintf(stderr, "SSH connection failed: %v\n", err)
		return 1
	}
	defer session.Close()

	session.Stdin = stdin
	session.Stdout = stdout
	session.Stderr = stderr

	input, inputIsFile := stdin.(*os.File)
	output, outputIsFile := stdout.(*os.File)
	width, height := defaultWidth, defaultHeight
	if outputIsFile {
		width, height = terminalSize(int(output.Fd()))
	}
	terminalName := os.Getenv("TERM")
	if terminalName == "" {
		terminalName = "xterm-256color"
	}
	if err := session.RequestPty(terminalName, height, width, ssh.TerminalModes{ssh.ECHO: 1}); err != nil {
		fmt.Fprintf(stderr, "SSH connection failed: %v\n", err)
		return 1
	}

	var restore func()
	if inputIsFile && term.IsTerminal(int(input.Fd())) {
		state, rawError := term.MakeRaw(int(input.Fd()))
		if rawError != nil {
			fmt.Fprintf(stderr, "SSH connection failed: %v\n", rawError)
			return 1
		}
		restore = func() { _ = term.Restore(int(input.Fd()), state) }
		defer restore()
	}

	stopResize := watchTerminalResize(session, output)
	defer stopResize()

	if err := session.Shell(); err != nil {
		fmt.Fprintf(stderr, "SSH connection failed: %v\n", err)
		return 1
	}
	if err := session.Wait(); err != nil {
		var exitError *ssh.ExitError
		if errors.As(err, &exitError) {
			return exitError.ExitStatus()
		}
		fmt.Fprintf(stderr, "SSH connection failed: %v\n", err)
		return 1
	}
	return 0
}

func runSFTPTransport(parsed options, stdin io.Reader, stdout, stderr io.Writer) int {
	client, err := dial(parsed)
	if err != nil {
		fmt.Fprintf(stderr, "SFTP connection failed: %v\n", err)
		return 1
	}
	defer client.Close()

	channel, requests, err := client.OpenChannel("session", nil)
	if err != nil {
		fmt.Fprintf(stderr, "SFTP connection failed: %v\n", err)
		return 1
	}
	defer channel.Close()
	go ssh.DiscardRequests(requests)

	payload := ssh.Marshal(struct{ Subsystem string }{Subsystem: "sftp"})
	accepted, err := channel.SendRequest("subsystem", true, payload)
	if err != nil {
		fmt.Fprintf(stderr, "SFTP connection failed: %v\n", err)
		return 1
	}
	if !accepted {
		fmt.Fprintln(stderr, "SFTP connection failed: ssh: subsystem request failed")
		return 1
	}

	go func() {
		_, _ = io.Copy(channel, stdin)
		_ = channel.CloseWrite()
	}()
	go func() {
		_, _ = io.Copy(stderr, channel.Stderr())
	}()
	if _, err := io.Copy(stdout, channel); err != nil {
		fmt.Fprintf(stderr, "SFTP connection failed: %v\n", err)
		return 1
	}
	return 0
}

func runSFTP(parsed options, stdin io.Reader, stdout, stderr io.Writer) int {
	helperPath, err := os.Executable()
	if err != nil {
		fmt.Fprintf(stderr, "SFTP connection failed: %v\n", err)
		return 1
	}
	sftpPath, err := exec.LookPath("sftp")
	if err != nil {
		fmt.Fprintln(stderr, "SFTP connection failed: sftp client not found")
		return 1
	}
	host := parsed.host
	if strings.Contains(host, ":") {
		host = "[" + host + "]"
	}
	// OpenSSH sftp provides the interactive client and calls this executable via -S
	// to open the token-authenticated SFTP subsystem transport.
	command := exec.Command(sftpPath, "-S", helperPath, "-P", strconv.Itoa(parsed.port), parsed.username+"@"+host)
	command.Stdin = stdin
	command.Stdout = stdout
	command.Stderr = stderr
	command.Env = append(os.Environ(),
		sftpTransportEnv+"=1",
		sftpUsernameEnv+"="+parsed.username,
		sftpHostEnv+"="+parsed.host,
		sftpPortEnv+"="+strconv.Itoa(parsed.port),
		sftpPasswordEnv+"="+parsed.password,
	)
	if err := command.Run(); err != nil {
		var exitError *exec.ExitError
		if errors.As(err, &exitError) {
			return exitError.ExitCode()
		}
		fmt.Fprintf(stderr, "SFTP connection failed: %v\n", err)
		return 1
	}
	return 0
}

func run(args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	parsed, err := parseOptions(args)
	if err != nil {
		protocol := "SSH"
		if len(args) > 0 && args[0] == "sftp" {
			protocol = "SFTP"
		}
		fmt.Fprintf(stderr, "%s connection failed: %v\n", protocol, err)
		return 1
	}
	if parsed.protocol == "sftp" {
		return runSFTP(parsed, stdin, stdout, stderr)
	}
	return runSSH(parsed, stdin, stdout, stderr)
}

func main() {
	if os.Getenv(sftpTransportEnv) == "1" {
		parsed, err := sftpTransportOptions()
		if err != nil {
			fmt.Fprintf(os.Stderr, "SFTP connection failed: %v\n", err)
			os.Exit(1)
		}
		os.Exit(runSFTPTransport(parsed, os.Stdin, os.Stdout, os.Stderr))
	}
	os.Exit(run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr))
}
