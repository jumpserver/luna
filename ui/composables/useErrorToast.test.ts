import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useErrorToast } from "./useErrorToast";

const toastAdd = vi.fn((toast) => toast);

beforeEach(() => {
  toastAdd.mockClear();
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useToast", () => ({ add: toastAdd }));
});

afterEach(() => vi.unstubAllGlobals());

describe("error toast", () => {
  it("does not automatically add a copy button to error notifications", () => {
    const { addErrorToast } = useErrorToast();

    addErrorToast({ title: "连接失败", description: "服务器不可用" });
    const toast = toastAdd.mock.lastCall![0];
    expect(toast).not.toHaveProperty("actions");
  });

  it("preserves explicitly supplied actions without adding extra buttons", () => {
    const action = { label: "重试", onClick: vi.fn() };
    const { addErrorToast } = useErrorToast();

    const toast = addErrorToast({ title: "连接失败", actions: [action] });

    expect(toast.actions).toEqual([action]);
  });

  it("forwards a stable id so repeated failures update one toast", () => {
    const { addErrorToast } = useErrorToast();

    addErrorToast({ id: "login-failed", title: "Login Failed", description: "Site unavailable" });
    addErrorToast({ id: "login-failed", title: "Login Failed", description: "Site unavailable" });

    expect(toastAdd).toHaveBeenCalledTimes(2);
    expect(toastAdd.mock.calls.map(([toast]) => toast.id)).toEqual(["login-failed", "login-failed"]);
  });

  it("localizes a missing personal credential without exposing the API error type", () => {
    vi.stubGlobal("useI18n", () => ({
      t: (key: string) =>
        key === "ConnectError.PersonalCredentialNotFound" ? "未找到所选的个人凭据，请重新选择或手动输入。" : key
    }));
    const { addErrorToast } = useErrorToast();

    addErrorToast({ title: "连接失败", description: "ApiRequestError: Personal credential not found" });

    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ description: "未找到所选的个人凭据，请重新选择或手动输入。" })
    );
  });
});
