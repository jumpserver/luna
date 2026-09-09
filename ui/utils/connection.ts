import type { AssetItem } from "~/types";

export const hasReusableSavedConnection = (asset: AssetItem) => {
  const saved = asset.savedConnection;
  if (!saved?.protocol || !saved.username) return false;

  const mode = saved.accountMode || "hosted";
  if (mode === "manual") return !!(saved.manualUsername && saved.personalCredentialId);
  if (mode === "dynamic") return !!(saved.rememberSecret && saved.dynamicPassword);

  return true;
};

export const isSavedConnectionAvailable = (asset: AssetItem) => {
  const saved = asset.savedConnection;
  if (!saved || !(asset.permedProtocols || []).some((protocol) => protocol.name === saved.protocol)) return false;

  const mode = saved.accountMode || "hosted";
  const accounts = asset.permedAccounts || [];
  if (mode === "manual") return accounts.some((account) => account.alias === "@INPUT");
  if (mode === "dynamic") return accounts.some((account) => account.alias === "@USER");
  if (mode === "anonymous") return accounts.some((account) => account.alias === "@ANON");

  return accounts.some(
    (account) =>
      !(account.alias || "").startsWith("@") &&
      ((saved.accountId && account.id === saved.accountId) ||
        account.name === saved.username ||
        account.username === saved.username ||
        account.alias === saved.username)
  );
};
