import type { PermedAccount } from "~/types";

export function getDirectSshCommand(options: {
  username: string;
  account: string;
  inputUsername: string;
  accounts: Pick<PermedAccount, "id" | "username">[];
  assetId: string;
  host: string;
  port: string;
}): string {
  const { username, account, inputUsername, accounts, assetId, host, port } = options;
  const accountUsername =
    account === "@USER"
      ? username
      : account === "@INPUT"
        ? inputUsername
        : accounts.find((item) => item.id === account)?.username || inputUsername;
  if (!username || !accountUsername || !assetId || !host) return "";
  // Koko splits this login name on '#'; embedded separators cannot be represented.
  if ([username, accountUsername, assetId].some((value) => value.includes("#"))) return "";
  const quote = (value: string) => (/^[\w@.#:/-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`);
  const target = `${username}#${accountUsername}#${assetId}@${host}`;
  return `ssh ${quote(target)}${port === "22" ? "" : ` -p ${quote(port)}`}`;
}
