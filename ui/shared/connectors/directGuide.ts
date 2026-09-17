import type { PermedAccount } from "~/types";

export function getDirectGuideCommand(options: {
  protocol: string;
  username: string;
  account: string;
  inputUsername: string;
  accounts: Pick<PermedAccount, "id" | "username">[];
  assetId: string;
  host: string;
  port: string;
}): string {
  const { protocol, username, account, inputUsername, accounts, assetId, host, port } = options;
  const accountUsername =
    account === "@USER"
      ? username
      : account === "@INPUT"
        ? inputUsername
        : accounts.find((item) => item.id === account)?.username || inputUsername;
  if (!username || !accountUsername || !assetId || !host) return "";
  // Koko and Nec split this login name on '#'; embedded separators cannot be represented.
  if ([username, accountUsername, assetId].some((value) => value.includes("#"))) return "";
  const quote = (value: string) => (/^[\w@.#:/-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`);
  const login = `${username}#${accountUsername}#${assetId}`;
  switch (protocol) {
    case "ssh":
      return `ssh ${quote(`${login}@${host}`)}${port === "22" ? "" : ` -p ${quote(port)}`}`;
    case "vnc":
      return `vncviewer -UserName=${quote(login)} ${quote(`${host}:${port || "5900"}`)}`;
    default:
      return "";
  }
}
