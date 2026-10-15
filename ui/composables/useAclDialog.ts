import type { MaybeRefOrGetter } from "vue";
import type { ConnectionBody, TokenResponse } from "~/types";
import { ApiRequestError } from "~/composables/useApiRequest";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { writeClipboardText } from "~/utils/clipboard";
import { buildFaceLivePageUrl, buildFaceLiveRendererPageUrl, getOrCreateFaceMonitorToken } from "~/utils/faceLive";

const FACE_PAGE_TIMEOUT_MS = 10_000;
const FACE_TOKEN_TIMEOUT_MS = 30_000;
const FACE_VERIFICATION_TIMEOUT_MS = 120_000;

export type AclItemStatus =
  | "ready"
  | "submitting"
  | "pending"
  | "verifying"
  | "approved"
  | "rejected"
  | "closed"
  | "failed";

export interface AclDialogItem {
  id: string;
  scopeId?: string;
  assetName: string;
  body: ConnectionBody;
  orgId?: string;
  admin?: boolean;
  status: AclItemStatus;
  detail?: string;
  token?: TokenResponse;
  assignees?: string;
  resolve: (token: TokenResponse | null) => void;
  settled?: boolean;
  timer?: ReturnType<typeof setInterval>;
  pageTimer?: ReturnType<typeof setTimeout>;
  faceTimer?: ReturnType<typeof setTimeout>;
}

export interface AclDialogGroup {
  id: string;
  code: string;
  items: AclDialogItem[];
  submitted: boolean;
  batchId?: string;
  faceUrl?: string;
}

const ACL_CODE_MESSAGE = {
  acl_reject: "AclDialog.Reject",
  acl_face_online: "AclDialog.NeedFaceOnline",
  acl_face_online_not_supported: "AclDialog.FaceOnlineNotSupported",
  no_face_feature: "AclDialog.NoFaceFeature",
  perm_account_invalid: "AclDialog.AccountNotFound"
} as const;

function aclCodeMessage(code: string) {
  return ACL_CODE_MESSAGE[code as keyof typeof ACL_CODE_MESSAGE];
}

export function useAclDialogPresentation(groupSource: MaybeRefOrGetter<AclDialogGroup | undefined>) {
  const { t } = useI18n();
  const group = computed(() => toValue(groupSource));
  const isReview = computed(() => group.value?.code === "acl_review");
  const isFace = computed(() => group.value?.code.startsWith("acl_face_") || false);
  const isActionable = computed(() =>
    ["acl_review", "acl_face_verify", "acl_face_online"].includes(group.value?.code || "")
  );
  const isBatch = computed(() => (group.value?.items.length || 0) > 1);
  const isBusy = computed(
    () => group.value?.items.some((item) => ["submitting", "verifying"].includes(item.status)) || false
  );
  const hasPending = computed(
    () => group.value?.items.some((item) => ["submitting", "pending", "verifying"].includes(item.status)) || false
  );
  const title = computed(() =>
    isReview.value
      ? t("AclDialog.LoginReview")
      : isFace.value
        ? t("AclDialog.FaceVerify")
        : t("AclDialog.LoginReminder")
  );
  const description = computed(() => {
    const current = group.value;
    if (!current) return "";
    if (current.items.length === 1) {
      const item = current.items[0];
      if (isReview.value) {
        if (item?.status === "failed") return t("AclDialog.RequestFailed");
        if (item?.status === "pending") return t("AclDialog.ReviewPending");
        if (item?.status === "rejected") return t("AclDialog.ReviewRejected");
        if (item?.status === "closed") return t("AclDialog.ReviewClosed");
        return t("AclDialog.NeedReview");
      }
      if (["acl_face_verify", "acl_face_online"].includes(current.code)) {
        if (item?.status === "failed") return t("AclDialog.FaceVerificationFailed");
        if (item?.status === "verifying") return t("AclDialog.CompleteFaceVerify");
        return current.code === "acl_face_online" ? t("AclDialog.NeedFaceOnline") : t("AclDialog.NeedFaceVerify");
      }
      const mapped = aclCodeMessage(current.code);
      return mapped ? t(mapped) : t("AclDialog.Restricted");
    }
    if (isReview.value) return t("AclDialog.ReviewGroupDescription");
    if (["acl_face_verify", "acl_face_online"].includes(current.code)) return t("AclDialog.FaceGroupDescription");
    return t("AclDialog.ErrorGroupDescription");
  });

  return { description, hasPending, isActionable, isBatch, isBusy, isReview, title };
}

const groups = ref<AclDialogGroup[]>([]);

function errorDetail(error: unknown) {
  if (error instanceof ApiRequestError) {
    const detail = error.data?.detail;
    if (typeof detail === "string" && detail) return detail;
    return error.data?.code || error.message || "";
  }
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const data = error as { code?: string; detail?: string; message?: string };
    return data.detail || data.message || data.code || "";
  }
  return String(error || "");
}

function aclCode(error: unknown) {
  let data = error instanceof ApiRequestError ? error.data : error;
  if (data instanceof Error) data = data.message;
  if (typeof data === "string") {
    const match = data.match(/\bacl_\w+\b/i);
    return match?.[0] || "";
  }
  if (!data || typeof data !== "object") return "";
  const payload = data as { code?: unknown; error?: unknown; data?: unknown; body?: unknown };
  const code = String(payload.code || "");
  if (!code && (payload.error || payload.data || payload.body)) {
    return aclCode(payload.error ?? payload.data ?? payload.body);
  }
  return code.startsWith("acl_") ? code : "";
}

function finishItem(item: AclDialogItem, token: TokenResponse | null) {
  if (item.settled) return;
  item.settled = true;
  if (item.timer) clearInterval(item.timer);
  item.timer = undefined;
  if (item.pageTimer) clearTimeout(item.pageTimer);
  item.pageTimer = undefined;
  if (item.faceTimer) clearTimeout(item.faceTimer);
  item.faceTimer = undefined;
  item.resolve(token);
  const groupIndex = groups.value.findIndex((group) => group.items.includes(item));
  const group = groups.value[groupIndex];
  if (token && group?.items.length === 1 && !group.batchId) {
    setTimeout(() => {
      const currentIndex = groups.value.indexOf(group);
      if (currentIndex !== -1 && group.items.length === 1) groups.value.splice(currentIndex, 1);
    });
  }
}

function requestAcl(
  error: unknown,
  input: {
    body: ConnectionBody;
    orgId?: string;
    assetName: string;
    scopeId?: string;
    batchId?: string;
    admin?: boolean;
  }
): Promise<TokenResponse | null> | null {
  const code = aclCode(error);
  if (!code) return null;

  return new Promise((resolve) => {
    const groupId = input.batchId
      ? `batch:${input.batchId}:${code}`
      : input.scopeId
        ? `scope:${input.scopeId}:${code}`
        : `global:${code}`;
    let group = groups.value.find((candidate) => candidate.id === groupId);
    if (!group) {
      group = reactive({ id: groupId, code, items: [], submitted: false, batchId: input.batchId });
      groups.value.push(group);
    }
    const actionable = ["acl_review", "acl_face_verify", "acl_face_online"].includes(code);
    const item: AclDialogItem = reactive({
      id: `${Date.now()}-${Math.random()}`,
      scopeId: input.scopeId,
      assetName: input.assetName,
      body: input.body,
      orgId: input.orgId,
      admin: input.admin,
      status: actionable ? "ready" : "failed",
      detail: actionable || aclCodeMessage(code) ? undefined : errorDetail(error),
      resolve
    });
    group.items.push(item);
    if (group.submitted) {
      if (code === "acl_review") void submitReviewItem(item);
      if (["acl_face_verify", "acl_face_online"].includes(code)) void verifyNextFace(group);
    }
  });
}

async function closeAclGroup(group: AclDialogGroup) {
  await Promise.all(
    group.items
      .filter((item) => item.status === "pending" && item.token?.from_ticket_info?.close_ticket_api)
      .map((item) => callTicketApi(item.token!.from_ticket_info.close_ticket_api).catch(() => null))
  );
  group.items.forEach((item) => finishItem(item, null));
  const index = groups.value.indexOf(group);
  if (index !== -1) groups.value.splice(index, 1);
}

export async function closeAclScope(scopeId: string) {
  const group = groups.value.find((candidate) =>
    candidate.items.some((item) => item.scopeId === scopeId && !item.settled)
  );
  if (!group) return;
  if (group.items.length === 1) {
    await closeAclGroup(group);
    return;
  }
  const items = group.items.filter((item) => item.scopeId === scopeId && !item.settled);
  await Promise.all(
    items
      .filter((item) => item.status === "pending" && item.token?.from_ticket_info?.close_ticket_api)
      .map((item) => callTicketApi(item.token!.from_ticket_info.close_ticket_api).catch(() => null))
  );
  items.forEach((item) => finishItem(item, null));
  group.items = group.items.filter((item) => !items.includes(item));
  if (group.items.length === 0) {
    const index = groups.value.indexOf(group);
    if (index !== -1) groups.value.splice(index, 1);
  }
}

export function useAclDialog() {
  const toast = useToast();
  const { t } = useI18n();
  const activeGroup = computed(() => groups.value[0]);
  const globalGroup = computed(() => groups.value.find((group) => group.batchId || !group.items[0]?.scopeId));
  const isOpen = computed(() => Boolean(globalGroup.value));
  const groupForScope = (scopeId: string) =>
    computed(() => groups.value.find((group) => !group.batchId && group.items[0]?.scopeId === scopeId));
  const hasScopeGroup = (scopeId: string) =>
    groups.value.some((group) => !group.batchId && group.items[0]?.scopeId === scopeId);
  const findScopeGroup = (scopeId?: string) =>
    scopeId
      ? groups.value.find((group) => !group.batchId && group.items.some((item) => item.scopeId === scopeId))
      : undefined;

  const request = requestAcl;

  const submit = async (target?: AclDialogGroup) => {
    const group = target || globalGroup.value || activeGroup.value;
    if (!group) return;
    group.submitted = true;
    if (group.code === "acl_review") {
      await Promise.all(group.items.filter((item) => item.status === "ready").map(submitReviewItem));
    } else if (["acl_face_verify", "acl_face_online"].includes(group.code)) {
      await verifyNextFace(group);
    }
  };

  const close = async (target?: AclDialogGroup) => {
    const group = target || globalGroup.value || activeGroup.value;
    if (!group) return;
    await closeAclGroup(group);
  };

  const closeScope = (scopeId: string) => closeAclScope(scopeId);

  const copyTicketLink = async (item: AclDialogItem) => {
    const link = item.token?.from_ticket_info?.ticket_detail_page_url;
    if (!link) return;
    try {
      await writeClipboardText(link);
      toast.add({ title: t("Common.CopySuccess"), color: "success", duration: 1200 });
    } catch {
      toast.add({ title: t("Common.CopyFailed"), color: "error", duration: 1200 });
    }
  };

  const retryFace = async (target?: AclDialogGroup) => {
    const group = target || globalGroup.value || activeGroup.value;
    if (!group || !["acl_face_verify", "acl_face_online"].includes(group.code)) return;
    if (group.items.some((item) => ["submitting", "verifying"].includes(item.status))) return;
    const item = group.items.find((candidate) => candidate.status === "failed" && !candidate.settled);
    if (!item) return;
    if (item.timer) clearInterval(item.timer);
    item.timer = undefined;
    if (item.pageTimer) clearTimeout(item.pageTimer);
    item.pageTimer = undefined;
    if (item.faceTimer) clearTimeout(item.faceTimer);
    item.faceTimer = undefined;
    item.token = undefined;
    item.detail = undefined;
    item.status = "ready";
    group.faceUrl = undefined;
    await verifyNextFace(group);
  };

  const markFacePageReady = (target: AclDialogGroup) => {
    const item = target.items.find((candidate) => candidate.status === "verifying" && !candidate.settled);
    if (item?.pageTimer) clearTimeout(item.pageTimer);
    if (item) item.pageTimer = undefined;
  };

  const failFace = (target: AclDialogGroup, detail: string) => {
    const item = target.items.find((candidate) => candidate.status === "verifying" && !candidate.settled);
    if (item) failFaceItem(target, item, detail);
  };

  return {
    activeGroup,
    globalGroup,
    isOpen,
    groupForScope,
    hasScopeGroup,
    findScopeGroup,
    request,
    submit,
    close,
    closeScope,
    copyTicketLink,
    retryFace,
    markFacePageReady,
    failFace
  };
}

function failFaceItem(group: AclDialogGroup, item: AclDialogItem, detail: string) {
  if (item.settled || item.status !== "verifying") return;
  if (item.timer) clearInterval(item.timer);
  item.timer = undefined;
  if (item.pageTimer) clearTimeout(item.pageTimer);
  item.pageTimer = undefined;
  if (item.faceTimer) clearTimeout(item.faceTimer);
  item.faceTimer = undefined;
  group.faceUrl = undefined;
  item.status = "failed";
  item.detail = detail;
}

function withTimeout<T>(task: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("AclDialog.FaceRequestTimedOut")), milliseconds);
    task.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function submitReviewItem(item: AclDialogItem) {
  item.status = "submitting";
  try {
    const token = await createConnectionToken(item.body, item.orgId, { createTicket: true, admin: item.admin });
    item.token = token;
    if (!token.from_ticket) {
      item.status = "approved";
      finishItem(item, token);
      return;
    }
    item.status = "pending";
    item.assignees = token.from_ticket_info?.assignees?.join(", ") || "-";
    item.timer = setInterval(async () => {
      try {
        const ticket = await callTicketApi(token.from_ticket_info.check_ticket_api);
        if (item.settled) return;
        if (ticket?.status?.value !== "closed") return;
        if (item.timer) clearInterval(item.timer);
        item.timer = undefined;
        if (ticket?.state?.value === "approved") {
          item.status = "approved";
          finishItem(item, token);
        } else {
          item.status = ticket?.state?.value === "rejected" ? "rejected" : "closed";
        }
      } catch (error) {
        item.status = "failed";
        item.detail = errorDetail(error);
        if (item.timer) clearInterval(item.timer);
      }
    }, 3000);
  } catch (error) {
    item.status = "failed";
    item.detail = errorDetail(error);
  }
}

async function verifyNextFace(group: AclDialogGroup) {
  if (!groups.value.includes(group)) return;
  if (group.items.some((item) => ["submitting", "verifying"].includes(item.status))) return;
  const item = group.items.find((candidate) => candidate.status === "ready");
  if (!item) return;
  item.status = "submitting";
  try {
    const userInfoStore = useUserInfoStore();
    const onlineMonitor = group.code === "acl_face_online";
    const monitorScope = `${userInfoStore.currentSite || window.location.origin}\u0000${userInfoStore.currentAccountId || "web"}`;
    const faceMonitorToken = onlineMonitor ? getOrCreateFaceMonitorToken(monitorScope) : undefined;
    const token = await withTimeout(
      createConnectionToken(item.body, item.orgId, {
        faceVerify: true,
        faceMonitorToken,
        admin: item.admin
      }),
      FACE_TOKEN_TIMEOUT_MS
    );
    if (item.settled || !groups.value.includes(group)) return;
    item.token = token;
    if (!token.face_token) {
      item.status = "approved";
      finishItem(item, token);
      return verifyNextFace(group);
    }
    const faceToken = token.face_token;
    item.status = "verifying";
    const siteUrl = isDesktopRuntime() ? userInfoStore.currentSite : window.location.origin;
    group.faceUrl = isDesktopRuntime()
      ? buildFaceLiveRendererPageUrl({ rendererUrl: window.location.href, siteUrl, token: faceToken })
      : buildFaceLivePageUrl({ siteUrl, rendererPath: window.location.pathname, token: faceToken });
    item.pageTimer = setTimeout(() => failFaceItem(group, item, "AclDialog.FacePageUnavailable"), FACE_PAGE_TIMEOUT_MS);
    item.faceTimer = setTimeout(
      () => failFaceItem(group, item, "AclDialog.FaceVerificationTimedOut"),
      FACE_VERIFICATION_TIMEOUT_MS
    );
    item.timer = setInterval(async () => {
      try {
        const state = await getFaceVerifyState(faceToken);
        if (item.settled || item.status !== "verifying") return;
        if (!state.is_finished) return;
        if (item.timer) clearInterval(item.timer);
        item.timer = undefined;
        if (item.pageTimer) clearTimeout(item.pageTimer);
        item.pageTimer = undefined;
        if (item.faceTimer) clearTimeout(item.faceTimer);
        item.faceTimer = undefined;
        group.faceUrl = undefined;
        if (state.success) {
          item.status = "approved";
          finishItem(item, token);
        } else {
          item.status = "failed";
          item.detail = state.error_message;
        }
        await verifyNextFace(group);
      } catch (error) {
        if (item.settled || item.status !== "verifying") return;
        failFaceItem(group, item, errorDetail(error));
        await verifyNextFace(group);
      }
    }, 1000);
  } catch (error) {
    if (item.settled || !groups.value.includes(group)) return;
    item.status = "failed";
    item.detail = errorDetail(error);
    await verifyNextFace(group);
  }
}

async function callTicketApi(api: { method: string; url: string }) {
  let path = api.url;
  if (isDesktopRuntime() && /^https?:\/\//.test(path)) {
    try {
      const parsed = new URL(path);
      path = `${parsed.pathname}${parsed.search}`;
    } catch {
      // keep original path
    }
  }
  return apiRequest<any>({ method: api.method.toUpperCase() as any, path });
}

export async function createConnectionTokenWithAcl(
  body: ConnectionBody,
  meta: { orgId?: string; assetName: string; scopeId?: string; batchId?: string; admin?: boolean }
) {
  try {
    const token = await createConnectionToken(body, meta.orgId, { admin: meta.admin });
    const pending = requestAcl(token, { body, ...meta });
    if (pending) return pending;
    if (!token.id) throw new Error(token.detail || "Missing connection token");
    return token;
  } catch (error) {
    const pending = requestAcl(error, { body, ...meta });
    if (!pending) throw error;
    return pending;
  }
}
