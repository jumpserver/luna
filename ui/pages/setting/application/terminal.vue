<script setup lang="ts">
import type { ConfigItem } from "~/types";
import { desktopDialog } from "~/shared/desktop/bridge";

definePageMeta({
  layout: "setting"
});

const { t } = useI18n();
const toast = useToast();
const { appConfig } = useSettingManager();
const { selectClient, createCustomTerminal } = useApplicationConfig();

const createModalOpen = ref(false);
const creating = ref(false);
const customTerminalName = ref("");
const customTerminalPath = ref("");
const customTerminalTemplate = ref("-e {helper} {protocol} {username}@{host} -p {port} -P {value}");

const terminalItems = computed<ConfigItem[]>(() => {
  const list = appConfig.value?.terminal ?? [];
  const seen = new Set<string>();

  return list.filter((item) => {
    if (!item.use_ssh_helper) return false;
    const key = item.plugin_id || item.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
});

const selectedPluginId = computed(() => {
  const sshSelected = terminalItems.value.find((item) => (item.enabled_protocols || item.match_first)?.includes("ssh"));
  return sshSelected?.plugin_id || sshSelected?.name || "";
});

const isSelected = (item: ConfigItem) => {
  const key = item.plugin_id || item.name;
  return key === selectedPluginId.value;
};

const resetCustomTerminalForm = () => {
  customTerminalName.value = "";
  customTerminalPath.value = "";
  customTerminalTemplate.value = "-e {helper} {protocol} {username}@{host} -p {port} -P {value}";
};

const selectCustomTerminalPath = async () => {
  const selected = (await desktopDialog.open({
    multiple: false
  })) as string | null;

  if (selected) {
    customTerminalPath.value = selected;
  }
};

const handleToggle = async (item: ConfigItem, enabled: boolean) => {
  if (!enabled) {
    return;
  }

  await selectClient("terminal", "ssh", item.name, true, item.plugin_id);
  await selectClient("terminal", "telnet", item.name, true, item.plugin_id);
};

const createTerminal = async () => {
  if (!customTerminalName.value.trim() || !customTerminalPath.value.trim() || !customTerminalTemplate.value.trim()) {
    toast.add({
      title: t("Setting.CustomTerminalMissingFields"),
      color: "warning",
      icon: "i-lucide-triangle-alert",
      progress: false,
      duration: 1800
    });
    return;
  }

  creating.value = true;
  try {
    await createCustomTerminal(
      customTerminalName.value.trim(),
      customTerminalPath.value.trim(),
      customTerminalTemplate.value.trim()
    );
    createModalOpen.value = false;
    resetCustomTerminalForm();
  } finally {
    creating.value = false;
  }
};
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="px-1">
      <p class="text-sm font-medium text-highlighted">{{ t("Setting.TerminalSettings") }}</p>
      <p class="mt-1 text-xs text-muted">{{ t("Setting.TerminalProgramDescription") }}</p>
    </div>

    <template v-if="terminalItems.length">
      <SettingItems
        v-for="item in terminalItems"
        :key="item.plugin_id || item.name"
        :item="item"
        protocol="ssh"
        :selected="isSelected(item)"
        @toggle="(enabled) => handleToggle(item, enabled)"
      />
    </template>

    <UEmpty v-else icon="i-lucide-monitor" size="sm" variant="naked" :title="t('Common.NoData')" />

    <UCard
      variant="outline"
      :ui="{
        root: 'rounded-lg bg-[var(--app-surface-card)] ring-[var(--app-border)]',
        body: 'flex flex-wrap items-center justify-between gap-3'
      }"
    >
      <div class="min-w-0">
        <p class="text-sm font-medium text-highlighted">{{ t("Setting.CustomTerminal") }}</p>
        <p class="mt-1 text-xs text-muted">{{ t("Setting.CustomTerminalDescription") }}</p>
      </div>

      <UButton
        color="neutral"
        variant="soft"
        icon="i-lucide-plus"
        :label="t('Setting.AddCustomTerminal')"
        @click="createModalOpen = true"
      />
    </UCard>

    <UModal v-model:open="createModalOpen" :title="t('Setting.AddCustomTerminal')" :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <div class="flex flex-col gap-4">
          <UFormField :label="t('Setting.CustomTerminalName')" required>
            <UInput v-model="customTerminalName" :placeholder="t('Setting.CustomTerminalNamePlaceholder')" />
          </UFormField>

          <UFormField :label="t('Setting.CustomTerminalPath')" required>
            <div class="flex gap-2">
              <UInput
                v-model="customTerminalPath"
                class="flex-1"
                :placeholder="t('Setting.CustomTerminalPathPlaceholder')"
              />
              <UButton
                color="neutral"
                variant="outline"
                :label="t('Setting.SelectPath')"
                @click="selectCustomTerminalPath"
              />
            </div>
          </UFormField>

          <UFormField
            :label="t('Setting.CustomTerminalTemplate')"
            :help="t('Setting.CustomTerminalTemplateHelp')"
            required
          >
            <UTextarea
              v-model="customTerminalTemplate"
              :rows="4"
              :placeholder="t('Setting.CustomTerminalTemplatePlaceholder')"
            />
          </UFormField>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('Common.Cancel')" @click="createModalOpen = false" />
          <UButton color="primary" :loading="creating" :label="t('Common.Save')" @click="createTerminal" />
        </div>
      </template>
    </UModal>
  </div>
</template>
