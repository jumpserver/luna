<script setup lang="ts">
import type { AclDialogGroup } from "~/composables/useAclDialog";
import AclErrorDetail from "~/components/Modal/aclErrorDetail.vue";
import { ACL_REASON_MAX_LENGTH, getAclReviewerGroups, getAclReviewTickets } from "~/composables/useAclDialog";
import { isFaceLiveHostMessage, localizeFaceLiveDetail } from "~/utils/faceLive";

const props = defineProps<{ group: AclDialogGroup }>();
const { t } = useI18n();
const { copyTicketLink, sendMfaCode, retryFace, markFacePageReady, failFace, selectItem, setReasonForAll } =
  useAclDialog();
const {
  currentItems,
  affectedItems,
  displayItems,
  selectedItem,
  isActionable,
  isBatch,
  isBusy,
  isReviewApproved,
  step,
  steps,
  stepIndex
} = useAclDialogPresentation(() => props.group);
watch(
  () => selectedItem.value?.id,
  (id) => {
    selectItem(props.group, id);
  },
  { immediate: true }
);
const activeItemId = computed({ get: () => selectedItem.value?.id, set: (id) => selectItem(props.group, id) });
const reasonForAll = computed({
  get: () => Boolean(props.group.reasonForAll),
  set: (enabled) => setReasonForAll(props.group, enabled)
});
const scopeItems = computed(() =>
  step.value === "reason" && props.group.reasonForAll ? currentItems.value : affectedItems.value
);
const reviewTicketKey = ref<string>();
const reviewTickets = computed(() =>
  getAclReviewTickets(affectedItems.value).map((ticket, index) => ({
    ...ticket,
    label: `${t("AclDialog.TicketNumber", { number: index + 1 })} · ${t(`AclDialog.Status.${ticket.status}`)} · ${t("AclDialog.AssetCount", { count: ticket.items.length })}`,
    reviewers: getAclReviewerGroups(ticket.items)
      .map((reviewer) => reviewer.label || t("AclDialog.ReviewersUnavailable"))
      .join(", ")
  }))
);
const reviewSubmitted = computed(() => reviewTickets.value.some((ticket) => ticket.submitted));
const declinedTicketCount = computed(
  () => reviewTickets.value.filter((ticket) => ticket.status === "rejected" || ticket.status === "closed").length
);
const reviewPlanKnown = computed(() =>
  reviewTickets.value.every((ticket) => ticket.submitted || ticket.key.startsWith("review-group:"))
);
const selectedReviewTicket = computed(
  () => reviewTickets.value.find((ticket) => ticket.key === reviewTicketKey.value) || reviewTickets.value[0]
);
const activeReviewTicketKey = computed({
  get: () => selectedReviewTicket.value?.key,
  set: (key) => {
    reviewTicketKey.value = key;
  }
});
const fieldUi = {
  root: "min-w-0 w-full",
  wrapper: "min-w-0 w-full",
  label: "font-normal text-(--app-text-secondary)",
  container: "mt-1.5 min-w-0 w-full",
  help: "mt-1 text-right text-xs"
};
const selectUi = {
  content: "w-(--reka-select-trigger-width) min-w-0 max-w-(--reka-select-trigger-width)",
  viewport: "max-h-48",
  itemLabel: "truncate"
};
const selectContent = { position: "popper" as const, align: "start" as const, sideOffset: 4 };
const faceFrame = ref<HTMLIFrameElement | null>(null);
const visibleDetail = (detail: string) => {
  if (detail.startsWith("AccountProvisioning.Task:"))
    return t("AccountProvisioning.Task", { id: detail.split(":")[1] });
  if (detail.startsWith("AccountProvisioning.") || detail.startsWith("AclDialog.")) return t(detail);
  return localizeFaceLiveDetail(detail, t);
};
const reviewErrors = computed(() => {
  const errors = new Map<string, typeof affectedItems.value>();
  for (const item of affectedItems.value) {
    if (!item.detail) continue;
    const detail = visibleDetail(item.detail);
    const items = errors.get(detail) || [];
    items.push(item);
    errors.set(detail, items);
  }
  return [...errors].map(([detail, items]) => ({
    detail,
    assets:
      items.length < affectedItems.value.length
        ? [...new Set(items.map((item) => item.assetName))].join(", ")
        : undefined
  }));
});
const handleFaceMessage = (event: MessageEvent) => {
  if (!isFaceLiveHostMessage(event.data) || !faceFrame.value || event.source !== faceFrame.value.contentWindow) return;
  const expectedOrigin = props.group.faceUrl ? new URL(props.group.faceUrl).origin : "";
  if (!expectedOrigin || event.origin !== expectedOrigin) return;
  if (event.data.event === "page_ready") markFacePageReady(props.group);
  if (event.data.event === "client_error")
    failFace(props.group, String(event.data.message || "AclDialog.FacePageUnavailable"));
  if (event.data.event === "retry_requested") void retryFace(props.group);
};
onMounted(() => window.addEventListener("message", handleFaceMessage));
onBeforeUnmount(() => window.removeEventListener("message", handleFaceMessage));
</script>

<template>
  <section class="min-w-0 w-full space-y-4">
    <UStepper
      v-if="isActionable && steps.length > 1"
      :items="steps"
      :model-value="stepIndex"
      disabled
      size="xs"
      :aria-label="t('AclDialog.ConnectionControls')"
      :ui="{
        header: 'flex-wrap gap-x-4 gap-y-2',
        trigger: 'pointer-events-none size-5 shrink-0 text-xs opacity-100',
        title: 'text-sm leading-5 whitespace-nowrap font-normal group-data-[state=active]:font-medium',
        wrapper: 'mt-0 min-w-0',
        separator: 'hidden',
        item: 'flex w-auto flex-none items-center gap-2 text-start'
      }"
    />
    <p v-if="isActionable && steps.length > 1" class="sr-only" aria-live="polite">
      {{ t("AclDialog.StepProgress", { current: stepIndex + 1, total: steps.length }) }} · {{ steps[stepIndex]?.title }}
    </p>
    <template v-if="!isActionable">
      <AclErrorDetail v-for="item in group.items" :key="item.id" :detail="visibleDetail(item.detail || '')" />
    </template>
    <UFormField
      v-if="isActionable && isBatch && step !== 'review'"
      :label="t('AclDialog.ApplicableAssets')"
      :ui="fieldUi"
      :help="
        step === 'reason'
          ? t('AclDialog.ReasonProgress', {
              done: affectedItems.length - currentItems.length,
              total: affectedItems.length
            })
          : undefined
      "
    >
      <USelect
        v-if="step === 'reason' && !group.reasonForAll"
        v-model="activeItemId"
        :items="currentItems.map((item) => ({ label: item.assetName, value: item.id }))"
        :content="selectContent"
        :ui="selectUi"
        class="min-w-0 w-full"
        :disabled="isBusy"
        :aria-label="t('AclDialog.SelectAsset')"
      />
      <UPopover
        v-else
        :content="{ align: 'start', sideOffset: 4 }"
        :ui="{ content: 'w-(--reka-popover-trigger-width) max-w-[calc(100vw-3rem)] overflow-hidden' }"
      >
        <UButton
          color="neutral"
          variant="outline"
          class="min-w-0 w-full justify-between font-normal"
          trailing-icon="i-lucide-chevron-down"
          :aria-label="t('AclDialog.AffectedAssets', { count: scopeItems.length })"
        >
          <span class="min-w-0 flex-1 truncate text-left">
            {{
              scopeItems.length === 1
                ? scopeItems[0]?.assetName
                : t("AclDialog.AssetCount", { count: scopeItems.length })
            }}
          </span>
        </UButton>
        <template #content>
          <ul class="max-h-48 min-w-0 divide-y divide-(--app-border) overflow-y-auto px-3 text-sm">
            <li v-for="item in scopeItems" :key="item.id" class="break-all py-2 leading-5">{{ item.assetName }}</li>
          </ul>
        </template>
      </UPopover>
    </UFormField>
    <section v-if="step === 'review'" class="min-w-0 space-y-4">
      <template v-if="reviewSubmitted && selectedReviewTicket">
        <UFormField :label="t('AclDialog.ApprovalTicket')" :ui="fieldUi">
          <USelect
            v-model="activeReviewTicketKey"
            :items="reviewTickets.map((ticket) => ({ value: ticket.key, label: ticket.label }))"
            :content="selectContent"
            :ui="selectUi"
            class="min-w-0 w-full"
          />
        </UFormField>
        <div class="min-w-0 overflow-hidden rounded-(--app-radius) border border-(--app-border)">
          <div
            class="flex flex-wrap items-center justify-between gap-2 border-b border-(--app-border) px-3 py-2 text-sm"
          >
            <UBadge
              :color="
                selectedReviewTicket.status === 'approved'
                  ? 'success'
                  : ['rejected', 'closed'].includes(selectedReviewTicket.status)
                    ? 'error'
                    : 'neutral'
              "
              variant="subtle"
            >
              {{ t(`AclDialog.Status.${selectedReviewTicket.status}`) }}
            </UBadge>
            <div v-if="selectedReviewTicket.link" class="flex items-center gap-2">
              <UButton
                :to="selectedReviewTicket.link"
                target="_blank"
                rel="noopener noreferrer"
                variant="link"
                size="sm"
                trailing-icon="i-lucide-external-link"
              >
                {{ t("AclDialog.ViewTicket") }}
              </UButton>
              <UButton
                variant="link"
                size="sm"
                @click="
                  copyTicketLink(
                    selectedReviewTicket.items.find((item) => item.token?.from_ticket_info?.ticket_detail_page_url)!
                  )
                "
              >
                {{ t("Common.Copy") }}
              </UButton>
            </div>
          </div>
          <p class="break-words border-b border-(--app-border) px-3 py-2 text-sm text-(--app-muted)">
            {{ t("AclDialog.TicketReviewers", { names: selectedReviewTicket.reviewers }) }}
          </p>
          <ul class="max-h-48 divide-y divide-(--app-border) overflow-y-auto">
            <li v-for="item in selectedReviewTicket.items" :key="item.id" class="space-y-2 px-3 py-2">
              <p class="min-w-0 break-all text-sm text-(--app-fg)">{{ item.assetName }}</p>
            </li>
          </ul>
        </div>
      </template>
      <p class="text-sm text-(--app-muted)">
        {{
          reviewSubmitted
            ? t("AclDialog.ReviewSummary", { assets: affectedItems.length, tickets: reviewTickets.length })
            : reviewPlanKnown
              ? t("AclDialog.ReviewPlan", { assets: affectedItems.length, tickets: reviewTickets.length })
              : t("AclDialog.NeedReview")
        }}
      </p>
      <p v-if="isReviewApproved && declinedTicketCount" class="text-sm text-(--app-muted)">
        {{
          t("AclDialog.ReviewPartialResult", {
            approved: reviewTickets.length - declinedTicketCount,
            declined: declinedTicketCount
          })
        }}
      </p>
      <UAlert
        v-for="error in reviewErrors"
        :key="error.detail"
        color="error"
        variant="soft"
        :title="error.assets"
        :description="error.detail"
        :ui="{ title: 'break-words', description: 'break-words' }"
      />
    </section>
    <div v-for="item in displayItems" :key="item.id" class="space-y-4">
      <p v-if="isBatch && step === 'push_account'" class="font-medium text-(--app-fg)">{{ item.assetName }}</p>
      <UAlert v-if="item.detail" color="error" variant="soft" :description="visibleDetail(item.detail)" />
      <UFormField
        v-if="step === 'reason'"
        class="min-w-0"
        :error="
          item.reasonInvalid
            ? !item.reason?.trim()
              ? t('AclDialog.ConnectionReasonRequired')
              : item.reason.length > ACL_REASON_MAX_LENGTH
                ? t('AclDialog.ReasonTooLong', { max: ACL_REASON_MAX_LENGTH })
                : undefined
            : undefined
        "
        :help="t('AclDialog.ReasonLength', { count: item.reason?.length || 0, max: ACL_REASON_MAX_LENGTH })"
        :ui="{ ...fieldUi, container: 'min-w-0 w-full' }"
        required
      >
        <UTextarea
          v-model="item.reason"
          :aria-label="t('AclDialog.ConnectionReason')"
          :placeholder="t('AclDialog.ConnectionReasonRequired')"
          :maxlength="ACL_REASON_MAX_LENGTH"
          class="w-full"
          :disabled="isBusy"
          required
        />
      </UFormField>
      <UCheckbox
        v-if="step === 'reason' && (currentItems.length > 1 || group.reasonForAll)"
        v-model="reasonForAll"
        :label="t('AclDialog.ApplyReasonToAll')"
        :disabled="isBusy"
        class="min-w-0"
      />
      <template v-if="step === 'mfa'">
        <UFormField :label="t('AclDialog.MfaMethod')" :ui="fieldUi" required>
          <USelect
            v-model="item.mfaType"
            :items="item.token?.acl?.mfa_methods || []"
            value-key="value"
            :content="selectContent"
            :ui="selectUi"
            class="w-full"
            :disabled="isBusy"
          />
        </UFormField>
        <UButton
          v-if="item.token?.acl?.mfa_methods.find((method) => method.value === item.mfaType)?.challenge_required"
          variant="outline"
          :disabled="isBusy"
          @click="sendMfaCode(item)"
        >
          {{ t("AclDialog.SendMfaCode") }}
        </UButton>
        <p v-if="!item.token?.acl?.mfa_methods.length" class="text-sm text-warning">{{ t("AclDialog.EnrollMfa") }}</p>
        <UFormField
          :label="t('AclDialog.MfaCode')"
          :ui="fieldUi"
          :error="item.mfaCodeInvalid && !item.mfaCode?.trim() ? t('AclDialog.MfaCodeRequired') : undefined"
          required
        >
          <UInput
            v-model="item.mfaCode"
            type="text"
            autocomplete="one-time-code"
            class="min-w-0 w-full"
            :disabled="isBusy"
          />
        </UFormField>
      </template>
      <p v-if="step === 'face' && !group.faceUrl && !item.detail" class="text-sm text-(--app-muted)">
        {{ t("AclDialog.FaceInstructions") }}
      </p>
      <template v-if="step === 'push_account'">
        <UBadge
          :color="
            item.token?.acl?.preparation?.status === 'failed'
              ? 'error'
              : item.token?.acl?.preparation?.status === 'ready'
                ? 'success'
                : 'info'
          "
          variant="soft"
        >
          {{ t(`AclDialog.PushStatus.${item.token?.acl?.preparation?.status || "queued"}`) }}
        </UBadge>
        <p v-if="!item.detail" class="text-sm text-(--app-muted)">
          {{
            item.preparationReady
              ? t("AclDialog.PushReady")
              : ["queued", "running"].includes(item.token?.acl?.preparation?.status || "queued")
                ? t(
                    item.token?.acl?.preparation?.status === "running"
                      ? "AccountProvisioning.Running"
                      : "AccountProvisioning.Queued"
                  )
                : item.token?.acl?.preparation?.detail
          }}
        </p>
        <UProgress
          v-if="!item.detail"
          :model-value="item.preparationReady ? 100 : null"
          :color="item.preparationReady ? 'success' : 'primary'"
          :aria-label="t('AclDialog.PushAccount')"
        />
        <p v-if="item.token?.acl?.preparation?.execution_id" class="break-all text-xs text-(--app-muted)">
          {{ t("AccountProvisioning.Task", { id: item.token.acl.preparation.execution_id }) }}
        </p>
      </template>
      <UAlert
        v-if="step === 'face_online'"
        color="info"
        variant="soft"
        icon="i-lucide-camera"
        :description="t('AclDialog.FaceOnlineNotice')"
      />
    </div>
    <iframe
      v-if="step === 'face' && group.faceUrl"
      ref="faceFrame"
      :src="group.faceUrl"
      allow="camera"
      class="h-[360px] max-h-[45dvh] w-full border-0"
      sandbox="allow-scripts allow-same-origin"
      @error="failFace(group, 'AclDialog.FacePageUnavailable')"
    />
  </section>
</template>
