import type { SiteUserData } from "~/store/modules/userInfo";

type SwitchPrompt = {
  kind: "unlock" | "login";
  account: Pick<SiteUserData, "accountId" | "name" | "username" | "site" | "siteName">;
  connectionId?: number;
  resolve: (confirmed: boolean) => void;
};

const pending = shallowRef<SwitchPrompt | null>(null);

export const useAccountSwitchPrompt = () => {
  const finish = (confirmed: boolean, request = pending.value) => {
    if (!request || pending.value !== request) return;
    pending.value = null;
    request.resolve(confirmed);
  };

  const ask = (kind: SwitchPrompt["kind"], account: SwitchPrompt["account"], connectionId?: number) => {
    finish(false);
    return new Promise<boolean>((resolve) => {
      const { accountId, name, username, site, siteName } = account;
      pending.value = { kind, account: { accountId, name, username, site, siteName }, connectionId, resolve };
    });
  };

  return {
    pending,
    finish,
    confirmLogin: (account: SwitchPrompt["account"]) => ask("login", account),
    unlock: (account: SwitchPrompt["account"], connectionId: number) => ask("unlock", account, connectionId)
  };
};
