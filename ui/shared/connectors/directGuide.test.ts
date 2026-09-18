import { expect, it } from "vitest";
import { getDirectGuideCommand } from "./directGuide";

const options = {
  protocol: "ssh",
  username: "admin",
  account: "account-id",
  inputUsername: "root",
  accounts: [],
  assetId: "asset-id",
  host: "gateway.example.com",
  port: "22"
};

it("keeps the SSH asset-ID format and port option", () => {
  expect(getDirectGuideCommand(options)).toBe("ssh admin#root#asset-id@gateway.example.com");
  expect(getDirectGuideCommand({ ...options, port: "2222" })).toBe(
    "ssh admin#root#asset-id@gateway.example.com -p 2222"
  );
});

it("matches the v4 VNC asset-ID format with the gateway port or default port", () => {
  expect(getDirectGuideCommand({ ...options, protocol: "vnc", port: "15900" })).toBe(
    "vncviewer -UserName=admin#root#asset-id gateway.example.com:15900"
  );
  expect(getDirectGuideCommand({ ...options, protocol: "vnc", port: "" })).toBe(
    "vncviewer -UserName=admin#root#asset-id gateway.example.com:5900"
  );
});

it("resolves accounts and rejects manual VNC logins", () => {
  const accounts = [{ id: "account-id", username: "root", name: "Administrator" }];
  expect(getDirectGuideCommand({ ...options, accounts, inputUsername: "Administrator" })).toContain(
    "admin#root#asset-id"
  );
  expect(getDirectGuideCommand({ ...options, account: "@USER", inputUsername: "" })).toContain("admin#admin#asset-id");
  expect(getDirectGuideCommand({ ...options, account: "@INPUT", inputUsername: "operator" })).toContain(
    "admin#operator#asset-id"
  );
  expect(getDirectGuideCommand({ ...options, protocol: "vnc", account: "@INPUT", inputUsername: "operator" })).toBe("");
});

it("quotes shell metacharacters in both command formats", () => {
  expect(getDirectGuideCommand({ ...options, inputUsername: "$(id)" })).toBe(
    "ssh 'admin#$(id)#asset-id@gateway.example.com'"
  );
  expect(getDirectGuideCommand({ ...options, protocol: "vnc", port: "15900", inputUsername: "$(id)" })).toBe(
    "vncviewer -UserName='admin#$(id)#asset-id' gateway.example.com:15900"
  );
});

it("rejects missing or ambiguous login names", () => {
  expect(getDirectGuideCommand({ ...options, username: "" })).toBe("");
  expect(getDirectGuideCommand({ ...options, inputUsername: "" })).toBe("");
  expect(getDirectGuideCommand({ ...options, username: "a#b" })).toBe("");
});
