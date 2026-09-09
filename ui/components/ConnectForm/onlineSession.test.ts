import type { PermedAccount } from "~/types";
import { describe, expect, it } from "vitest";
import { resolveOnlineSessionAccount } from "./onlineSession";

const account = (partial: Partial<PermedAccount> & Pick<PermedAccount, "alias" | "username">): PermedAccount => ({
  date_expired: "",
  has_secret: true,
  has_username: true,
  id: partial.id || partial.alias || partial.username,
  name: partial.name || partial.username,
  secret_type: "password",
  actions: [],
  ...partial
});

describe("resolveOnlineSessionAccount", () => {
  it("returns null when the setting is off, protocol is not rdp, or username is empty", () => {
    const hosted = account({ alias: "admin", username: "admin" });
    expect(
      resolveOnlineSessionAccount({
        enabled: false,
        protocol: "rdp",
        accounts: [hosted],
        selectedAccount: "admin",
        manualUsername: ""
      })
    ).toBeNull();
    expect(
      resolveOnlineSessionAccount({
        enabled: true,
        protocol: "ssh",
        accounts: [hosted],
        selectedAccount: "admin",
        manualUsername: ""
      })
    ).toBeNull();
    expect(
      resolveOnlineSessionAccount({
        enabled: true,
        protocol: "rdp",
        accounts: [hosted],
        selectedAccount: "",
        manualUsername: ""
      })
    ).toBeNull();
  });

  it("uses the hosted account username for rdp", () => {
    expect(
      resolveOnlineSessionAccount({
        enabled: true,
        protocol: "RDP",
        accounts: [account({ alias: "admin", name: "Admin", username: "administrator" })],
        selectedAccount: "Admin",
        manualUsername: ""
      })
    ).toBe("administrator");
  });

  it("uses the manual username for input accounts and accounts without a secret", () => {
    expect(
      resolveOnlineSessionAccount({
        enabled: true,
        protocol: "rdp",
        accounts: [account({ alias: "@INPUT", name: "手动输入", username: "", has_secret: false })],
        selectedAccount: "手动输入",
        manualUsername: "alice",
        manualInputLabel: "手动输入"
      })
    ).toBe("alice");
    expect(
      resolveOnlineSessionAccount({
        enabled: true,
        protocol: "rdp",
        accounts: [account({ alias: "win", name: "win", username: "win", has_secret: false })],
        selectedAccount: "win",
        manualUsername: "bob"
      })
    ).toBe("bob");
  });

  it("prefers the personal credential username", () => {
    expect(
      resolveOnlineSessionAccount({
        enabled: true,
        protocol: "rdp",
        accounts: [account({ alias: "@INPUT", username: "", has_secret: false })],
        selectedAccount: "@INPUT",
        manualUsername: "alice",
        personalCredentialUsername: "carol"
      })
    ).toBe("carol");
  });
});
