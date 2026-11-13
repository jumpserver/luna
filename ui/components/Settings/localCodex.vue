<script setup lang="ts">
import Connection from "~/components/Settings/localCodex/Connection.vue";
import Installation from "~/components/Settings/localCodex/Installation.vue";
import { useLocalAiMessages, useLocalCodex } from "~/composables/useLocalCodex";
import { useLocalCodexModels } from "~/composables/useLocalCodexModels";
import { serverWorkspaceAiEnabled } from "~/shared/aiAvailability";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { isDesktopRuntime } from "~/utils/runtime";

const { t } = useLocalAiMessages();
const user = useUserInfoStore();
const codex = useLocalCodex();
const draft = reactive({ ...codex.settings.value });
const hasSavedKey = computed(
  () => draft.hasApiKey && draft.baseUrl.trim().replace(/\/+$/, "") === codex.settings.value.baseUrl
);
const apiKey = shallowRef("");
const clearApiKey = shallowRef(false);
const modelSettings = computed(() => {
  if (!isDesktopRuntime() || !user.loggedIn || !serverWorkspaceAiEnabled.value) return null;
  if (draft.connection === "api") {
    if (!draft.baseUrl.trim() || (!apiKey.value.trim() && (!hasSavedKey.value || clearApiKey.value))) return null;
    try {
      const url = new URL(draft.baseUrl);
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
        return null;
    } catch {
      return null;
    }
  } else if (draft.runtime === "managed" && !codex.runtime.value?.installed) return null;
  return {
    enabled: false,
    model: "",
    reasoningEffort: "",
    runtime: draft.runtime,
    executable: draft.executable,
    connection: draft.connection,
    baseUrl: draft.baseUrl,
    hasApiKey: hasSavedKey.value,
    apiKey: apiKey.value,
    clearApiKey: clearApiKey.value
  };
});
const modelList = useLocalCodexModels(() => modelSettings.value, codex.models);
watch(codex.settings, (value) => {
  Object.assign(draft, value);
  apiKey.value = "";
  clearApiKey.value = false;
});
const busy = shallowRef(false);
const disabled = computed(
  () => !serverWorkspaceAiEnabled.value || busy.value || codex.runtime.value?.installing === true
);
const notice = shallowRef("");
const error = shallowRef("");
async function run(action: "save" | "check" | "install" | "test") {
  if (!serverWorkspaceAiEnabled.value) return;
  busy.value = true;
  notice.value = "";
  error.value = "";
  try {
    const settings = { ...draft, apiKey: apiKey.value, clearApiKey: clearApiKey.value };
    if (action === "check") notice.value = (await codex.probe(settings)).version;
    else if (action === "install") {
      await codex.install();
      notice.value = t("installed");
    } else if (action === "test") {
      await codex.test(settings);
      notice.value = t("connected");
    } else {
      await codex.save(settings);
      apiKey.value = "";
      clearApiKey.value = false;
      notice.value = t("saved");
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t("failed");
  } finally {
    busy.value = false;
  }
}
onMounted(() => {
  void codex.refreshRuntime().catch((cause) => {
    error.value = cause instanceof Error ? cause.message : t("failed");
  });
});
</script>

<template>
  <div v-if="isDesktopRuntime() && user.loggedIn" class="space-y-4">
    <UAlert v-if="!serverWorkspaceAiEnabled" color="warning" :title="t('enterpriseDisabled')" />
    <SettingsGroup>
      <SettingsRow :title="t('enabled')" :description="t('enabledHint')">
        <USwitch v-model="draft.enabled" :disabled="disabled" :aria-label="t('enabled')" />
      </SettingsRow>
    </SettingsGroup>
    <Installation
      v-model:runtime="draft.runtime"
      v-model:executable="draft.executable"
      :status="codex.runtime.value"
      :busy="disabled"
      @install="run('install')"
      @check="run('check')"
    />
    <Connection
      v-model:connection="draft.connection"
      v-model:base-url="draft.baseUrl"
      v-model:model="draft.model"
      v-model:reasoning-effort="draft.reasoningEffort"
      v-model:api-key="apiKey"
      v-model:clear-api-key="clearApiKey"
      :has-api-key="hasSavedKey"
      :busy="disabled"
      :models="modelList.models.value"
      :models-loading="modelList.loading.value"
      :models-error="modelList.error.value"
      :models-ready="Boolean(modelSettings)"
      @refresh-models="modelList.refresh"
    />
    <div class="space-y-2 text-xs text-muted">
      <p>{{ t("reset") }}</p>
      <p>{{ t("testHint") }}</p>
      <p v-if="error" role="alert" class="text-error">{{ error }}</p>
      <p v-else-if="notice" role="status">{{ notice }}</p>
      <div class="flex gap-2">
        <UButton :label="t('save')" :loading="busy" :disabled="disabled" @click="run('save')" />
        <UButton :label="t('test')" color="neutral" variant="outline" :disabled="disabled" @click="run('test')" />
      </div>
    </div>
  </div>
</template>
