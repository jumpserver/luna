import type { AssetItem, PermedAccount } from "~/types";
import { describe, expect, it } from "vitest";
import {
  hasReusableSavedConnection,
  isSavedConnectionAvailable,
  needsInputSecret,
  supportsPersonalCredential
} from "./connection";

const account: PermedAccount = {
  id: "account-id",
  alias: "root",
  name: "root",
  username: "root",
  has_secret: false,
  has_username: true,
  secret_type: "password",
  date_expired: "",
  actions: []
};

const asset = {
  permedProtocols: [{ name: "ssh", port: 22, public: true }],
  permedAccounts: [account],
  savedConnection: { protocol: "ssh", username: "root", accountId: "account-id", accountMode: "hosted" }
} as AssetItem;

describe("connections requiring a one-time secret", () => {
  it.each(["ssh", "sftp"])("reuses a personal credential for an authorized empty-secret %s account", (protocol) => {
    const savedAsset = {
      ...asset,
      permedProtocols: [{ name: protocol, port: 22, public: true }],
      savedConnection: { ...asset.savedConnection!, protocol, personalCredentialId: "credential" }
    };
    expect(supportsPersonalCredential(account)).toBe(true);
    expect(hasReusableSavedConnection(savedAsset)).toBe(true);
    expect(isSavedConnectionAvailable(savedAsset)).toBe(true);
  });

  it.each([
    { ...account, username: "" },
    { ...account, alias: "@USER" },
    { ...account, alias: "@ANON" },
    { ...account, secret_type: "ssh_certificate" }
  ])("rejects personal credentials for an ineligible account: %j", (ineligible) => {
    expect(supportsPersonalCredential(ineligible)).toBe(false);
    const savedAsset = {
      ...asset,
      permedAccounts: [ineligible],
      savedConnection: { ...asset.savedConnection!, personalCredentialId: "credential" }
    };
    if (ineligible.alias !== "@ANON") expect(hasReusableSavedConnection(savedAsset)).toBe(false);
    expect(isSavedConnectionAvailable(savedAsset)).toBe(false);
  });
  it.each(["ssh", "sftp"])("does not quick-connect a hosted %s account without a stored secret", (protocol) => {
    const protocolAsset = {
      ...asset,
      permedProtocols: [{ name: protocol, port: 22, public: true }],
      savedConnection: { ...asset.savedConnection!, protocol }
    };
    expect(needsInputSecret(account)).toBe(true);
    expect(hasReusableSavedConnection(protocolAsset)).toBe(false);
    expect(isSavedConnectionAvailable(protocolAsset)).toBe(false);
  });

  it("keeps stored-secret and anonymous accounts available", () => {
    expect(hasReusableSavedConnection({ ...asset, permedAccounts: [{ ...account, has_secret: true }] })).toBe(true);
    expect(isSavedConnectionAvailable({ ...asset, permedAccounts: [{ ...account, has_secret: true }] })).toBe(true);
    expect(needsInputSecret({ ...account, alias: "@ANON" })).toBe(false);
  });
});
