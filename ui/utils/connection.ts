import type { AssetItem, PermedAccount, PersonalAssetCredential } from "~/types";

export const resolvePersonalCredentialSecretType = (protocol: string, fallback = "password") => {
  const normalizedProtocol = protocol.trim().toLowerCase();
  if (normalizedProtocol === "k8s" || normalizedProtocol === "kubernetes") return "token";
  return fallback || "password";
};

export const findMatchingPersonalCredential = (
  credentials: PersonalAssetCredential[],
  username: string,
  secretType: string
) =>
  username.trim()
    ? credentials.find(
        (credential) =>
          credential.username === username.trim() &&
          (typeof credential.secret_type === "string" ? credential.secret_type : credential.secret_type.value) ===
            secretType
      )
    : undefined;

export const needsInputSecret = (account?: PermedAccount | null) =>
  account?.has_secret === false && account.alias !== "@ANON";

export const supportsPersonalCredential = (account?: PermedAccount | null) =>
  !!account &&
  (account.alias === "@INPUT" ||
    (!account.alias.startsWith("@") &&
      needsInputSecret(account) &&
      !!account.username?.trim() &&
      account.secret_type !== "ssh_certificate"));

export const hasReusableSavedConnection = (asset: AssetItem) => {
  const saved = asset.savedConnection;
  if (!saved?.protocol || !saved.username) return false;

  const mode = saved.accountMode || "hosted";
  if (mode === "manual") return !!(saved.manualUsername && saved.personalCredentialId);
  if (mode === "dynamic") return !!(saved.rememberSecret && saved.dynamicPassword);

  if (mode === "hosted" && asset.permedAccounts?.length) {
    const account =
      asset.permedAccounts.find((item) => item.id === saved.accountId) ||
      asset.permedAccounts.find(
        (item) => item.name === saved.username || item.username === saved.username || item.alias === saved.username
      );
    if (needsInputSecret(account)) return supportsPersonalCredential(account) && !!saved.personalCredentialId;
  }

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

  const account =
    accounts.find((item) => item.id === saved.accountId) ||
    accounts.find(
      (item) => item.name === saved.username || item.username === saved.username || item.alias === saved.username
    );
  return (
    !!account &&
    !account.alias.startsWith("@") &&
    (!needsInputSecret(account) || (supportsPersonalCredential(account) && !!saved.personalCredentialId))
  );
};
