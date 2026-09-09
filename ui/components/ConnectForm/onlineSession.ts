import type { PermedAccount } from "~/types";

export function resolveOnlineSessionAccount(opts: {
  enabled: boolean;
  protocol: string;
  accounts: PermedAccount[];
  selectedAccount: string;
  manualUsername: string;
  personalCredentialUsername?: string;
  manualInputLabel?: string;
}): string | null {
  if (!opts.enabled || opts.protocol.trim().toLowerCase() !== "rdp") return null;

  const personal = opts.personalCredentialUsername?.trim();
  if (personal) return personal;

  const account = matchPermedAccount(opts.accounts, opts.selectedAccount, opts.manualInputLabel);
  if (!account || account.alias === "@INPUT" || !account.has_secret) {
    return opts.manualUsername.trim() || null;
  }

  return account.username.trim() || null;
}

function matchPermedAccount(accounts: PermedAccount[], selected: string, manualInputLabel?: string) {
  if (!selected) return undefined;

  const exact = accounts.find(
    (item) => item.name === selected || item.username === selected || item.alias === selected
  );
  if (exact) return exact;

  const dynamic = accounts.find((item) => item.alias === "@USER");
  if (dynamic && (selected === "@USER" || (dynamic.username && selected.includes(`(${dynamic.username})`)))) {
    return dynamic;
  }

  if (
    selected === "@INPUT" ||
    selected === "手动输入" ||
    selected === "Manual input" ||
    selected === manualInputLabel
  ) {
    return accounts.find((item) => item.alias === "@INPUT");
  }

  return undefined;
}
