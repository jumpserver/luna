<script setup lang="ts">
import type { CodexRuntimeStatus, LocalCodexSettings } from "~/shared/codex/types";

defineProps<{ status: CodexRuntimeStatus | null; busy: boolean }>();
const emit = defineEmits<{ install: []; check: [] }>();
const runtime = defineModel<LocalCodexSettings["runtime"]>("runtime", { required: true });
const executable = defineModel<string>("executable", { required: true });
const { t } = useLocalAiMessages();
const sources = computed(() => [
  { label: t("managed"), value: "managed" },
  { label: t("system"), value: "system" }
]);
</script>

<template>
  <SettingsGroup :title="t('installation')" icon="i-lucide-download">
    <SettingsRow :title="t('engine')">
      <span class="text-sm text-highlighted">Codex</span>
    </SettingsRow>
    <SettingsRow
      :title="t('installation')"
      :description="runtime === 'managed' ? t('installHint') : t('executableHint')"
    >
      <USelect v-model="runtime" :items="sources" :disabled="busy" :aria-label="t('installation')" class="w-72" />
    </SettingsRow>
    <SettingsRow v-if="runtime === 'system'" :title="t('executable')" :description="t('executableHint')">
      <UInput v-model="executable" :disabled="busy" :aria-label="t('executable')" class="w-72" />
    </SettingsRow>
    <SettingsRow v-else :title="t('version')">
      <div class="flex flex-wrap items-center gap-3 text-sm">
        <span>{{ status?.version || "—" }}</span>
        <UBadge :color="status?.installed ? 'success' : 'neutral'" variant="subtle">
          {{ status?.installing ? t("installing") : status?.installed ? t("installed") : t("notInstalled") }}
        </UBadge>
        <UButton
          v-if="!status?.installed"
          :label="t('install')"
          icon="i-lucide-download"
          :loading="status?.installing"
          :disabled="busy"
          @click="emit('install')"
        />
      </div>
    </SettingsRow>
    <div v-if="runtime === 'managed' && status?.installing" class="px-4 py-3">
      <UProgress :model-value="status.progress" :aria-label="t('installing')" />
    </div>
    <div class="px-4 py-3">
      <UButton :label="t('check')" color="neutral" variant="outline" :disabled="busy" @click="emit('check')" />
    </div>
  </SettingsGroup>
</template>
