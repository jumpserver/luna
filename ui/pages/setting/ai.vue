<script setup lang="ts">
import type { LocalAiCliId, LocalAiProviderConfig, LocalAiProviderId } from "~/composables/useLocalAiSettings";

import { LOCAL_AI_PROVIDER_DEFINITIONS } from "~/composables/useLocalAiSettings";

type CliStatus = "authenticated" | "unauthenticated" | "unknown" | "notInstalled";
type QuotaStatus = "available" | "unsupported" | "unavailable";

interface LocalAiCliInfo {
  id: string;
  name: string;
  installed: boolean;
  path?: string;
  version?: string;
  auth: {
    status: CliStatus;
    detail?: string;
  };
  quota: {
    status: QuotaStatus;
    usedPercent?: number;
    windowDurationMins?: number;
    resetsAt?: number;
    planType?: string;
    creditsBalance?: string;
    creditsUnlimited?: boolean;
    detail?: string;
  };
}

const CUSTOM_MODEL = "__custom__";

definePageMeta({
  layout: "setting"
});

const { t } = useI18n();
const toast = useToast();
const { settings, load, saveProvider, hasProviderApiKey, saveProviderApiKey, setActiveSource } = useLocalAiSettings();
const selectedSource = ref(`provider:${settings.value.selectedProvider}`);
const draftEndpoint = ref("");
const draftModel = ref("");
const draftApiKey = ref("");
const apiKeyConfigured = ref(false);
const loadingApiKeyStatus = ref(false);
const clis = ref<LocalAiCliInfo[]>([]);
const loadingClis = ref(false);
const saving = ref(false);
const changingActiveSource = ref(false);
const error = ref("");

const cliIcons: Record<string, string> = {
  codex: "i-lucide-bot",
  claude: "i-lucide-brain-circuit",
  grok: "i-lucide-orbit",
  kimi: "i-lucide-moon",
  deepseek: "i-lucide-waves"
};

const selectedProvider = computed(() => {
  if (!selectedSource.value.startsWith("provider:")) return null;
  const id = selectedSource.value.slice("provider:".length);
  return LOCAL_AI_PROVIDER_DEFINITIONS.find((provider) => provider.id === id) || null;
});

const selectedCli = computed(() => {
  if (!selectedSource.value.startsWith("cli:")) return null;
  return clis.value.find((cli) => cli.id === selectedSource.value.slice("cli:".length)) || null;
});

const modelItems = computed(() => {
  const items = (selectedProvider.value?.models || []).map((model) => ({ label: model, value: model }));
  items.push({ label: t("Setting.AiCustomModel"), value: CUSTOM_MODEL });
  return items;
});

const selectedModelOption = computed({
  get: () => {
    if (!selectedProvider.value) return CUSTOM_MODEL;
    return selectedProvider.value.models.includes(draftModel.value) ? draftModel.value : CUSTOM_MODEL;
  },
  set: (value: string) => {
    if (value === CUSTOM_MODEL) {
      if (selectedProvider.value?.models.includes(draftModel.value)) draftModel.value = "";
      return;
    }
    draftModel.value = value;
  }
});

const customModelSelected = computed(() => selectedModelOption.value === CUSTOM_MODEL);
const detectedCount = computed(() => clis.value.filter((cli) => cli.installed).length);
const selectedProviderEnabled = computed(
  () =>
    settings.value.activeSource?.type === "provider" && settings.value.activeSource.id === selectedProvider.value?.id
);
const selectedCliEnabled = computed(
  () => settings.value.activeSource?.type === "cli" && settings.value.activeSource.id === selectedCli.value?.id
);

const syncProviderDraft = (providerId: LocalAiProviderId) => {
  const config = settings.value.providers[providerId];
  draftEndpoint.value = config.endpoint;
  draftModel.value = config.model;
  draftApiKey.value = "";
};

const refreshProviderApiKeyStatus = async (providerId: LocalAiProviderId) => {
  loadingApiKeyStatus.value = true;
  try {
    apiKeyConfigured.value = await hasProviderApiKey(providerId);
  } catch (cause) {
    apiKeyConfigured.value = false;
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    loadingApiKeyStatus.value = false;
  }
};

const selectProvider = (providerId: LocalAiProviderId) => {
  selectedSource.value = `provider:${providerId}`;
  error.value = "";
  syncProviderDraft(providerId);
  void refreshProviderApiKeyStatus(providerId);
};

const selectCli = (cliId: string) => {
  selectedSource.value = `cli:${cliId}`;
  error.value = "";
};

const resetProviderDraft = () => {
  if (!selectedProvider.value) return;
  draftEndpoint.value = selectedProvider.value.defaultEndpoint;
  draftModel.value = selectedProvider.value.models[0] || "";
  error.value = "";
};

const validateProviderDraft = () => {
  if (!draftEndpoint.value.trim() || !draftModel.value.trim()) {
    return t("Setting.AiRequiredFields");
  }

  try {
    const endpoint = new URL(draftEndpoint.value.trim());
    if (!["http:", "https:"].includes(endpoint.protocol)) return t("Setting.AiInvalidEndpoint");
  } catch {
    return t("Setting.AiInvalidEndpoint");
  }
  return "";
};

const saveCurrentProvider = async () => {
  if (!selectedProvider.value) return;
  error.value = validateProviderDraft();
  if (error.value) return;

  saving.value = true;
  try {
    const config: LocalAiProviderConfig = {
      endpoint: draftEndpoint.value,
      model: draftModel.value
    };
    await saveProvider(selectedProvider.value.id, config);
    if (draftApiKey.value.trim()) {
      await saveProviderApiKey(selectedProvider.value.id, draftApiKey.value);
      draftApiKey.value = "";
      apiKeyConfigured.value = true;
    }
    toast.add({ title: t("Setting.AiSaveSuccess"), color: "success", icon: "i-lucide-check" });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    saving.value = false;
  }
};

const toggleCurrentProvider = async () => {
  if (!selectedProvider.value) return;
  const enabling = !selectedProviderEnabled.value;

  if (enabling) {
    error.value = validateProviderDraft();
    if (error.value) return;
  }

  changingActiveSource.value = true;
  error.value = "";
  try {
    if (enabling) {
      await saveProvider(selectedProvider.value.id, {
        endpoint: draftEndpoint.value,
        model: draftModel.value
      });
      if (draftApiKey.value.trim()) {
        await saveProviderApiKey(selectedProvider.value.id, draftApiKey.value);
        draftApiKey.value = "";
        apiKeyConfigured.value = true;
      }
    }

    await setActiveSource(enabling ? { type: "provider", id: selectedProvider.value.id } : null);
    toast.add({
      title: t(enabling ? "Setting.AiEnabledSuccess" : "Setting.AiDisabledSuccess", {
        provider: selectedProvider.value.name
      }),
      color: enabling ? "success" : "neutral",
      icon: enabling ? "i-lucide-circle-check" : "i-lucide-circle-minus"
    });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    changingActiveSource.value = false;
  }
};

const clearProviderApiKey = async () => {
  if (!selectedProvider.value) return;
  saving.value = true;
  error.value = "";
  try {
    await saveProviderApiKey(selectedProvider.value.id, null);
    draftApiKey.value = "";
    apiKeyConfigured.value = await hasProviderApiKey(selectedProvider.value.id);
    toast.add({ title: t("Setting.AiApiKeyRemoved"), color: "neutral", icon: "i-lucide-key-round" });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    saving.value = false;
  }
};

const toggleCurrentCli = async () => {
  if (!selectedCli.value?.installed) return;
  const enabling = !selectedCliEnabled.value;
  changingActiveSource.value = true;
  error.value = "";
  try {
    await setActiveSource(enabling ? { type: "cli", id: selectedCli.value.id as LocalAiCliId } : null);
    toast.add({
      title: t(enabling ? "Setting.AiEnabledSuccess" : "Setting.AiDisabledSuccess", {
        provider: selectedCli.value.name
      }),
      color: enabling ? "success" : "neutral",
      icon: enabling ? "i-lucide-circle-check" : "i-lucide-circle-minus"
    });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    changingActiveSource.value = false;
  }
};

const refreshClis = async () => {
  if (!isTauriRuntime() || loadingClis.value) return;
  loadingClis.value = true;
  try {
    const detectedClis = await useTauriCoreInvoke<LocalAiCliInfo[]>("list_local_ai_clis");
    clis.value = detectedClis;

    if (
      settings.value.activeSource?.type === "cli" &&
      !detectedClis.some((cli) => cli.id === settings.value.activeSource?.id && cli.installed)
    ) {
      await setActiveSource(null);
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    loadingClis.value = false;
  }
};

const authLabel = (status: CliStatus) => {
  const labels: Record<CliStatus, string> = {
    authenticated: t("Setting.AiSignedIn"),
    unauthenticated: t("Setting.AiSignedOut"),
    unknown: t("Setting.AiUnknown"),
    notInstalled: t("Setting.AiNotInstalled")
  };
  return labels[status];
};

const authColor = (status: CliStatus): "success" | "warning" | "neutral" => {
  if (status === "authenticated") return "success";
  if (status === "unauthenticated") return "warning";
  return "neutral";
};

const formatReset = (timestamp?: number) => {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(timestamp * 1000);
};

onMounted(async () => {
  if (!isTauriRuntime()) return;
  await load();
  await refreshClis();
  const activeSource = settings.value.activeSource;
  if (activeSource) {
    selectedSource.value = `${activeSource.type}:${activeSource.id}`;
  } else {
    selectedSource.value = `provider:${settings.value.selectedProvider}`;
  }
  if (selectedSource.value.startsWith("provider:")) {
    const providerId = selectedSource.value.slice("provider:".length) as LocalAiProviderId;
    syncProviderDraft(providerId);
    await refreshProviderApiKeyStatus(providerId);
  }
});
</script>

<template>
  <div
    v-if="isTauriRuntime()"
    class="grid min-h-[560px] overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-card)] md:grid-cols-[240px_minmax(0,1fr)]"
  >
    <aside class="border-b border-[var(--app-border)] bg-[var(--app-sidebar-bg)] md:border-b-0 md:border-r">
      <div class="px-4 pb-2 pt-4 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
        {{ t("Setting.AiDirectModels") }}
      </div>

      <nav class="space-y-1 px-2 pb-4" :aria-label="t('Setting.AiDirectModels')">
        <UButton
          v-for="provider in LOCAL_AI_PROVIDER_DEFINITIONS"
          :key="provider.id"
          :label="provider.name"
          :icon="provider.icon"
          color="neutral"
          variant="ghost"
          class="w-full justify-start rounded-md"
          :class="
            selectedSource === `provider:${provider.id}`
              ? 'bg-[var(--app-selected-soft)] text-highlighted'
              : 'text-muted'
          "
          @click="selectProvider(provider.id)"
        >
          <template #trailing>
            <UBadge
              v-if="settings.activeSource?.type === 'provider' && settings.activeSource.id === provider.id"
              :label="t('Setting.AiEnabled')"
              color="success"
              variant="soft"
              size="sm"
            />
          </template>
        </UButton>
      </nav>

      <div class="flex items-center justify-between border-t border-[var(--app-border)] px-4 pb-2 pt-4">
        <span class="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{{ t("Setting.AiLocalCli") }}</span>
        <span v-if="!loadingClis" class="text-[11px] text-muted">{{ detectedCount }}/{{ clis.length }}</span>
      </div>

      <div v-if="loadingClis" class="space-y-2 px-3 pb-4">
        <USkeleton v-for="index in 5" :key="index" class="h-9 w-full rounded-md" />
      </div>

      <nav v-else class="space-y-1 px-2 pb-3" :aria-label="t('Setting.AiLocalCli')">
        <button
          v-for="cli in clis"
          :key="cli.id"
          type="button"
          class="flex h-10 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-[var(--app-selected-soft)]"
          :class="selectedSource === `cli:${cli.id}` ? 'bg-[var(--app-selected-soft)] text-highlighted' : 'text-muted'"
          @click="selectCli(cli.id)"
        >
          <UIcon :name="cliIcons[cli.id] || 'i-lucide-terminal'" class="size-4 shrink-0" />
          <span class="min-w-0 flex-1 truncate">{{ cli.name }}</span>
          <UBadge
            :label="
              settings.activeSource?.type === 'cli' && settings.activeSource.id === cli.id
                ? t('Setting.AiEnabled')
                : cli.installed
                  ? t('Setting.AiDetected')
                  : t('Setting.AiNotInstalled')
            "
            :color="
              settings.activeSource?.type === 'cli' && settings.activeSource.id === cli.id ? 'success' : 'neutral'
            "
            variant="soft"
            size="sm"
            class="shrink-0"
          />
        </button>
      </nav>

      <div class="border-t border-[var(--app-border)] p-2">
        <UButton
          :label="t('Common.Refresh')"
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          size="xs"
          class="w-full justify-start"
          :loading="loadingClis"
          @click="refreshClis"
        />
      </div>
    </aside>

    <section v-if="selectedProvider" class="min-w-0 p-6">
      <div class="flex items-start justify-between gap-4 border-b border-[var(--app-border)] pb-5">
        <div>
          <div class="flex items-center gap-2">
            <UIcon :name="selectedProvider.icon" class="size-5 text-highlighted" />
            <h2 class="text-lg font-semibold text-highlighted">{{ selectedProvider.name }}</h2>
          </div>
          <p class="mt-1 text-sm text-muted">{{ t("Setting.AiProviderDescription") }}</p>
        </div>
        <div class="flex items-center gap-2">
          <UBadge
            :label="selectedProviderEnabled ? t('Setting.AiEnabled') : t('Setting.AiDisabled')"
            :color="selectedProviderEnabled ? 'success' : 'neutral'"
            variant="soft"
          />
          <UBadge :label="t('Setting.AiDirectApi')" color="neutral" variant="soft" />
        </div>
      </div>

      <div class="max-w-2xl divide-y divide-[var(--app-border)]">
        <div class="grid gap-3 py-5 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-start">
          <div>
            <p class="text-sm font-medium text-highlighted">{{ t("Setting.AiEndpoint") }}</p>
            <p class="mt-1 text-xs leading-5 text-muted">{{ t("Setting.AiEndpointDescription") }}</p>
          </div>
          <UInput v-model="draftEndpoint" icon="i-lucide-link" autocomplete="off" class="w-full" />
        </div>

        <div class="grid gap-3 py-5 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-start">
          <div>
            <p class="text-sm font-medium text-highlighted">{{ t("Setting.AiApiKey") }}</p>
            <p class="mt-1 text-xs leading-5 text-muted">{{ t("Setting.AiApiKeyDescription") }}</p>
          </div>
          <div class="flex items-center gap-2">
            <UInput
              v-model="draftApiKey"
              type="password"
              icon="i-lucide-key-round"
              autocomplete="new-password"
              :placeholder="
                apiKeyConfigured ? t('Setting.AiApiKeyConfiguredPlaceholder') : t('Setting.AiApiKeyPlaceholder')
              "
              :loading="loadingApiKeyStatus"
              class="min-w-0 flex-1"
            />
            <UButton
              v-if="apiKeyConfigured"
              :label="t('Setting.AiRemoveApiKey')"
              icon="i-lucide-trash-2"
              color="neutral"
              variant="ghost"
              :loading="saving"
              @click="clearProviderApiKey"
            />
          </div>
        </div>

        <div class="grid gap-3 py-5 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-start">
          <div>
            <p class="text-sm font-medium text-highlighted">{{ t("Setting.AiModel") }}</p>
            <p class="mt-1 text-xs leading-5 text-muted">{{ t("Setting.AiModelDescription") }}</p>
          </div>
          <div class="space-y-2">
            <USelect
              v-model="selectedModelOption"
              :items="modelItems"
              value-key="value"
              icon="i-lucide-box"
              class="w-full"
            />
            <UInput
              v-if="customModelSelected"
              v-model="draftModel"
              :placeholder="t('Setting.AiCustomModelPlaceholder')"
              icon="i-lucide-pencil-line"
              autocomplete="off"
              class="w-full"
            />
          </div>
        </div>
      </div>

      <UAlert
        v-if="error"
        color="error"
        variant="soft"
        icon="i-lucide-circle-alert"
        :description="error"
        class="mt-4 max-w-2xl"
      />

      <div class="mt-6 flex items-center gap-2 border-t border-[var(--app-border)] pt-4">
        <UButton
          :label="selectedProviderEnabled ? t('Setting.AiDisable') : t('Setting.AiEnable')"
          :icon="selectedProviderEnabled ? 'i-lucide-power-off' : 'i-lucide-power'"
          :color="selectedProviderEnabled ? 'neutral' : 'success'"
          :variant="selectedProviderEnabled ? 'soft' : 'solid'"
          :loading="changingActiveSource"
          @click="toggleCurrentProvider"
        />
        <UButton :label="t('Common.Save')" icon="i-lucide-save" :loading="saving" @click="saveCurrentProvider" />
        <UButton
          :label="t('Setting.Default')"
          icon="i-lucide-rotate-ccw"
          color="neutral"
          variant="ghost"
          @click="resetProviderDraft"
        />
      </div>
    </section>

    <section v-else-if="selectedCli" class="min-w-0 p-6">
      <div class="flex items-start justify-between gap-4 border-b border-[var(--app-border)] pb-5">
        <div class="flex items-center gap-3">
          <UIcon :name="cliIcons[selectedCli.id] || 'i-lucide-terminal'" class="size-5 text-highlighted" />
          <div>
            <h2 class="text-lg font-semibold text-highlighted">{{ selectedCli.name }}</h2>
            <p class="mt-1 text-sm text-muted">{{ t("Setting.AiCliStatusOnly") }}</p>
          </div>
        </div>
        <UBadge
          :label="
            selectedCliEnabled
              ? t('Setting.AiEnabled')
              : selectedCli.installed
                ? t('Setting.AiDetected')
                : t('Setting.AiNotInstalled')
          "
          :color="selectedCliEnabled ? 'success' : 'neutral'"
          variant="soft"
        />
      </div>

      <dl class="max-w-2xl divide-y divide-[var(--app-border)] text-sm">
        <div class="grid grid-cols-[150px_minmax(0,1fr)] gap-4 py-4">
          <dt class="text-muted">{{ t("Common.Version") }}</dt>
          <dd class="text-highlighted">{{ selectedCli.version || "—" }}</dd>
        </div>
        <div class="grid grid-cols-[150px_minmax(0,1fr)] gap-4 py-4">
          <dt class="text-muted">{{ t("Setting.AiExecutablePath") }}</dt>
          <dd class="break-all font-mono text-xs text-highlighted">{{ selectedCli.path || "—" }}</dd>
        </div>
        <div class="grid grid-cols-[150px_minmax(0,1fr)] gap-4 py-4">
          <dt class="text-muted">{{ t("Setting.AiAuthentication") }}</dt>
          <dd class="flex flex-wrap items-center gap-2">
            <UBadge
              :label="authLabel(selectedCli.auth.status)"
              :color="authColor(selectedCli.auth.status)"
              variant="soft"
            />
            <span v-if="selectedCli.auth.detail" class="text-xs text-muted">{{ selectedCli.auth.detail }}</span>
          </dd>
        </div>
        <div class="grid grid-cols-[150px_minmax(0,1fr)] gap-4 py-4">
          <dt class="text-muted">{{ t("Setting.AiQuota") }}</dt>
          <dd v-if="selectedCli.quota.status === 'available'" class="space-y-2">
            <div class="flex items-center justify-between gap-4">
              <span class="text-highlighted">{{ selectedCli.quota.usedPercent ?? 0 }}% {{ t("Setting.AiUsed") }}</span>
              <span v-if="selectedCli.quota.planType" class="text-xs uppercase text-muted">
                {{ selectedCli.quota.planType }}
              </span>
            </div>
            <UProgress :model-value="selectedCli.quota.usedPercent || 0" size="xs" />
            <p class="text-xs text-muted">
              {{ t("Setting.AiResetsAt", { time: formatReset(selectedCli.quota.resetsAt) }) }}
            </p>
          </dd>
          <dd v-else class="text-muted">
            {{
              selectedCli.quota.status === "unsupported"
                ? t("Setting.AiQuotaUnsupported")
                : t("Setting.AiQuotaUnavailable")
            }}
          </dd>
        </div>
      </dl>

      <UAlert
        v-if="error"
        color="error"
        variant="soft"
        icon="i-lucide-circle-alert"
        :description="error"
        class="mt-4 max-w-2xl"
      />

      <div class="mt-6 border-t border-[var(--app-border)] pt-4">
        <UButton
          :label="selectedCliEnabled ? t('Setting.AiDisable') : t('Setting.AiEnable')"
          :icon="selectedCliEnabled ? 'i-lucide-power-off' : 'i-lucide-power'"
          :color="selectedCliEnabled ? 'neutral' : 'success'"
          :variant="selectedCliEnabled ? 'soft' : 'solid'"
          :disabled="!selectedCli.installed"
          :loading="changingActiveSource"
          @click="toggleCurrentCli"
        />
      </div>
    </section>
  </div>

  <UAlert
    v-else
    icon="i-lucide-monitor"
    color="neutral"
    variant="soft"
    :title="t('Setting.AiDesktopOnly')"
    :description="t('Setting.AiDesktopOnlyDescription')"
  />
</template>
