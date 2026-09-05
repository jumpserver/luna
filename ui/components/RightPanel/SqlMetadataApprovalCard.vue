<script setup lang="ts">
import type { ChenSqlMetadataApproval, ChenSqlMetadataApprovalDecision } from "~/chen/composables/useChenSqlAiSessions";
import { useNow } from "@vueuse/core";

const props = defineProps<{ approval: ChenSqlMetadataApproval; terminal?: boolean }>();
const emit = defineEmits<{
  resolve: [decision: ChenSqlMetadataApprovalDecision];
}>();
const now = useNow({ interval: 1000 });
const remainingSeconds = computed(() =>
  props.approval.expiresAt === undefined
    ? props.approval.expiresInSeconds
    : Math.max(0, Math.ceil((props.approval.expiresAt - now.value.getTime()) / 1000))
);
const expired = computed(() => props.approval.expiresAt !== undefined && remainingSeconds.value === 0);
const { t } = useI18n();

function metadataCategoryLabel(category: string) {
  const key = `RightPanel.SQLAIMetadataCategory.${category}`;
  const translated = t(key);
  return translated === key ? category : translated;
}
</script>

<template>
  <section class="overflow-hidden rounded-xl border border-warning/40 bg-warning/5">
    <header class="flex items-start gap-2 border-b border-warning/30 p-2.5">
      <span class="grid size-7 shrink-0 place-items-center rounded-lg bg-warning/15 text-warning">
        <UIcon name="i-lucide-database" class="size-4" />
      </span>
      <div class="min-w-0">
        <div class="text-xs font-semibold text-highlighted">
          {{ t("RightPanel.SQLAIMetadataApprovalTitle") }}
        </div>
        <p class="mt-0.5 text-[10px] leading-4 text-muted">
          {{ t(terminal ? "RightPanel.AIMetadataApprovalDescription" : "RightPanel.SQLAIMetadataApprovalDescription") }}
        </p>
      </div>
    </header>

    <div class="space-y-2 p-2.5 text-[11px]">
      <div v-if="approval.expandedScope" class="flex items-start gap-1.5 rounded-lg bg-warning/10 p-2 text-warning">
        <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-3.5 shrink-0" />
        <span>{{ t("RightPanel.SQLAIMetadataExpandedScope") }}</span>
      </div>

      <p class="rounded-lg bg-elevated/60 p-2 text-[10px] leading-4 text-muted">
        {{ t(terminal ? "RightPanel.AIMetadataInitialContextNotice" : "RightPanel.SQLAIMetadataInitialContextNotice") }}
      </p>

      <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1">
        <dt class="text-muted">{{ t("RightPanel.SQLAIMetadataDatabase") }}</dt>
        <dd class="break-all font-mono text-highlighted">{{ approval.database || "-" }}</dd>
        <template v-if="!terminal || approval.schema">
          <dt class="text-muted">{{ t("RightPanel.SQLAIMetadataSchema") }}</dt>
          <dd class="break-all font-mono text-highlighted">{{ approval.schema }}</dd>
        </template>
        <dt class="text-muted">{{ t("RightPanel.SQLAIMetadataExpires") }}</dt>
        <dd class="text-highlighted">
          {{
            expired
              ? t("RightPanel.AIStatusApprovalExpired")
              : t("RightPanel.SQLAIMetadataExpiresValue", { count: remainingSeconds })
          }}
        </dd>
      </dl>

      <div v-if="approval.tables.length" class="space-y-1">
        <div class="text-muted">{{ t("RightPanel.SQLAIMetadataTables") }}</div>
        <div class="flex flex-wrap gap-1">
          <UBadge
            v-for="table in approval.tables"
            :key="table"
            color="neutral"
            variant="subtle"
            size="xs"
            class="max-w-full font-mono"
          >
            <span class="truncate">{{ table }}</span>
          </UBadge>
        </div>
      </div>

      <div v-if="approval.discovery" class="space-y-1">
        <div class="text-muted">{{ t("RightPanel.SQLAIMetadataDiscovery") }}</div>
        <div class="rounded-md bg-elevated px-2 py-1.5 text-highlighted">
          {{ t("RightPanel.SQLAIMetadataDiscoveryValue") }}
        </div>
        <p class="text-[10px] text-warning">
          {{
            t("RightPanel.SQLAIMetadataDiscoveryLimit", {
              count: approval.maxMatches,
              followUp: approval.followUpTableLimit
            })
          }}
        </p>
      </div>

      <div v-else-if="approval.query" class="space-y-1">
        <div class="text-muted">{{ t("RightPanel.SQLAIMetadataSearch") }}</div>
        <code class="block break-all rounded-md bg-elevated px-2 py-1.5">{{ approval.query }}</code>
        <p class="text-[10px] text-warning">
          {{ t("RightPanel.SQLAIMetadataSearchLimit", { count: approval.maxMatches }) }}
        </p>
      </div>

      <div class="space-y-1">
        <div class="text-muted">{{ t("RightPanel.SQLAIMetadataFields") }}</div>
        <div class="flex flex-wrap gap-1">
          <UBadge
            v-for="category in approval.dataCategories"
            :key="category"
            color="neutral"
            variant="outline"
            size="xs"
          >
            {{ metadataCategoryLabel(category) }}
          </UBadge>
        </div>
      </div>

      <p class="rounded-lg bg-elevated/60 p-2 text-[10px] leading-4 text-muted">
        {{ t("RightPanel.SQLAIMetadataNoRows") }}
      </p>
    </div>

    <p v-if="expired" class="px-2.5 pb-2 text-[11px] text-warning">{{ t("RightPanel.AIApprovalExpired") }}</p>
    <div class="flex flex-wrap justify-end gap-1.5 border-t border-warning/30 p-2">
      <UButton
        size="xs"
        color="neutral"
        variant="soft"
        :disabled="approval.resolving || expired"
        :label="t('RightPanel.SQLAIMetadataReject')"
        @click="emit('resolve', 'reject')"
      />
      <UButton
        size="xs"
        color="primary"
        icon="i-lucide-check"
        :disabled="approval.resolving || expired"
        :label="t(terminal ? 'RightPanel.AIApprove' : 'RightPanel.SQLAIMetadataAllowOnce')"
        @click="emit('resolve', 'approve_once')"
      />
    </div>
  </section>
</template>
