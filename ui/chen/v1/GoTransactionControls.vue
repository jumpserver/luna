<script setup lang="ts">
import type { GoTransaction, GoTransactionRequest } from "./api";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps<{ transaction?: GoTransaction; disabled: boolean }>();
const emit = defineEmits<{ action: [request: GoTransactionRequest] }>();
const { t } = useI18n();
const transactionActions = [
  { action: "commit", icon: "i-lucide-check", label: "Chen.Transaction.Commit" },
  { action: "rollback", icon: "i-lucide-undo-2", label: "Chen.Transaction.Rollback" }
] as const;
const pending = computed(() => props.transaction?.state === "active");
const switching = ref<number | null>(null);
function action(action: GoTransactionRequest["action"], onPending?: "commit" | "rollback") {
  if (props.disabled || !props.transaction || props.transaction.state === "unknown") return;
  if (switching.value !== null && switching.value !== props.transaction.revision) return;
  switching.value = null;
  emit("action", { action, onPending, revision: props.transaction.revision });
}
function toggle() {
  if (props.disabled) return;
  if (!props.transaction?.manual) action("manual");
  else if (pending.value) switching.value = props.transaction.revision;
  else action("auto");
}
watch(
  () => props.transaction?.revision,
  () => {
    switching.value = null;
  }
);
</script>

<template>
  <div v-if="transaction?.supported" class="flex shrink-0 items-center gap-1.5" data-chen-transaction>
    <UTooltip :text="t(transaction.manual ? 'Chen.Transaction.DisableHint' : 'Chen.Transaction.EnableHint')">
      <UButton
        :icon="transaction.manual ? 'i-lucide-shield-alert' : 'i-lucide-shield-check'"
        :label="t(transaction.manual ? 'Chen.Transaction.Manual' : 'Chen.Transaction.Auto')"
        :aria-pressed="transaction.manual"
        :ui="{ leadingIcon: transaction.manual ? 'text-warning' : 'text-muted' }"
        size="sm"
        color="neutral"
        variant="soft"
        :disabled="disabled || transaction.state === 'unknown'"
        @click="toggle"
      />
    </UTooltip>
    <template v-if="transaction.manual">
      <UTooltip v-for="item in transactionActions" :key="item.action" :text="t(item.label)">
        <UButton
          :icon="item.icon"
          :aria-label="t(item.label)"
          size="sm"
          color="neutral"
          variant="ghost"
          class="text-muted enabled:hover:bg-(--app-hover-soft) enabled:hover:text-highlighted enabled:active:bg-(--app-hover-strong) disabled:opacity-50"
          :disabled="disabled || !pending"
          @click="action(item.action)"
        />
      </UTooltip>
    </template>
    <UModal
      :open="switching !== null"
      :title="t('Chen.Transaction.SwitchTitle')"
      :description="t('Chen.Transaction.SwitchDescription')"
      :ui="{ content: 'sm:max-w-md' }"
      @update:open="
        (value) => {
          if (!value) switching = null;
        }
      "
    >
      <template #footer>
        <div class="flex w-full flex-wrap items-center justify-end gap-2">
          <UButton
            class="mr-auto"
            color="neutral"
            variant="ghost"
            :label="t('Common.Cancel')"
            autofocus
            @click="switching = null"
          />
          <UButton
            color="neutral"
            variant="outline"
            :label="t('Chen.Transaction.RollbackAndSwitch')"
            :disabled="disabled"
            @click="action('auto', 'rollback')"
          />
          <UButton
            :label="t('Chen.Transaction.CommitAndSwitch')"
            :disabled="disabled"
            @click="action('auto', 'commit')"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
