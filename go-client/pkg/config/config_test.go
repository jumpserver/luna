package config

import "testing"

func TestAppItemIsSelectedForProtocol(t *testing.T) {
	item := AppItem{
		Name:             "terminal",
		Protocol:         []string{"ssh", "telnet"},
		MatchFirst:       []string{"ssh"},
		EnabledProtocols: []string{"ssh", "telnet"},
	}

	if !item.IsSelectedForProtocol("ssh", "") {
		t.Fatal("expected match_first client to be used when no client is specified")
	}
	if !item.IsSelectedForProtocol("telnet", "terminal") {
		t.Fatal("expected explicitly selected client to override match_first")
	}
	if item.IsSelectedForProtocol("rdp", "terminal") {
		t.Fatal("explicit client must still support the requested protocol")
	}
	if item.IsSelectedForProtocol("ssh", "iterm") {
		t.Fatal("expected a different explicitly selected client not to match")
	}
}
