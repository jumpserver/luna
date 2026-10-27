import type { TokenResponse } from "~/types";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createConnectionTokenWithAcl, useAclDialog } from "./useAclDialog";
import { ConnectionChecksCancelledError, exchangeConnectToken } from "./useConnectTokenExchange";

vi.mock("~/store/modules/userInfo", () => ({
  useUserInfoStore: () => ({ currentSite: "https://jumpserver.example", currentAccountId: "web" })
}));
vi.mock("~/utils/faceLive", () => ({
  getOrCreateFaceMonitorToken: () => "monitor",
  buildFaceLivePageUrl: vi.fn(),
  buildFaceLiveRendererPageUrl: vi.fn()
}));

const exchange = vi.fn();
const create = vi.fn();
const advance = vi.fn();
const sessionReady = vi.fn();

function token(review: "pending" | "running" | "passed" | "failed" = "pending") {
  return {
    id: "new-token",
    value: "new-value",
    org_id: "asset-org",
    asset_display: "PostgreSQL",
    is_active: review === "passed",
    ...(review !== "pending" ? { from_ticket: "ticket" } : {}),
    acl: {
      requirements: { review },
      face_online: false,
      mfa_methods: [],
      cancelled: false,
      review_status: review === "failed" ? "rejected" : review === "passed" ? "approved" : "pending"
    }
  } as unknown as TokenResponse;
}

function connect(mode: string) {
  const result =
    mode === "exchange"
      ? exchangeConnectToken("old-token")
      : createConnectionTokenWithAcl(
          { asset: "asset", account: "user", protocol: "postgresql", connect_method: "web_cli", connect_options: {} },
          { orgId: "asset-org", assetName: "PostgreSQL", scopeId: "pane" }
        );
  // This is the publication boundary before the Chen surface can create a session.
  return result.then((approved) => {
    if (approved) sessionReady(approved);
    return approved;
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  exchange.mockResolvedValue(token());
  create.mockResolvedValue(token());
  advance.mockResolvedValue(token("running"));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
  vi.stubGlobal("useAclDialog", useAclDialog);
  vi.stubGlobal("exchangeConnectionToken", exchange);
  vi.stubGlobal("createConnectionToken", create);
  vi.stubGlobal("advanceConnectionAcl", advance);
});

afterEach(async () => {
  const acl = useAclDialog();
  while (acl.activeGroup.value) await acl.close(acl.activeGroup.value);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each(["initial", "exchange"])("holds %s Chen admission until review is approved", async (mode) => {
  const connecting = connect(mode);
  await Promise.resolve();
  const acl = useAclDialog();
  expect(acl.activeGroup.value).toBeDefined();
  expect(sessionReady).not.toHaveBeenCalled();
  await acl.submit(acl.activeGroup.value);
  expect(sessionReady).not.toHaveBeenCalled();
  advance.mockResolvedValue(token("passed"));
  await vi.advanceTimersByTimeAsync(2000);
  expect(sessionReady).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(3000);
  await expect(connecting).resolves.toMatchObject({ id: "new-token", is_active: true });
  expect(sessionReady).toHaveBeenCalledTimes(1);
  if (mode === "exchange") expect(exchange).toHaveBeenCalledWith("old-token", true);
  else
    expect(create).toHaveBeenCalledWith(expect.anything(), "asset-org", expect.objectContaining({ aclStepwise: true }));
});

it.each(["initial", "exchange"])("keeps rejected %s tokens out of Chen", async (mode) => {
  const connecting = connect(mode).catch((error: unknown) => error);
  await Promise.resolve();
  const acl = useAclDialog();
  advance.mockResolvedValue(token("failed"));
  await acl.submit(acl.activeGroup.value);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(sessionReady).not.toHaveBeenCalled();
  await acl.close(acl.activeGroup.value);
  const result = await connecting;
  if (mode === "exchange") expect(result).toBeInstanceOf(ConnectionChecksCancelledError);
  else expect(result).toBeNull();
});

it.each(["initial", "exchange"])("ignores an approved %s response arriving after ACL cancellation", async (mode) => {
  const connecting = connect(mode).catch((error: unknown) => error);
  await Promise.resolve();
  const acl = useAclDialog();
  let approve!: (response: TokenResponse) => void;
  advance.mockImplementation((_id: string, body: { cancel?: boolean }) =>
    body.cancel
      ? Promise.resolve(token())
      : new Promise<TokenResponse>((resolve) => {
          approve = resolve;
        })
  );
  const submitting = acl.submit(acl.activeGroup.value);
  await acl.close(acl.activeGroup.value);
  approve(token("passed"));
  await submitting;
  await vi.advanceTimersByTimeAsync(10_000);
  const result = await connecting;
  if (mode === "exchange") expect(result).toBeInstanceOf(ConnectionChecksCancelledError);
  else expect(result).toBeNull();
  expect(sessionReady).not.toHaveBeenCalled();
  expect(acl.activeGroup.value).toBeUndefined();
  expect(advance).toHaveBeenCalledWith("new-token", { cancel: true }, "asset-org", undefined);
});

it("rejects an inactive exchange token without ACL instead of publishing it", async () => {
  exchange.mockResolvedValue({ id: "new-token", is_active: false });
  await expect(exchangeConnectToken("old-token")).rejects.toThrow("Connection checks are incomplete");
  expect(useAclDialog().activeGroup.value).toBeUndefined();
});
