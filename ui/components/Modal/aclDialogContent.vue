<script setup lang="ts">
import type { AclDialogGroup } from "~/composables/useAclDialog";

import AclErrorDetail from "~/components/Modal/aclErrorDetail.vue";

const props = defineProps<{
  group: AclDialogGroup;
  embedded?: boolean;
  minimizable?: boolean;
}>();

const emit = defineEmits<{
  minimize: [];
}>();

const { t } = useI18n();
const { submit, close, copyTicketLink } = useAclDialog();
const { closePane } = useWorkspaceTabs();

const isReview = computed(() => props.group.code === "acl_review");
const isFace = computed(() => props.group.code.startsWith("acl_face_"));
const isActionable = computed(() => ["acl_review", "acl_face_verify"].includes(props.group.code));
const isBatch = computed(() => props.group.items.length > 1);
const isBusy = computed(() => props.group.items.some((item) => ["submitting", "verifying"].includes(item.status)));
const hasPending = computed(() =>
  props.group.items.some((item) => ["submitting", "pending", "verifying"].includes(item.status))
);
const title = computed(() =>
  isReview.value ? t("AclDialog.LoginReview") : isFace.value ? t("AclDialog.FaceVerify") : t("AclDialog.LoginReminder")
);
const description = computed(() => {
  if (!isBatch.value) {
    const item = props.group.items[0];
    if (item?.detail) return t("AclDialog.RequestFailed");
    if (isReview.value) {
      if (item?.status === "pending") return t("AclDialog.ReviewPending");
      if (item?.status === "rejected") return t("AclDialog.ReviewRejected");
      if (item?.status === "closed") return t("AclDialog.ReviewClosed");
      return t("AclDialog.NeedReview");
    }
    if (props.group.code === "acl_face_verify") {
      return item?.status === "verifying" ? t("AclDialog.CompleteFaceVerify") : t("AclDialog.NeedFaceVerify");
    }
    return t("ConnectError.AclFailed");
  }
  if (isReview.value) return t("AclDialog.ReviewGroupDescription");
  if (props.group.code === "acl_face_verify") return t("AclDialog.FaceGroupDescription");
  return t("AclDialog.ErrorGroupDescription");
});

const statusColor = (status: string) => {
  if (status === "approved") return "success";
  if (["failed", "rejected"].includes(status)) return "error";
  if (["submitting", "pending", "verifying"].includes(status)) return "info";
  return "neutral";
};

const handleClose = async () => {
  const scopeId = !isBatch.value ? props.group.items[0]?.scopeId : undefined;
  await close(props.group);
  if (props.embedded && scopeId) await closePane(scopeId);
};
</script>

<template>
  <section :class="embedded ? 'w-full' : 'p-1'">
    <header class="mb-4 flex items-start gap-3">
      <div class="min-w-0 flex-1">
        <h2 class="text-base font-semibold text-[var(--app-fg)]">{{ title }}</h2>
        <p class="mt-1 text-sm text-[var(--app-muted)]">{{ description }}</p>
      </div>
      <UButton
        v-if="minimizable"
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-lucide-minus"
        :title="t('ToolTips.Minimize')"
        :aria-label="t('ToolTips.Minimize')"
        @click="emit('minimize')"
      />
    </header>

    <div v-if="isBatch" class="max-h-80 space-y-2 overflow-y-auto">
      <div
        v-for="item in group.items"
        :key="item.id"
        class="flex items-start justify-between gap-3 rounded-lg border border-[var(--app-border)] p-3"
      >
        <div class="min-w-0 flex-1 overflow-hidden">
          <div class="truncate font-medium">{{ item.assetName }}</div>
          <div v-if="item.assignees" class="text-sm text-[var(--app-text-secondary)]">
            {{ t("AclDialog.Assignees", { value: item.assignees }) }}
            <UButton variant="link" size="xs" @click="copyTicketLink(item)">{{ t("Common.Copy") }}</UButton>
          </div>
          <AclErrorDetail v-if="item.detail" :detail="item.detail" />
        </div>
        <UBadge :color="statusColor(item.status)" variant="soft" class="shrink-0 whitespace-nowrap">
          {{ t(`AclDialog.Status.${item.status}`) }}
        </UBadge>
      </div>
    </div>
    <div v-else-if="group.items[0]?.assignees" class="text-sm text-[var(--app-text-secondary)]">
      {{ t("AclDialog.Assignees", { value: group.items[0].assignees }) }}
      <UButton variant="link" size="xs" @click="copyTicketLink(group.items[0])">{{ t("Common.Copy") }}</UButton>
    </div>
    <AclErrorDetail v-if="!isBatch && group.items[0]?.detail" :detail="group.items[0].detail" />

    <iframe
      v-if="group.faceUrl"
      :src="group.faceUrl"
      allow="camera"
      class="mt-4 h-[480px] w-full border-0"
      sandbox="allow-scripts allow-same-origin"
    />

    <footer class="mt-5 flex justify-end gap-2">
      <UButton color="neutral" variant="outline" :disabled="isBusy" @click="handleClose">
        {{ isActionable && (!group.submitted || hasPending) ? t("Common.Cancel") : t("ToolTips.Close") }}
      </UButton>
      <UButton v-if="isActionable && !group.submitted" :loading="isBusy" @click="submit(group)">
        {{ isBatch && isReview ? t("AclDialog.SubmitAll") : t("Common.Confirm") }}
      </UButton>
    </footer>
  </section>
</template>
