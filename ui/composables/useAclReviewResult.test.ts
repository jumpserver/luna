import { afterEach, expect, it, vi } from "vitest";
import type { TokenResponse } from "~/types";
import { getAclReviewerGroups, useAclDialog } from "./useAclDialog";

vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: () => ({}) }));
vi.mock("~/utils/clipboard", () => ({ writeClipboardText: vi.fn() }));
vi.mock("~/utils/faceLive", () => ({}));
afterEach(async () => {
  const dialog = useAclDialog();
  while (dialog.activeGroup.value) await dialog.close(dialog.activeGroup.value);
  vi.unstubAllGlobals();
});

it.each(["rejected", "closed"] as const)(
  "localizes a %s review even when the server returns English",
  async (status) => {
    vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
    vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
    const reviewers = [{ id: "reviewer", name: "审批人", username: "reviewer" }];
    const token = {
      id: "token",
      is_active: false,
      org_id: "org",
      acl: { requirements: { review: "pending" }, reviewers, mfa_methods: [], cancelled: false }
    } as unknown as TokenResponse;
    vi.stubGlobal(
      "advanceConnectionAcl",
      vi.fn().mockResolvedValue({
        ...token,
        from_ticket: "ticket",
        acl: {
          ...token.acl,
          requirements: { review: "failed" },
          review_status: status,
          error: "Connection review was rejected or closed"
        }
      })
    );
    const dialog = useAclDialog();
    const connection = dialog.request(token, { assetName: "server", orgId: "org" });
    await dialog.submit();
    const item = dialog.activeGroup.value!.items[0]!;
    expect(item.status).toBe(status);
    expect(item.detail).toBe(`AclDialog.${status === "rejected" ? "ReviewRejected" : "ReviewClosed"}`);
    expect(getAclReviewerGroups([item])[0]?.label).toBe("审批人 (reviewer)");
    expect(item.settled).not.toBe(true);
    await dialog.close();
    expect(await connection).toBeNull();
  }
);
