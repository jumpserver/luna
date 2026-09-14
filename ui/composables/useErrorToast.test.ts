import { beforeEach, describe, expect, it, vi } from "vitest";
import { useErrorToast } from "./useErrorToast";

const toastAdd = vi.fn((toast) => toast);

beforeEach(() => {
  toastAdd.mockClear();
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useToast", () => ({ add: toastAdd }));
});

describe("error toast", () => {
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
