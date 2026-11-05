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
        :label="t(transaction.manual ? 'Chen.Transaction.Manual' : 'Chen.Transaction.Auto')"
        :aria-pressed="transaction.manual"
        size="sm"
        color="neutral"
        variant="soft"
        :disabled="disabled || transaction.state === 'unknown'"
        @click="toggle"
      >
        <template #leading="{ ui }">
          <!-- Pictogrammers MDI: database-clock-outline / database-check-outline (Apache-2.0). -->
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            data-slot="leadingIcon"
            :class="ui.leadingIcon({ class: transaction.manual ? 'text-warning' : 'text-muted' })"
          >
            <path
              v-if="transaction.manual"
              d="M16.5 16.25L19.36 17.94L18.61 19.16L15 17V12H16.5V16.25M23 16C23 19.87 19.87 23 16 23C13.61 23 11.5 21.8 10.25 20C6.19 19.79 3 18.08 3 16V6C3 3.79 6.58 2 11 2S19 3.79 19 6V9.68C21.36 10.81 23 13.21 23 16M17 9.08V8.64C16.77 8.77 16.5 8.9 16.24 9C16.5 9 16.75 9.04 17 9.08M5 6C5 6.5 7.13 8 11 8S17 6.5 17 6 14.87 4 11 4 5 5.5 5 6M5 11.45C6.07 12.23 7.8 12.76 9.72 12.93C10.33 11.67 11.32 10.62 12.54 9.92C12.04 9.97 11.53 10 11 10C8.61 10 6.47 9.47 5 8.64V11.45M9.26 17.87C9.1 17.27 9 16.65 9 16C9 15.61 9.04 15.23 9.1 14.86C7.56 14.69 6.15 14.33 5 13.77V16C5 16.42 6.5 17.5 9.26 17.87M21 16C21 13.24 18.76 11 16 11S11 13.24 11 16 13.24 21 16 21 21 18.76 21 16Z"
            />
            <path
              v-else
              d="M20 13.09V7C20 4.79 16.42 3 12 3S4 4.79 4 7V17C4 19.21 7.59 21 12 21C12.46 21 12.9 21 13.33 20.94C13.12 20.33 13 19.68 13 19L13 18.95C12.68 19 12.35 19 12 19C8.13 19 6 17.5 6 17V14.77C7.61 15.55 9.72 16 12 16C12.65 16 13.27 15.96 13.88 15.89C14.93 14.16 16.83 13 19 13C19.34 13 19.67 13.04 20 13.09M18 12.45C16.7 13.4 14.42 14 12 14S7.3 13.4 6 12.45V9.64C7.47 10.47 9.61 11 12 11S16.53 10.47 18 9.64V12.45M12 9C8.13 9 6 7.5 6 7S8.13 5 12 5 18 6.5 18 7 15.87 9 12 9M22.5 17.25L17.75 22L15 19L16.16 17.84L17.75 19.43L21.34 15.84L22.5 17.25Z"
            />
          </svg>
        </template>
      </UButton>
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
