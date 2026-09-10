import { describe, expect, it } from "vitest";
import { getDirectSshCommand } from "./sshGuide";

const options = {
  username: "admin",
  account: "account-id",
  inputUsername: "root",
  accounts: [],
  assetId: "asset-id",
  host: "gateway.example.com",
  port: "22"
};

describe("SSH guide direct command", () => {
  it("matches the v4 asset-ID format without a connection token", () => {
    expect(getDirectSshCommand(options)).toBe("ssh admin#root#asset-id@gateway.example.com");
    expect(getDirectSshCommand({ ...options, port: "2222" })).toBe(
      "ssh admin#root#asset-id@gateway.example.com -p 2222"
    );
  });

  it("uses the managed account username instead of its display name", () => {
    const accounts = [{ id: "account-id", username: "root", name: "Administrator" }];
    expect(getDirectSshCommand({ ...options, accounts, inputUsername: "Administrator" })).toBe(
      "ssh admin#root#asset-id@gateway.example.com"
    );
  });

  it("resolves same-name and manually entered accounts", () => {
    expect(getDirectSshCommand({ ...options, account: "@USER", inputUsername: "" })).toContain("admin#admin#asset-id");
    expect(getDirectSshCommand({ ...options, account: "@INPUT", inputUsername: "operator" })).toContain(
      "admin#operator#asset-id"
    );
  });

  it("quotes shell metacharacters and rejects missing or ambiguous login names", () => {
    expect(getDirectSshCommand({ ...options, inputUsername: "$(id)" })).toBe(
      "ssh 'admin#$(id)#asset-id@gateway.example.com'"
    );
    expect(getDirectSshCommand({ ...options, username: "" })).toBe("");
    expect(getDirectSshCommand({ ...options, inputUsername: "" })).toBe("");
    expect(getDirectSshCommand({ ...options, username: "a#b" })).toBe("");
  });
});
