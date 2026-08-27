import type { MaybeRefOrGetter } from "vue";
import type { ConnectionBody, TokenResponse } from "~/types";
import { ApiRequestError } from "~/composables/useApiRequest";
import { desktopClipboard } from "~/shared/desktop/bridge";
import { useUserInfoStore } from "~/store/modules/userInfo";

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
  status: AclItemStatus;
  detail?: string;
  token?: TokenResponse;
  assignees?: string;
  resolve: (token: TokenResponse | null) => void;
  settled?: boolean;
  timer?: ReturnType<typeof setInterval>;
}

export interface AclDialogGroup {
  id: string;
  code: string;
  items: AclDialogItem[];
  submitted: boolean;
  batchId?: string;
  faceUrl?: string;
}

export function useAclDialogPresentation(groupSource: MaybeRefOrGetter<AclDialogGroup | undefined>) {
  const { t } = useI18n();
  const group = computed(() => toValue(groupSource));
  const isReview = computed(() => group.value?.code === "acl_review");
  const isFace = computed(() => group.value?.code.startsWith("acl_face_") || false);
  const isActionable = computed(() => ["acl_review", "acl_face_verify"].includes(group.value?.code || ""));
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
      if (item?.detail) return t("AclDialog.RequestFailed");
      if (isReview.value) {
        if (item?.status === "pending") return t("AclDialog.ReviewPending");
        if (item?.status === "rejected") return t("AclDialog.ReviewRejected");
        if (item?.status === "closed") return t("AclDialog.ReviewClosed");
        return t("AclDialog.NeedReview");
      }
      if (current.code === "acl_face_verify") {
        return item?.status === "verifying" ? t("AclDialog.CompleteFaceVerify") : t("AclDialog.NeedFaceVerify");
      }
      return t("ConnectError.AclFailed");
    }
    if (isReview.value) return t("AclDialog.ReviewGroupDescription");
    if (current.code === "acl_face_verify") return t("AclDialog.FaceGroupDescription");
    return t("AclDialog.ErrorGroupDescription");
  });

  return { description, hasPending, isActionable, isBatch, isBusy, isReview, title };
}

const groups = ref<AclDialogGroup[]>([]);

function errorDetail(error: unknown) {
  if (error instanceof ApiRequestError) {
    return error.data?.detail || error.data?.code || error.message;
  }
  if (error && typeof error === "object") {
    const data = error as { code?: string; detail?: string };
    return data.detail || data.code || "";
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

export function useAclDialog() {
  const activeGroup = computed(() => groups.value[0]);
  const globalGroup = computed(() => groups.value.find((group) => group.batchId || !group.items[0]?.scopeId));
  const isOpen = computed(() => Boolean(globalGroup.value));
  const groupForScope = (scopeId: string) =>
    computed(() => groups.value.find((group) => !group.batchId && group.items[0]?.scopeId === scopeId));
  const hasScopeGroup = (scopeId: string) =>
    groups.value.some((group) => !group.batchId && group.items[0]?.scopeId === scopeId);

  const request = (
    error: unknown,
    input: { body: ConnectionBody; orgId?: string; assetName: string; scopeId?: string; batchId?: string }
  ): Promise<TokenResponse | null> | null => {
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
      const actionable = ["acl_review", "acl_face_verify"].includes(code);
      const item: AclDialogItem = reactive({
        id: `${Date.now()}-${Math.random()}`,
        scopeId: input.scopeId,
        assetName: input.assetName,
        body: input.body,
        orgId: input.orgId,
        status: actionable ? "ready" : "failed",
        detail: actionable ? undefined : errorDetail(error),
        resolve
      });
      group.items.push(item);
      if (group.submitted) {
        if (code === "acl_review") void submitReviewItem(item);
        if (code === "acl_face_verify") void verifyNextFace(group);
      }
    });
  };

  const submit = async (target?: AclDialogGroup) => {
    const group = target || globalGroup.value || activeGroup.value;
    if (!group) return;
    group.submitted = true;
    if (group.code === "acl_review") {
      await Promise.all(group.items.filter((item) => item.status === "ready").map(submitReviewItem));
    } else if (group.code === "acl_face_verify") {
      await verifyNextFace(group);
    }
  };

  const close = async (target?: AclDialogGroup) => {
    const group = target || globalGroup.value || activeGroup.value;
    if (!group) return;
    await Promise.all(
      group.items
        .filter((item) => item.status === "pending" && item.token?.from_ticket_info?.close_ticket_api)
        .map((item) => callTicketApi(item.token!.from_ticket_info.close_ticket_api).catch(() => null))
    );
    group.items.forEach((item) => finishItem(item, null));
    const index = groups.value.indexOf(group);
    if (index !== -1) groups.value.splice(index, 1);
  };

  const closeScope = async (scopeId: string) => {
    const group = groups.value.find((candidate) =>
      candidate.items.some((item) => item.scopeId === scopeId && !item.settled)
    );
    if (!group) return;
    if (group.items.length === 1) {
      await close(group);
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
  };

  const copyTicketLink = async (item: AclDialogItem) => {
    const link = item.token?.from_ticket_info?.ticket_detail_page_url;
    if (!link) return;
    if (isDesktopRuntime()) await desktopClipboard.writeText(link);
    else await navigator.clipboard.writeText(link);
  };

  return {
    activeGroup,
    globalGroup,
    isOpen,
    groupForScope,
    hasScopeGroup,
    request,
    submit,
    close,
    closeScope,
    copyTicketLink
  };
}

async function submitReviewItem(item: AclDialogItem) {
  item.status = "submitting";
  try {
    const token = await createConnectionToken(item.body, item.orgId, { createTicket: true });
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
  if (group.items.some((item) => ["submitting", "verifying"].includes(item.status))) return;
  const item = group.items.find((candidate) => candidate.status === "ready");
  if (!item) return;
  item.status = "submitting";
  try {
    const token = await createConnectionToken(item.body, item.orgId, { faceVerify: true });
    item.token = token;
    if (!token.face_token) {
      item.status = "approved";
      finishItem(item, token);
      return verifyNextFace(group);
    }
    const faceToken = token.face_token;
    item.status = "verifying";
    const userInfoStore = useUserInfoStore();
    const siteUrl = new URL(isDesktopRuntime() ? userInfoStore.currentSite : window.location.origin);
    group.faceUrl = new URL(
      withWebSitePrefix(`/facelive/capture?token=${encodeURIComponent(faceToken)}`, siteUrl.pathname),
      siteUrl.origin
    ).href;
    item.timer = setInterval(async () => {
      try {
        const state = await getFaceVerifyState(faceToken);
        if (!state.is_finished) return;
        if (item.timer) clearInterval(item.timer);
        item.timer = undefined;
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
        item.status = "failed";
        item.detail = errorDetail(error);
        if (item.timer) clearInterval(item.timer);
        item.timer = undefined;
        group.faceUrl = undefined;
        await verifyNextFace(group);
      }
    }, 1000);
  } catch (error) {
    item.status = "failed";
    item.detail = errorDetail(error);
    await verifyNextFace(group);
  }
}

async function callTicketApi(api: { method: string; url: string }) {
  let path = api.url;
  if (isDesktopRuntime() && /^https?:\/\//.test(path)) {
    const parsed = new URL(path);
    path = `${parsed.pathname}${parsed.search}`;
  }
  return apiRequest<any>({ method: api.method.toUpperCase() as any, path });
}

export async function createConnectionTokenWithAcl(
  body: ConnectionBody,
  meta: { orgId?: string; assetName: string; scopeId?: string; batchId?: string }
) {
  try {
    const token = await createConnectionToken(body, meta.orgId);
    const pending = useAclDialog().request(token, { body, ...meta });
    if (pending) return pending;
    if (!token.id) throw new Error(token.detail || "Missing connection token");
    return token;
  } catch (error) {
    const pending = useAclDialog().request(error, { body, ...meta });
    if (!pending) throw error;
    return pending;
  }
}
