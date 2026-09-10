<script setup lang="ts">
import type { ConfigItem } from "~/types";
import { desktopDialog } from "~/shared/desktop/bridge";

const { t } = useI18n();
const toast = useToast();
const { appConfig } = useSettingManager();
const { selectClient, saveCustomTerminal, uninstallPlugin } = useApplicationConfig();

const terminalModalOpen = ref(false);
const saving = ref(false);
const editingPluginId = ref("");
const deleteModalOpen = ref(false);
const deleting = ref(false);
const terminalToDelete = ref<ConfigItem | null>(null);
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

const isSelected = (item: ConfigItem) => (item.enabled_protocols || item.match_first)?.includes("ssh");

const isCustomTerminal = (item: ConfigItem) =>
  isDesktopRuntime() && item.builtin === false && item.plugin_id?.startsWith("custom.terminal.");

const openTerminalForm = (item?: ConfigItem) => {
  editingPluginId.value = item?.plugin_id || "";
  customTerminalName.value = item?.display_name || "";
  customTerminalPath.value = item?.path || "";
  customTerminalTemplate.value = item?.arg_format ?? "-e {helper} {protocol} {username}@{host} -p {port} -P {value}";
  terminalModalOpen.value = true;
};

const confirmDeleteTerminal = (item: ConfigItem) => {
  terminalToDelete.value = item;
  deleteModalOpen.value = true;
};

const deleteTerminal = async () => {
  if (deleting.value || !terminalToDelete.value?.plugin_id) return;
  deleting.value = true;
  try {
    await uninstallPlugin(terminalToDelete.value.plugin_id);
    deleteModalOpen.value = false;
    terminalToDelete.value = null;
  } catch {
    // The composable displays the error; keep the confirmation open for a retry.
  } finally {
    deleting.value = false;
  }
};

const selectCustomTerminalPath = async () => {
  const selected = (await desktopDialog.open({
    multiple: false
  })) as string | null;

  if (selected) {
    customTerminalPath.value = selected;
  }
};

const handleToggle = async (item: ConfigItem, enabled: boolean, makeDefault = false) => {
  await selectClient("terminal", "ssh", item.name, enabled, item.plugin_id, undefined, makeDefault);
  await selectClient("terminal", "telnet", item.name, enabled, item.plugin_id, undefined, makeDefault);
};

const saveTerminal = async () => {
  if (saving.value) return;
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

  saving.value = true;
  try {
    await saveCustomTerminal(
      customTerminalName.value.trim(),
      customTerminalPath.value.trim(),
      customTerminalTemplate.value.trim(),
      editingPluginId.value || undefined
    );
    terminalModalOpen.value = false;
  } catch {
    // The composable displays the error; preserve the form so the user can retry.
  } finally {
    saving.value = false;
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
        @make-default="handleToggle(item, true, true)"
      >
        <template v-if="isCustomTerminal(item)" #actions>
          <UButton
            color="neutral"
            variant="ghost"
            size="xs"
            icon="i-lucide-pencil"
            :label="t('ContextMenu.Edit')"
            @click="openTerminalForm(item)"
          />
          <UButton
            color="error"
            variant="ghost"
            size="xs"
            icon="i-lucide-trash-2"
            :label="t('Common.Remove')"
            @click="confirmDeleteTerminal(item)"
          />
        </template>
      </SettingItems>
    </template>

    <UEmpty v-else icon="i-lucide-monitor" size="sm" variant="naked" :title="t('Common.NoData')" />

    <SettingsGroup
      v-if="isDesktopRuntime()"
      :divided="false"
      padded
      body-class="flex flex-wrap items-center justify-between gap-3"
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
        @click="openTerminalForm()"
      />
    </SettingsGroup>

    <UModal
      v-model:open="terminalModalOpen"
      :title="t(editingPluginId ? 'Setting.EditCustomTerminal' : 'Setting.AddCustomTerminal')"
      :dismissible="!saving"
      :close="!saving"
      :ui="{ content: 'max-w-2xl' }"
    >
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
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="saving"
            :label="t('Common.Cancel')"
            @click="terminalModalOpen = false"
          />
          <UButton color="primary" :loading="saving" :label="t('Common.Save')" @click="saveTerminal" />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="deleteModalOpen"
      :title="t('Setting.DeleteCustomTerminal')"
      :description="t('Setting.DeleteCustomTerminalConfirm', { name: terminalToDelete?.display_name || '' })"
      :dismissible="!deleting"
      :close="!deleting"
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="deleting"
            :label="t('Common.Cancel')"
            @click="deleteModalOpen = false"
          />
          <UButton color="error" :loading="deleting" :label="t('Common.Remove')" @click="deleteTerminal" />
        </div>
      </template>
    </UModal>
  </div>
</template>
