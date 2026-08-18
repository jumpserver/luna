<script setup lang="ts">
import { sendKokoTerminalDataToMany } from "@jumpserver/koko";
import { useUserInfoStore } from "~/store/modules/userInfo";

const { t } = useI18n();
const { isMacOS } = usePlatform();
const toast = useToast();
const { tabs } = useWorkspaceTabs();
const { batchCommand } = useBatchCommandPanel();
const userInfoStore = useUserInfoStore();
const { loggedIn, currentUser } = storeToRefs(userInfoStore);
const commandExecutionEnabled = computed(() => currentUser.value?.commandExecutionEnabled === true);

const connectedTabs = computed(() =>
  tabs.value.filter((tab) => !["sftp", "k8s", "kubernetes"].includes(tab.protocol) && tab.status === "connected")
);
const canUseBatchCommand = computed(
  () => loggedIn.value || connectedTabs.value.some((tab) => tab.protocol === "local-shell")
);

const selectedTabIds = ref<string[]>([]);

watch(
  connectedTabs,
  (newTabs, oldTabs = []) => {
    const oldIds = new Set(oldTabs.map((tab) => tab.id));
    for (const tab of newTabs) {
      if (!oldIds.has(tab.id)) selectedTabIds.value.push(tab.id);
    }
    selectedTabIds.value = selectedTabIds.value.filter((id) => newTabs.some((tab) => tab.id === id));
  },
  { immediate: true }
);

const allSelected = computed(
  () => connectedTabs.value.length > 0 && connectedTabs.value.every((tab) => selectedTabIds.value.includes(tab.id))
);

const toggleAll = () => {
  if (allSelected.value) {
    selectedTabIds.value = [];
  } else {
    selectedTabIds.value = connectedTabs.value.map((tab) => tab.id);
  }
};

const toggleTab = (tabId: string) => {
  const index = selectedTabIds.value.indexOf(tabId);
  if (index >= 0) selectedTabIds.value.splice(index, 1);
  else selectedTabIds.value.push(tabId);
};

const sendLabel = computed(() =>
  selectedTabIds.value.length > 0
    ? t("RightPanel.BatchSendToCount", { count: selectedTabIds.value.length })
    : t("RightPanel.BatchSend")
);
const commandPlaceholder = computed(() =>
  t("RightPanel.BatchCommandPlaceholder", { shortcut: isMacOS.value ? "⌘+Enter" : "Ctrl+Enter" })
);

const sendCommand = () => {
  if (!commandExecutionEnabled.value) return;

  const command = batchCommand.value.trim();
  if (!command || selectedTabIds.value.length === 0) return;

  const total = selectedTabIds.value.length;
  const sent = sendKokoTerminalDataToMany(selectedTabIds.value, `${command}\r`);
  const failed = total - sent;
  toast.add({
    title: t("RightPanel.BatchCommandSendResult"),
    description: t("RightPanel.BatchCommandSendResultDesc", { sent, total, failed }),
    color: failed === 0 ? "success" : sent > 0 ? "warning" : "error",
    icon: failed === 0 ? "i-lucide-circle-check" : "i-lucide-circle-alert"
  });
};
</script>

<template>
  <div class="flex h-full min-h-0" @keydown.ctrl.enter.prevent="sendCommand" @keydown.meta.enter.prevent="sendCommand">
    <div
      v-if="!canUseBatchCommand"
      class="grid min-h-0 flex-1 place-items-center px-4 text-xs text-gray-500 dark:text-gray-400"
    >
      {{ t("Common.LoginFirst") }}
    </div>

    <template v-else>
      <!-- Left: command input -->
      <div class="min-h-0 min-w-0 flex-1" :style="{ borderRight: '1px solid var(--app-border)' }">
        <div class="relative h-full min-h-0 p-3">
          <label for="batch-command-input" class="sr-only">{{ t("RightPanel.BatchCommand") }}</label>
          <textarea
            id="batch-command-input"
            v-model="batchCommand"
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            class="h-full min-h-0 w-full resize-none rounded-md border px-2.5 py-2 pb-10 pr-44 font-ui-mono text-[12px] leading-relaxed outline-none focus:ring-1 focus:ring-primary-500/40"
            :style="{
              borderColor: 'var(--app-border)',
              backgroundColor: 'var(--app-main-bg)',
              color: 'var(--app-fg)'
            }"
            :placeholder="commandPlaceholder"
          />
          <UButton
            color="primary"
            variant="soft"
            size="xs"
            icon="i-lucide-send"
            class="absolute bottom-5 right-5"
            :label="sendLabel"
            :disabled="selectedTabIds.length === 0 || !batchCommand.trim()"
            @click="sendCommand"
          />
        </div>
      </div>

      <!-- Right: connected terminals -->
      <aside class="flex w-56 shrink-0 flex-col bg-black/[0.02] dark:bg-white/[0.02]">
        <div
          class="flex h-8 shrink-0 items-center justify-between px-2.5"
          :style="{ borderBottom: '1px solid var(--app-border)' }"
        >
          <span class="truncate text-[11px] font-medium text-gray-600 dark:text-gray-300">
            {{ t("RightPanel.BatchConnectedTabs") }}
            <span v-if="connectedTabs.length" class="font-ui-mono text-gray-400">({{ connectedTabs.length }})</span>
          </span>
          <button
            v-if="connectedTabs.length > 0"
            type="button"
            class="shrink-0 text-[10px] text-primary-500 hover:underline"
            :aria-pressed="allSelected"
            @click="toggleAll"
          >
            {{ allSelected ? t("RightPanel.BatchDeselectAll") : t("RightPanel.BatchSelectAll") }}
          </button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto py-1">
          <div
            v-if="connectedTabs.length === 0"
            class="grid h-full min-h-20 place-items-center px-3 text-center text-[11px] text-gray-400 dark:text-gray-500"
          >
            {{ t("RightPanel.BatchNoConnectedTabsDesc") }}
          </div>

          <button
            v-for="tab in connectedTabs"
            :key="tab.id"
            type="button"
            class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/8"
            :class="selectedTabIds.includes(tab.id) ? 'bg-black/4 dark:bg-white/6' : ''"
            :aria-pressed="selectedTabIds.includes(tab.id)"
            @click="toggleTab(tab.id)"
          >
            <div
              class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition-colors"
              :class="
                selectedTabIds.includes(tab.id)
                  ? 'border-primary-500 bg-primary-500 text-(--app-accent-foreground)'
                  : 'border-gray-300 dark:border-white/20'
              "
            >
              <UIcon v-if="selectedTabIds.includes(tab.id)" name="i-lucide-check" class="size-2" />
            </div>
            <div class="min-w-0 flex-1 leading-tight">
              <div class="flex min-w-0 items-center gap-1.5">
                <span class="min-w-0 flex-1 truncate text-[11px] font-medium text-gray-800 dark:text-gray-100">
                  {{ tab.assetName }}
                </span>
                <UBadge
                  :label="tab.protocol === 'local-shell' ? 'LOCAL' : tab.protocol.toUpperCase()"
                  :title="tab.protocol"
                  color="neutral"
                  variant="soft"
                  size="xs"
                  class="max-w-20 shrink-0 truncate font-ui-mono"
                />
              </div>
              <div v-if="tab.account || tab.address" class="truncate font-ui-mono text-[10px] text-gray-400">
                {{ tab.account }}@{{ tab.address }}
              </div>
            </div>
          </button>
        </div>
      </aside>
    </template>
  </div>
</template>
