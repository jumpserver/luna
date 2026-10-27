import type { MaybeRefOrGetter } from "vue";
import type { ConnectionBody, TokenResponse } from "~/types";
import { ApiRequestError } from "~/composables/useApiRequest";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { writeClipboardText } from "~/utils/clipboard";
import { buildFaceLivePageUrl, buildFaceLiveRendererPageUrl, getOrCreateFaceMonitorToken } from "~/utils/faceLive";

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
  orgId?: string;
  admin?: boolean;
  status: AclItemStatus;
  detail?: string;
  unavailable?: boolean;
  token?: TokenResponse;
  assignees?: string;
  reason?: string;
  reasonInvalid?: boolean;
  mfaType?: string;
  mfaCode?: string;
  mfaCodeInvalid?: boolean;
  mfaSending?: boolean;
  inFlight?: boolean;
  preparationReady?: boolean;
  resolve: (token: TokenResponse | null) => void;
  settled?: boolean;
  timer?: ReturnType<typeof setTimeout>;
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
  activeItemId?: string;
  reasonForAll?: boolean;
  reviewApprovedTimer?: ReturnType<typeof setInterval>;
  reviewApprovedCountdown?: number;
  reviewApprovedShown?: boolean;
}
export interface AclReviewerGroup {
  id: string;
  label: string;
  items: AclDialogItem[];
}

export function getAclReviewerGroups(items: AclDialogItem[]): AclReviewerGroup[] {
  const reviewers = new Map<string, AclReviewerGroup>();
  for (const item of items) {
    if (!getAclStepState(item, "review")) continue;
    const people =
      item.token?.acl?.reviewers ??
      (item.token?.from_ticket_info?.assignees || []).map((name: string) => ({
        id: `display:${name}`,
        name,
        username: ""
      }));
    for (const person of people.length ? people : [{ id: "unavailable", name: "", username: "" }]) {
      const label =
        person.username && person.name !== person.username
          ? `${person.name} (${person.username})`
          : person.name || person.username;
      let reviewer = reviewers.get(person.id);
      if (!reviewer) {
        reviewer = { id: person.id, label, items: [] };
        reviewers.set(person.id, reviewer);
      }
      if (!reviewer.items.some((candidate) => candidate.id === item.id)) reviewer.items.push(item);
    }
  }
  return [...reviewers.values()];
}

function reviewTicketId(token?: TokenResponse): string | undefined {
  return typeof token?.from_ticket === "string" ? token.from_ticket : token?.from_ticket?.id;
}

export function getAclReviewTickets(items: AclDialogItem[]) {
  const tickets = new Map<
    string,
    { key: string; id?: string; link?: string; submitted: boolean; items: AclDialogItem[] }
  >();
  for (const item of items) {
    const link = item.token?.from_ticket_info?.ticket_detail_page_url as string | undefined;
    const ticketId = reviewTicketId(item.token);
    const reviewGroup = item.token?.acl?.review_group;
    const orgId = item.token?.org_id || item.orgId;
    const reviewers = item.token?.acl?.reviewers;
    const reviewerIds = [...new Set(reviewers?.map((reviewer) => reviewer.id))].sort();
    const legacyGroup =
      orgId && reviewerIds.length && reviewerIds.every(Boolean) ? JSON.stringify([orgId, reviewerIds]) : undefined;
    const key = ticketId
      ? `ticket:${ticketId}`
      : link
        ? `ticket-link:${link}`
        : reviewGroup
          ? `review-group:${reviewGroup}`
          : legacyGroup
            ? `reviewers:${legacyGroup}`
            : `unsubmitted:${item.id}`;
    let ticket = tickets.get(key);
    if (!ticket) {
      ticket = { key, id: ticketId, link, submitted: Boolean(ticketId || link), items: [] };
      tickets.set(key, ticket);
    }
    if (!ticket.link && link) ticket.link = link;
    if (!ticket.items.some((candidate) => candidate.id === item.id)) ticket.items.push(item);
  }
  return [...tickets.values()].map((ticket) => {
    const states = ticket.items.map((item) =>
      isReviewDeclinedItem(item) ? item.status : item.token?.acl?.review_status
    );
    // A ticket has one outcome even while its token polls arrive at different times.
    const status = states.includes("rejected")
      ? "rejected"
      : states.includes("closed")
        ? "closed"
        : states.includes("approved")
          ? "approved"
          : states.every((state) => state === undefined) &&
              ticket.items.every((item) => getAclStepState(item, "review") === "passed")
            ? "approved"
            : ticket.submitted
              ? "pending"
              : "ready";
    return { ...ticket, status };
  });
}
const groups = ref<AclDialogGroup[]>([]);
const collectingBatches = reactive(new Map<string, { assetId: string; id: string; scopeId?: string }[]>());
const cancelledBatches = new Set<string>();
const pendingTokenRequests = new Set<{ scopeId?: string; cancelled: boolean }>();
const isCollecting = (group?: AclDialogGroup) =>
  Boolean(group?.batchId && collectingBatches.get(group.batchId)?.length);

function resumeBatchConnections(batchId: string) {
  const batch = groups.value.filter((group) => group.batchId === batchId);
  for (const group of batch) {
    if (!isCollecting(group) && !isConnectionUnavailable(group) && !hasPendingReview(group)) pauseAfterReview(group);
  }
  if (
    batch.length &&
    !isCollecting(batch[0]) &&
    !isConnectionUnavailable(batch[0]) &&
    !hasPendingReview(batch[0]!) &&
    !hasReviewCountdown(batch[0]!) &&
    batch.some((group) => group.items.some((item) => !item.settled && !isReviewDeclinedItem(item)))
  ) {
    for (const item of batch.flatMap((group) => group.items)) {
      if (!item.settled && isReviewDeclinedItem(item)) void cancelItem(item);
    }
  }
  for (const group of batch) {
    finishApprovedConnections(group);
    startAccountPreparation(group);
  }
}

function resumeConnections(group: AclDialogGroup) {
  if (group.batchId) resumeBatchConnections(group.batchId);
  else {
    finishApprovedConnections(group);
    startAccountPreparation(group);
  }
}

export function trackAclBatchConnection(batchId: string | undefined, assetId: string, entryId?: string) {
  if (!batchId) return () => {};
  const entry = { assetId, id: entryId || crypto.randomUUID(), scopeId: entryId };
  if (!collectingBatches.get(batchId)?.some((item) => item.id === entry.id))
    collectingBatches.set(batchId, [...(collectingBatches.get(batchId) || []), entry]);
  return () => {
    collectingBatches.set(
      batchId,
      (collectingBatches.get(batchId) || []).filter((item) => item.id !== entry.id)
    );
    if (!collectingBatches.get(batchId)?.length) collectingBatches.delete(batchId);
    queueMicrotask(() => resumeBatchConnections(batchId));
  };
}

function completeBatchToken(batchId: string | undefined, assetId: string, scopeId?: string) {
  if (!batchId) return;
  const entries = collectingBatches.get(batchId) || [];
  let index = scopeId ? entries.findIndex((item) => item.assetId === assetId && item.scopeId === scopeId) : -1;
  if (index < 0 && !scopeId) {
    const unscoped = entries.filter((item) => item.assetId === assetId && !item.scopeId);
    if (unscoped.length === 1) index = entries.indexOf(unscoped[0]!);
  }
  if (index >= 0) entries.splice(index, 1);
  if (!entries.length) collectingBatches.delete(batchId);
  queueMicrotask(() => resumeBatchConnections(batchId));
}

export const ACL_STEP_LABELS = {
  reason: "AclDialog.ConnectionReason",
  mfa: "AclDialog.MfaVerify",
  face: "AclDialog.FaceVerify",
  review: "AclDialog.ReviewStep",
  push_account: "AclDialog.PushAccount",
  face_online: "AclDialog.FaceOnline"
} as const;
export type AclStep = keyof typeof ACL_STEP_LABELS;
export const ACL_REASON_MAX_LENGTH = 4096;

export function getAclStepState(item: AclDialogItem, step: AclStep) {
  if (step === "push_account" && item.preparationReady) return "pending";
  if (step === "face_online") {
    if (!item.token?.acl?.face_online) return undefined;
    return item.token.acl.face_online_acknowledged ? "passed" : "pending";
  }
  return item.token?.acl?.requirements[step];
}

function isReviewDeclinedItem(item: AclDialogItem) {
  return item.status === "rejected" || item.status === "closed";
}

export function getAclSteps(group?: AclDialogGroup): AclStep[] {
  return (Object.keys(ACL_STEP_LABELS) as AclStep[]).filter((step) =>
    group?.items.some(
      (item) => (step === "review" || !isReviewDeclinedItem(item)) && getAclStepState(item, step) !== undefined
    )
  );
}

export function getCurrentAclStep(group?: AclDialogGroup): AclStep | undefined {
  if (group?.reviewApprovedTimer) return "review";
  const active = group?.items.filter((item) => !item.settled) || [];
  if (active.length && active.every(isReviewDeclinedItem)) return "review";
  return getAclSteps(group).find((step) =>
    active.some(
      (item) => !isReviewDeclinedItem(item) && getAclStepState(item, step) && getAclStepState(item, step) !== "passed"
    )
  );
}

function isConnectionUnavailable(group?: AclDialogGroup) {
  return relatedGroups(group).some((candidate) => candidate.items.some((item) => !item.settled && item.unavailable));
}

function relatedGroups(group?: AclDialogGroup) {
  if (!group) return [];
  return [
    group,
    ...groups.value.filter((candidate) => group.batchId && candidate !== group && candidate.batchId === group.batchId)
  ];
}

function hasPendingReview(group: AclDialogGroup) {
  return relatedGroups(group).some((candidate) =>
    candidate.items.some(
      (item) =>
        !item.settled &&
        !isReviewDeclinedItem(item) &&
        getAclStepState(item, "review") &&
        getAclStepState(item, "review") !== "passed"
    )
  );
}

function hasReviewCountdown(group: AclDialogGroup) {
  return relatedGroups(group).some((candidate) => Boolean(candidate.reviewApprovedTimer));
}

export function useAclDialogPresentation(source: MaybeRefOrGetter<AclDialogGroup | undefined>) {
  const { t } = useI18n();
  const group = computed(() => toValue(source));
  const step = computed(() => getCurrentAclStep(group.value));
  const steps = computed(() => getAclSteps(group.value).map((value) => ({ value, title: t(ACL_STEP_LABELS[value]) })));
  const stepIndex = computed(() =>
    Math.max(
      0,
      steps.value.findIndex((item) => item.value === step.value)
    )
  );
  const currentItems = computed(
    () =>
      group.value?.items.filter(
        (item) =>
          !item.settled &&
          !isReviewDeclinedItem(item) &&
          step.value &&
          getAclStepState(item, step.value) &&
          getAclStepState(item, step.value) !== "passed"
      ) || []
  );
  const isPreparation = computed(() => step.value === "push_account");
  const affectedItems = computed(
    () =>
      group.value?.items.filter(
        (item) =>
          step.value && (step.value === "review" || !isReviewDeclinedItem(item)) && getAclStepState(item, step.value)
      ) || []
  );
  const selectedItem = computed(
    () => currentItems.value.find((item) => item.id === group.value?.activeItemId) || currentItems.value[0]
  );
  const displayItems = computed(() => {
    if (["reason", "mfa", "face", "face_online"].includes(step.value || ""))
      return selectedItem.value ? [selectedItem.value] : [];
    if (step.value === "review") return [];
    return currentItems.value;
  });
  const isPushFailed = computed(
    () =>
      isPreparation.value &&
      currentItems.value.some(
        (item) => item.status === "failed" || item.token?.acl?.requirements.push_account === "failed"
      )
  );
  const isReview = computed(() => step.value === "review");
  const isActionable = computed(() => group.value?.code === "acl_controls");
  const isUnavailable = computed(() => isConnectionUnavailable(group.value));
  const isReviewApproved = computed(() => Boolean(group.value?.reviewApprovedTimer));
  const isReviewDeclined = computed(() => {
    const active = group.value?.items.filter((item) => !item.settled) || [];
    return active.length > 0 && active.every(isReviewDeclinedItem);
  });
  const reviewContinueLabel = computed(() =>
    t(
      relatedGroups(group.value).some((candidate) =>
        candidate.items.some(
          (item) =>
            !item.settled &&
            !isReviewDeclinedItem(item) &&
            (["push_account", "face_online"] as const).some(
              (step) => getAclStepState(item, step) && getAclStepState(item, step) !== "passed"
            )
        )
      )
        ? "AclDialog.NextStep"
        : "AclDialog.ContinueConnection"
    )
  );
  const isBatch = computed(() => (group.value?.items.length || 0) > 1);
  const isBusy = computed(() => currentItems.value.some((item) => item.status === "submitting" || item.mfaSending));
  const collecting = computed(() => isCollecting(group.value));
  const hasPending = computed(() =>
    currentItems.value.some((item) => ["submitting", "pending", "verifying"].includes(item.status))
  );
  const canSubmit = computed(
    () =>
      isActionable.value &&
      !isUnavailable.value &&
      !isReviewApproved.value &&
      !(
        group.value &&
        (hasReviewCountdown(group.value) ||
          (["push_account", "face_online"].includes(step.value || "") && hasPendingReview(group.value)))
      ) &&
      !isReviewDeclined.value &&
      !collecting.value &&
      !isPushFailed.value &&
      !isBusy.value &&
      !(step.value === "face" && currentItems.value.some((item) => item.status === "verifying")) &&
      currentItems.value.some(
        (item) =>
          ["ready", "failed"].includes(item.status) &&
          (step.value !== "review" || getAclStepState(item, "review") !== "failed")
      )
  );
  const title = computed(() => {
    if (!group.value) return "";
    return t(
      isActionable.value
        ? steps.value.length === 1
          ? ACL_STEP_LABELS[steps.value[0]!.value]
          : "AclDialog.ConnectionControls"
        : "AclDialog.LoginReminder"
    );
  });
  const description = computed(() => {
    if (!group.value) return "";
    if (isActionable.value) {
      if (isReview.value) return t(hasPending.value ? "AclDialog.ReviewPending" : "AclDialog.NeedReview");
      return "";
    }
    const code = group.value?.code;
    const key =
      code === "acl_reject"
        ? "Reject"
        : code === "acl_face_online_not_supported"
          ? "FaceOnlineNotSupported"
          : code === "no_face_feature"
            ? "NoFaceFeature"
            : "Restricted";
    return t(`AclDialog.${key}`);
  });
  const submitLabel = computed(() => {
    if (isPushFailed.value) return t("AclDialog.PushStatus.failed");
    if (collecting.value) return t("AclDialog.Processing");
    if (hasPending.value)
      return t(
        step.value === "face"
          ? "AclDialog.Status.verifying"
          : step.value === "review"
            ? "AclDialog.Status.pending"
            : "AclDialog.Processing"
      );
    if (currentItems.value.some((item) => item.status === "failed")) return t("Face.Remote.Retry");
    if (step.value === "face") return t("ConnectionSetup.StartFaceVerify");
    if (step.value === "review") return t("AclDialog.SubmitReview");
    if (
      step.value === "reason" &&
      currentItems.value.length > 1 &&
      group.value?.activeItemId &&
      !group.value.reasonForAll
    )
      return t("AclDialog.NextAsset");
    return t(stepIndex.value === steps.value.length - 1 ? "AclDialog.ContinueConnection" : "AclDialog.NextStep");
  });
  return {
    canSubmit,
    collecting,
    currentItems,
    affectedItems,
    displayItems,
    selectedItem,
    description,
    hasPending,
    isActionable,
    isUnavailable,
    isReviewApproved,
    isReviewDeclined,
    reviewContinueLabel,
    isBatch,
    isBusy,
    isPreparation,
    isPushFailed,
    isReview,
    step,
    steps,
    stepIndex,
    submitLabel,
    title
  };
}
function detail(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (typeof error.data?.detail === "string") return error.data.detail;
    return (
      Object.entries(error.data || {})
        .filter(([key]) => key !== "code")
        .flatMap(([, value]) => (typeof value === "string" ? [value] : Array.isArray(value) ? value : []))
        .join("\n") || error.message
    );
  }
  return error instanceof Error ? error.message : String(error || "");
}
function clearTimers(item: AclDialogItem) {
  for (const key of ["timer", "pageTimer", "faceTimer"] as const) {
    if (item[key]) clearTimeout(item[key]);
    item[key] = undefined;
  }
}
function finish(item: AclDialogItem, token: TokenResponse | null) {
  if (item.settled) return;
  clearTimers(item);
  item.settled = true;
  item.resolve(token);
  const group = groups.value.find((group) => group.items.includes(item));
  if (group?.items.every((candidate) => candidate.settled)) {
    groups.value = groups.value.filter((candidate) => candidate !== group);
  }
}
function clearReviewApprovedTimer(group: AclDialogGroup) {
  if (group.reviewApprovedTimer) clearInterval(group.reviewApprovedTimer);
  group.reviewApprovedTimer = undefined;
  group.reviewApprovedCountdown = undefined;
}

function pauseAfterReview(group: AclDialogGroup) {
  if (group.reviewApprovedShown) return false;
  if (group.reviewApprovedTimer) return true;
  const reviewed = group.items.filter(
    (item) => !item.settled && !isReviewDeclinedItem(item) && getAclStepState(item, "review")
  );
  if (
    !reviewed.length ||
    reviewed.some((item) => getAclStepState(item, "review") !== "passed") ||
    !reviewed.some((item) => reviewTicketId(item.token) || item.token?.from_ticket_info?.ticket_detail_page_url)
  )
    return false;
  group.reviewApprovedCountdown = 3;
  group.reviewApprovedTimer = setInterval(() => {
    if (!groups.value.includes(group) || isConnectionUnavailable(group)) {
      clearReviewApprovedTimer(group);
      return;
    }
    group.reviewApprovedCountdown = (group.reviewApprovedCountdown || 1) - 1;
    if (group.reviewApprovedCountdown > 0) return;
    clearReviewApprovedTimer(group);
    group.reviewApprovedShown = true;
    resumeConnections(group);
  }, 1000);
  return true;
}

function finishApprovedConnections(group: AclDialogGroup) {
  if (isCollecting(group) || isConnectionUnavailable(group)) return;
  if (hasPendingReview(group)) return;
  if (!group.items.some((item) => !item.settled && !isReviewDeclinedItem(item))) {
    clearReviewApprovedTimer(group);
    return;
  }
  if (pauseAfterReview(group) || hasReviewCountdown(group)) return;
  for (const item of group.items) {
    if (!item.settled && isReviewDeclinedItem(item)) void cancelItem(item);
  }
  for (const item of group.items) {
    if (item.status === "approved" && item.token?.is_active) finish(item, item.token);
  }
}
function requestAcl(
  error: unknown,
  input: {
    body?: ConnectionBody;
    orgId?: string;
    assetName: string;
    scopeId?: string;
    batchId?: string;
    admin?: boolean;
  }
): Promise<TokenResponse | null> | null {
  const payload = error instanceof ApiRequestError ? error.data : (error as Partial<TokenResponse> | undefined);
  const token =
    payload?.id &&
    ((payload.acl && (!payload.is_active || (payload.acl.face_online && !payload.acl.face_online_acknowledged))) ||
      (input.batchId && payload.is_active))
      ? (payload as TokenResponse)
      : undefined;
  const code = token ? "acl_controls" : String(payload?.code || "");
  if (!token && !code.startsWith("acl_") && code !== "no_face_feature") return null;
  if (input.batchId && cancelledBatches.has(input.batchId)) {
    if (token) void advanceConnectionAcl(token.id, { cancel: true }, input.orgId, input.admin).catch(() => null);
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const id = `${input.batchId ? `batch:${input.batchId}` : input.scopeId ? `scope:${input.scopeId}` : "global"}:${Boolean(input.admin)}:${code}`;
    let group = groups.value.find((group) => group.id === id);
    if (!group) {
      group = reactive({ id, code, items: [], submitted: false, batchId: input.batchId });
      groups.value.push(group);
    }
    const item: AclDialogItem = reactive({
      scopeId: input.scopeId,
      assetName: input.assetName,
      orgId: input.orgId,
      admin: input.admin,
      id: crypto.randomUUID(),
      token,
      status: token
        ? token.is_active &&
          Object.values(token.acl?.requirements || {}).every((state) => state === "passed") &&
          (!token.acl?.face_online || token.acl.face_online_acknowledged)
          ? "approved"
          : "ready"
        : "failed",
      resolve,
      mfaType: token?.acl?.mfa_methods[0]?.value,
      detail: token ? undefined : detail(error)
    });
    group.items.push(item);
    resumeConnections(group);
  });
}
async function cancelItem(item: AclDialogItem) {
  clearTimers(item);
  // Settle before awaiting so an in-flight poll cannot release this token.
  finish(item, null);
  if (item.token) {
    await advanceConnectionAcl(item.token.id, { cancel: true }, item.orgId, item.admin).catch(() => null);
  }
}
async function closeGroup(group: AclDialogGroup) {
  const closing = relatedGroups(group);
  closing.forEach(clearReviewApprovedTimer);
  if (group.batchId) cancelledBatches.add(group.batchId);
  groups.value = groups.value.filter((candidate) => !closing.includes(candidate));
  await Promise.all(closing.flatMap((candidate) => candidate.items.filter((item) => !item.settled).map(cancelItem)));
}
export async function closeAclScope(scopeId: string) {
  for (const request of pendingTokenRequests) {
    if (request.scopeId === scopeId) request.cancelled = true;
  }
  for (const group of [...groups.value]) {
    const items = group.items.filter((item) => item.scopeId === scopeId);
    await Promise.all(items.filter((item) => !item.settled).map(cancelItem));
    group.items = group.items.filter((item) => !items.includes(item));
    if (!group.items.length) {
      clearReviewApprovedTimer(group);
      groups.value = groups.value.filter((candidate) => candidate !== group);
      if (group.batchId) resumeBatchConnections(group.batchId);
    } else {
      resumeConnections(group);
    }
  }
}
function fail(group: AclDialogGroup, item: AclDialogItem, error: unknown) {
  if (item.settled || isReviewDeclinedItem(item)) return;
  clearTimers(item);
  item.status = "failed";
  item.detail = detail(error);
  item.unavailable ||= error instanceof ApiRequestError && error.data?.code === "connection_unavailable";
  if (item.unavailable) {
    clearReviewApprovedTimer(group);
    group.items.forEach(clearTimers);
    group.submitted = false;
  }
  group.faceUrl = undefined;
}
function failFaceGroup(group: AclDialogGroup, message: string) {
  for (const item of group.items.filter((item) => !item.settled && getAclStepState(item, "face") === "pending")) {
    fail(group, item, message);
  }
  group.submitted = false;
}
function startFace(group: AclDialogGroup, item: AclDialogItem) {
  if (group.items.some((candidate) => candidate !== item && candidate.status === "verifying")) {
    item.status = "pending";
    return;
  }
  if (item.status === "verifying") return;
  const faceToken = item.token?.acl?.face_token;
  if (!faceToken) {
    fail(group, item, "AclDialog.FacePageUnavailable");
    return;
  }
  const store = useUserInfoStore();
  const siteUrl = isDesktopRuntime() ? store.currentSite : window.location.origin;
  const pageOpen = Boolean(group.faceUrl);
  item.status = "verifying";
  group.faceUrl = isDesktopRuntime()
    ? buildFaceLiveRendererPageUrl({ rendererUrl: window.location.href, siteUrl, token: faceToken })
    : buildFaceLivePageUrl({ siteUrl, rendererPath: window.location.pathname, token: faceToken });
  if (!pageOpen) item.pageTimer = setTimeout(failFaceGroup, 10_000, group, "AclDialog.FacePageUnavailable");
  item.faceTimer = setTimeout(failFaceGroup, 120_000, group, "AclDialog.FaceVerificationTimedOut");
}
function startAccountPreparation(group: AclDialogGroup) {
  if (isCollecting(group) || isConnectionUnavailable(group) || hasPendingReview(group) || hasReviewCountdown(group))
    return;
  if (getCurrentAclStep(group) !== "push_account") return;
  for (const item of group.items) {
    if (
      !item.settled &&
      !item.preparationReady &&
      item.status === "ready" &&
      ["pending", "running"].includes(getAclStepState(item, "push_account") || "")
    ) {
      void advanceItem(group, item, { step: "push_account" });
    }
  }
}

async function advanceItem(
  group: AclDialogGroup,
  item: AclDialogItem,
  input: Record<string, unknown>,
  polling = false
) {
  if (!item.token || item.settled || item.inFlight || isReviewDeclinedItem(item) || isConnectionUnavailable(group))
    return;
  const step = input.step as AclStep;
  const confirmingPreparation = step === "push_account" && item.preparationReady;
  item.inFlight = true;
  if (!polling) item.status = "submitting";
  try {
    const token = await advanceConnectionAcl(item.token.id, input, item.orgId, item.admin);
    if (item.settled || (polling && item.status === "failed")) return;
    receiveToken(group, item, token, step, confirmingPreparation);
  } catch (error) {
    if (item.settled || (polling && item.status === "failed")) return;
    if (step === "mfa") item.mfaCode = "";
    fail(group, item, error);
    group.submitted = false;
  } finally {
    item.inFlight = false;
    resumeConnections(group);
  }
}

function receiveToken(
  group: AclDialogGroup,
  item: AclDialogItem,
  token: TokenResponse,
  step: AclStep,
  confirmingPreparation = false
) {
  if (isConnectionUnavailable(group) || isReviewDeclinedItem(item)) return;
  item.token = token;
  if (step === "push_account" && token.acl?.requirements.push_account === "passed") {
    item.preparationReady = !confirmingPreparation;
  }
  if (step === "mfa") item.mfaCode = "";
  item.assignees = token.from_ticket_info?.assignees?.join(", ");
  const ticketId = reviewTicketId(token);
  const reviewStatus = token.acl?.review_status;
  if (
    !token.acl?.cancelled &&
    ticketId &&
    (reviewStatus === "rejected" || reviewStatus === "closed") &&
    token.acl?.requirements.review === "failed"
  ) {
    // A rejected ticket applies to all its assets, including stale successful polls.
    for (const candidate of group.items) {
      if (candidate.settled || reviewTicketId(candidate.token) !== ticketId) continue;
      clearTimers(candidate);
      candidate.status = reviewStatus;
      candidate.detail = `AclDialog.${reviewStatus === "rejected" ? "ReviewRejected" : "ReviewClosed"}`;
    }
    resumeConnections(group);
    return;
  }
  if (token.acl?.cancelled || token.acl?.error) {
    if (token.acl.cancelled) item.unavailable = true;
    fail(group, item, token.acl.error || "AclDialog.ReviewClosed");
    group.submitted = false;
    return;
  }
  if (
    step === "face" &&
    !group.items.some((candidate) => !candidate.settled && getAclStepState(candidate, "face") === "pending")
  ) {
    group.faceUrl = undefined;
  }
  const remaining = (Object.keys(ACL_STEP_LABELS) as AclStep[]).find(
    (key) => getAclStepState(item, key) && getAclStepState(item, key) !== "passed"
  );
  if (token.is_active && !remaining) {
    clearTimers(item);
    item.status = "approved";
    resumeConnections(group);
    return;
  }
  if (step === "review") resumeConnections(group);
  if (item.preparationReady) {
    clearTimers(item);
    item.status = "ready";
    group.submitted = false;
    return;
  }
  if (getAclStepState(item, step) === "passed") {
    clearTimers(item);
    item.status = "ready";
    group.submitted = false;
    return;
  }
  if (step === "reason" || step === "mfa" || step === "face_online") {
    fail(group, item, "AclDialog.StepIncomplete");
    group.submitted = false;
    return;
  }
  if (step === "face") startFace(group, item);
  else item.status = "pending";
  group.submitted = true;
  // Schedule after completion; slow responses never create overlapping polls.
  if (item.status !== "failed") {
    item.timer = setTimeout(() => void advanceItem(group, item, { step }, true), 2000);
  }
}

async function advanceBatch(group: AclDialogGroup, items: AclDialogItem[], input: Record<string, unknown>) {
  if (!items.length || isConnectionUnavailable(group)) return;
  for (const item of items) {
    clearTimers(item);
    item.detail = undefined;
    item.inFlight = true;
    item.status = "submitting";
  }
  const step = input.step as AclStep;
  try {
    const tokens = await advanceConnectionAclBatch(
      items.map((item) => item.token!.id),
      input,
      items[0]!.orgId,
      items[0]!.admin
    );
    for (const item of items) {
      if (item.settled) continue;
      const token = tokens.find((token) => token.id === item.token!.id);
      if (!token) throw new Error("AclDialog.StepIncomplete");
      receiveToken(group, item, token, step);
    }
  } catch (error) {
    for (const item of items) {
      if (step === "mfa") item.mfaCode = "";
      fail(group, item, error);
    }
    group.submitted = false;
  } finally {
    for (const item of items) item.inFlight = false;
    resumeConnections(group);
  }
}
export function useAclDialog() {
  const { t } = useI18n();
  const toast = useToast();
  const activeGroup = computed(() => groups.value[0]);
  const globalGroup = computed(() => {
    const visible = groups.value.filter(
      (group) =>
        (group.batchId || !group.items[0]?.scopeId) && (group.code !== "acl_controls" || getAclSteps(group).length > 0)
    );
    const first = visible[0];
    if (!first?.batchId || first.code !== "acl_controls") return first;
    const order = Object.keys(ACL_STEP_LABELS);
    const rank = (group: AclDialogGroup) => {
      const step = getCurrentAclStep(group);
      const index = order.indexOf(step || "");
      const unfinished = group.items.filter(
        (item) =>
          !item.settled &&
          !isReviewDeclinedItem(item) &&
          step &&
          getAclStepState(item, step) &&
          getAclStepState(item, step) !== "passed"
      );
      const actionable = unfinished.some(
        (item) =>
          !item.inFlight &&
          ["ready", "failed"].includes(item.status) &&
          (step !== "review" || getAclStepState(item, step) !== "failed")
      );
      const waiting = unfinished.some((item) => ["submitting", "pending", "verifying"].includes(item.status));
      return (index < 0 ? order.length : index) * 3 + (actionable ? 0 : waiting ? 1 : 2);
    };
    return visible
      .filter((group) => group.batchId === first.batchId && group.code === "acl_controls")
      .reduce((current, group) => (rank(group) < rank(current) ? group : current), first);
  });
  const submit = async (target?: AclDialogGroup) => {
    const group = target || globalGroup.value || activeGroup.value;
    if (!group || isCollecting(group) || isConnectionUnavailable(group) || group.reviewApprovedTimer) return;
    const step = getCurrentAclStep(group);
    if (hasReviewCountdown(group) || (["push_account", "face_online"].includes(step || "") && hasPendingReview(group)))
      return;
    if (!step || (step === "face" && group.items.some((item) => item.status === "verifying"))) return;
    if (
      step === "push_account" &&
      group.items.some((item) => item.status === "failed" || item.token?.acl?.requirements.push_account === "failed")
    )
      return;
    let items = group.items.filter(
      (item) =>
        !item.settled &&
        !item.inFlight &&
        !item.mfaSending &&
        ["ready", "failed"].includes(item.status) &&
        getAclStepState(item, step) &&
        getAclStepState(item, step) !== "passed"
    );
    if (step === "reason" && group.reasonForAll) {
      const source = items.find((item) => item.id === group.activeItemId) || items[0];
      if (!source) return;
      source.reasonInvalid = !source.reason?.trim() || source.reason.length > ACL_REASON_MAX_LENGTH;
      if (source.reasonInvalid) return;
      for (const item of items) item.reason = source.reason;
    } else if (group.activeItemId && step === "reason") {
      items = items.filter((item) => item.id === group.activeItemId);
    }
    if (items.length > 1 && ["mfa", "face", "review", "face_online"].includes(step)) {
      const inputItem = items.find((item) => item.id === group.activeItemId) || items[0]!;
      inputItem.mfaCodeInvalid = step === "mfa" && !inputItem.mfaCode?.trim();
      if (inputItem.mfaCodeInvalid) return;
      group.submitted = true;
      await advanceBatch(group, items, {
        step,
        ...(step === "face" ? { retry_face: true } : {}),
        ...(step === "mfa" ? { mfa_type: inputItem.mfaType, mfa_code: inputItem.mfaCode || "" } : {})
      });
      return;
    }
    for (const item of items) {
      item.reasonInvalid = step === "reason" && (!item.reason?.trim() || item.reason.length > ACL_REASON_MAX_LENGTH);
      item.mfaCodeInvalid = step === "mfa" && !item.mfaCode?.trim();
    }
    if (items.some((item) => item.reasonInvalid || item.mfaCodeInvalid)) return;
    group.submitted = true;
    await Promise.all(
      items.map((item) => {
        clearTimers(item);
        item.detail = undefined;
        return advanceItem(group, item, {
          step,
          ...(step === "face" ? { retry_face: true } : {}),
          ...(step === "reason" ? { reason: item.reason || "" } : {}),
          ...(step === "mfa" ? { mfa_type: item.mfaType, mfa_code: item.mfaCode || "" } : {})
        });
      })
    );
  };
  const close = async (target?: AclDialogGroup) => {
    const group = target || globalGroup.value || activeGroup.value;
    if (group) await closeGroup(group);
  };
  return {
    activeGroup,
    globalGroup,
    isOpen: computed(() => Boolean(globalGroup.value)),
    groupForScope: (scopeId: string) =>
      computed(() => groups.value.find((group) => !group.batchId && group.items[0]?.scopeId === scopeId)),
    hasScopeGroup: (scopeId: string) =>
      groups.value.some((group) => !group.batchId && group.items[0]?.scopeId === scopeId),
    findScopeGroup: (scopeId?: string) =>
      scopeId
        ? groups.value.find((group) => !group.batchId && group.items.some((item) => item.scopeId === scopeId))
        : undefined,
    request: requestAcl,
    selectItem: (group: AclDialogGroup, id?: string) => {
      group.activeItemId = id;
    },
    setReasonForAll: (group: AclDialogGroup, enabled: boolean) => {
      group.reasonForAll = enabled;
    },
    submit,
    close,
    closeScope: closeAclScope,
    retryFace: submit,
    markFacePageReady: (group: AclDialogGroup) => {
      const item = group.items.find((item) => item.status === "verifying");
      if (item?.pageTimer) clearTimeout(item.pageTimer);
      if (item) item.pageTimer = undefined;
    },
    failFace: failFaceGroup,
    sendMfaCode: async (item: AclDialogItem) => {
      const group = groups.value.find((group) => group.items.includes(item));
      if (
        !item.token ||
        item.settled ||
        item.inFlight ||
        item.mfaSending ||
        !group ||
        isConnectionUnavailable(group) ||
        getCurrentAclStep(group) !== "mfa"
      )
        return;
      item.mfaSending = true;
      try {
        await advanceConnectionAcl(
          item.token.id,
          { step: "mfa", mfa_send: true, mfa_type: item.mfaType },
          item.orgId,
          item.admin
        );
        if (!item.settled && !isConnectionUnavailable(group))
          toast.add({ title: t("AclDialog.MfaCodeSent"), color: "success" });
      } catch (error) {
        fail(group, item, error);
      } finally {
        item.mfaSending = false;
      }
    },
    copyTicketLink: async (item: AclDialogItem) => {
      const link = item.token?.from_ticket_info?.ticket_detail_page_url;
      if (!link) return;
      try {
        await writeClipboardText(link);
        toast.add({ title: t("Common.CopySuccess"), color: "success" });
      } catch {
        toast.add({ title: t("Common.CopyFailed"), color: "error" });
      }
    }
  };
}
export async function createConnectionTokenWithAcl(
  body: ConnectionBody,
  meta: {
    orgId?: string;
    assetName: string;
    scopeId?: string;
    batchId?: string;
    admin?: boolean;
  }
) {
  const request = { scopeId: meta.scopeId, cancelled: false };
  pendingTokenRequests.add(request);
  let batchCompleted = false;
  const complete = () => {
    if (batchCompleted) return;
    batchCompleted = true;
    completeBatchToken(meta.batchId, body.asset, meta.scopeId);
  };
  try {
    const store = useUserInfoStore();
    const scope = `${store.currentSite || window.location.origin}\u0000${store.currentAccountId || "web"}`;
    const token = await createConnectionToken(body, meta.orgId, {
      admin: meta.admin,
      aclStepwise: true,
      faceMonitorToken: getOrCreateFaceMonitorToken(scope)
    });
    complete();
    if (request.cancelled || (meta.batchId && cancelledBatches.has(meta.batchId))) {
      await advanceConnectionAcl(token.id, { cancel: true }, meta.orgId, meta.admin).catch(() => null);
      return null;
    }
    const pending = requestAcl(token, { body, ...meta });
    if (pending) return pending;
    if (!token.id || !token.is_active) throw new Error(token.detail || "Missing active connection token");
    return token;
  } catch (error) {
    complete();
    if (request.cancelled) return null;
    const pending = requestAcl(error, { body, ...meta });
    if (!pending) throw error;
    return pending;
  } finally {
    pendingTokenRequests.delete(request);
  }
}
