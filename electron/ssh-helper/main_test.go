package main

import "testing"

func TestParseOptions(t *testing.T) {
	parsed, err := parseOptions([]string{"ssh", "JMS-id@localhost", "-p", "2222", "-P", "secret"})
	if err != nil {
		t.Fatal(err)
	}
	want := options{username: "JMS-id", host: "localhost", port: 2222, password: "secret"}
	if parsed != want {
		t.Fatalf("parseOptions() = %#v, want %#v", parsed, want)
	}
}

func TestParseOptionsRejectsInvalidArguments(t *testing.T) {
	tests := [][]string{
		{"user@host", "-p", "70000"},
		{"user@host", "--unknown"},
		{"host"},
	}
	for _, args := range tests {
		if _, err := parseOptions(args); err == nil {
			t.Fatalf("parseOptions(%q) unexpectedly succeeded", args)
		}
	}
}

func TestParseOptionsAcceptsIPv6Destination(t *testing.T) {
	parsed, err := parseOptions([]string{"user@[::1]"})
	if err != nil {
		t.Fatal(err)
	}
	if parsed.host != "::1" {
		t.Fatalf("host = %q, want ::1", parsed.host)
	}
}
