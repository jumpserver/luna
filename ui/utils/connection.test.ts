import type { AssetItem, PermedAccount } from "~/types";
import { describe, expect, it } from "vitest";
import { hasReusableSavedConnection, isSavedConnectionAvailable, needsInputSecret } from "./connection";

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
