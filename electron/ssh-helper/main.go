package main

import (
	"errors"
	"fmt"
	"io"
	"net"
	"os"
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
)

type options struct {
	username string
	host     string
	port     int
	password string
}

func parseOptions(args []string) (options, error) {
	if len(args) > 0 && args[0] == "ssh" {
		args = args[1:]
	}

	parsed := options{port: defaultPort}
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

func terminalSize(fd int) (width, height int) {
	width, height, err := term.GetSize(fd)
	if err != nil || width < 1 || height < 1 {
		return defaultWidth, defaultHeight
	}
	return width, height
}

func run(args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	parsed, err := parseOptions(args)
	if err != nil {
		fmt.Fprintf(stderr, "SSH connection failed: %v\n", err)
		return 1
	}

	config := &ssh.ClientConfig{
		User:            parsed.username,
		Auth:            []ssh.AuthMethod{ssh.Password(parsed.password)},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // JumpServer issues a short-lived local proxy endpoint.
		Timeout:         time.Minute,
	}
	client, err := ssh.Dial("tcp", net.JoinHostPort(parsed.host, strconv.Itoa(parsed.port)), config)
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

func main() {
	os.Exit(run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr))
}
