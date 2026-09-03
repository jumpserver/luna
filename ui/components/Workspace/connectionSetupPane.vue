<script setup lang="ts">
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import type { AssetItem, AssetPageType } from "~/types/index";

import ConnectFormFields from "~/components/ConnectForm/fields.vue";
import {
  isExternalClientConnectMethod,
  parseLocalApplicationConnectMethod,
  useConnectMethods
} from "~/composables/useConnectMethods";

const props = withDefaults(
  defineProps<{
    tab: WorkspaceSessionTab;
    assetType?: AssetPageType;
  }>(),
  {
    assetType: "assets"
  }
);

const { t } = useI18n();
const { modernIsland } = useSettingManager();
const { confirmConnection } = useAssetConnection();
const { getMethodsForProtocol } = useConnectMethods();
const { closePane, startSessionConnection } = useWorkspaceTabs();
const { buildConnectionInfo, draft, initDraft, loadAssetDetails, preferredConnectMethod } = useConnectionFormState();

const currentAsset = ref<AssetItem | null>(props.tab.setupAsset || null);
const loading = ref(false);
const connecting = ref(false);
const connectionError = ref("");
const launchedClientName = ref("");
const launchedProtocol = ref("");
const launchSuccessVisible = ref(false);
const externalClientLaunch = ref(false);

const assetName = computed(() => props.tab.assetName || currentAsset.value?.name || "");
const assetAddress = computed(
  () => currentAsset.value?.address || props.tab.address || assetName.value || t("ContextMenu.Connect")
);
const launchSummary = computed(() => {
  return launchedClientName.value
    ? t("ConnectionSetup.LaunchWithClient", {
        client: launchedClientName.value
      })
    : t("ConnectionSetup.LaunchWithLocalClient");
});
const launchHint = computed(() => t("ConnectionSetup.LaunchHint"));

const updateExternalLaunchState = async () => {
  const protocol = draft.value.protocol.trim();
  const connectMethod = draft.value.connectMethod.trim();

  if (!protocol || !connectMethod) {
    externalClientLaunch.value = false;
    return;
  }

  try {
    const methods = await getMethodsForProtocol(protocol);
    if (protocol !== draft.value.protocol.trim() || connectMethod !== draft.value.connectMethod.trim()) return;
    externalClientLaunch.value = isExternalClientConnectMethod(connectMethod, methods);
  } catch {
    externalClientLaunch.value = Boolean(parseLocalApplicationConnectMethod(connectMethod).clientName);
  }
};

watch(
  () => [draft.value.protocol, draft.value.connectMethod] as const,
  () => {
    void updateExternalLaunchState();
  },
  { immediate: true }
);

const resetLaunchSuccessState = () => {
  launchSuccessVisible.value = false;
  launchedClientName.value = "";
  launchedProtocol.value = "";
};

async function loadAsset() {
  const asset = currentAsset.value || props.tab.setupAsset;
  if (!asset) return;

  loading.value = true;
  try {
    currentAsset.value = await loadAssetDetails(asset);
    initDraft(currentAsset.value, props.tab.protocol);
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (!currentAsset.value || connecting.value) return;

  const info = buildConnectionInfo(currentAsset.value);
  if (!info.protocol || !info.connectMethod) {
    connectionError.value = t("ConnectError.ConnectFailed");
    connecting.value = false;
    return;
  }
  const localApplication = parseLocalApplicationConnectMethod(info.connectMethod);
  const showLaunchSuccessState = externalClientLaunch.value;
  connecting.value = true;
  connectionError.value = "";
  if (!showLaunchSuccessState) {
    startSessionConnection(props.tab.id, {
      protocol: info.protocol,
      account: info.account
    });
  } else {
    resetLaunchSuccessState();
  }
  try {
    await confirmConnection(currentAsset.value, {
      ...info,
      tabId: props.tab.id,
      onSessionReady: showLaunchSuccessState
        ? () => {
            connecting.value = false;
            launchSuccessVisible.value = true;
            launchedClientName.value = localApplication.clientName || "";
            launchedProtocol.value = info.protocol;
          }
        : undefined,
      onSessionError: (error) => {
        connecting.value = false;
        connectionError.value =
          error instanceof Error ? error.message : String(error || t("ConnectError.ConnectFailed"));
      }
    });
    if (showLaunchSuccessState) {
      connecting.value = false;
      launchSuccessVisible.value = true;
      launchedClientName.value = localApplication.clientName || "";
      launchedProtocol.value = info.protocol;
    }
  } catch (error) {
    connecting.value = false;
    connectionError.value = error instanceof Error ? error.message : String(error || t("ConnectError.ConnectFailed"));
  }
}

watch(
  () => props.tab.status,
  (status) => {
    if (status === "failed") {
      connecting.value = false;
      if (!connectionError.value) connectionError.value = t("ConnectError.ConnectFailed");
    }
  }
);

const closing = ref(false);
const dialogVisible = computed(() => {
  if (modernIsland.value) return loading.value || !!currentAsset.value;
  return !loading.value && !!currentAsset.value;
});

const requestClose = () => {
  if (!modernIsland.value) {
    closePane(props.tab.id);
    return;
  }
  if (closing.value) return;
  closing.value = true;
};

const onStageTransitionEnd = (event: TransitionEvent) => {
  if (event.target !== event.currentTarget || event.propertyName !== "opacity") return;
  if (closing.value) closePane(props.tab.id);
};

onMounted(loadAsset);
</script>

<template>
  <div
    class="h-full min-h-0 w-full overflow-auto px-4 py-4 sm:px-10"
    :class="[
      modernIsland ? 'connection-setup-stage--island' : 'bg-(--workspace-surface-background)',
      { 'is-leaving': modernIsland && closing }
    ]"
    @transitionend="onStageTransitionEnd"
  >
    <div class="mx-auto flex min-h-full w-full items-center justify-center">
      <div
        v-if="!modernIsland && loading"
        class="grid h-full min-h-64 w-full place-items-center text-sm text-(--app-muted)"
      >
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
          <span>{{ t("Loading.Loading") }}</span>
        </div>
      </div>

      <Transition :name="modernIsland ? 'island-dialog' : ''" :appear="modernIsland">
        <section
          v-if="dialogVisible"
          class="connection-setup-shell overflow-hidden"
          :class="
            modernIsland
              ? 'connection-setup-shell--island'
              : 'w-[min(640px,100%)] rounded-lg border border-(--app-border) bg-(--workspace-surface-panel)'
          "
        >
          <div
            class="flex items-center justify-between gap-3 border-b px-4"
            :class="
              modernIsland
                ? 'h-10 border-[color-mix(in_srgb,var(--theme-fg)_14%,transparent)]'
                : 'h-13 border-(--app-border) bg-(--workspace-surface-header)'
            "
          >
            <div class="flex min-w-0 items-center gap-2">
              <span class="truncate font-semibold text-(--app-fg)" :class="modernIsland ? 'text-[13px]' : 'text-sm'">
                {{ t("ContextMenu.Connect") }}
                {{ modernIsland ? " · " : " - " }}
                <span class="font-ui-mono font-medium">{{ assetAddress }}</span>
              </span>
              <UBadge
                v-if="assetName && assetName !== assetAddress"
                :label="assetName"
                color="neutral"
                variant="soft"
                size="sm"
                class="max-w-48 shrink truncate"
              />
            </div>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              :size="modernIsland ? 'xs' : 'sm'"
              :aria-label="t('Common.Cancel')"
              @click="requestClose"
            />
          </div>

          <div
            v-if="loading"
            class="flex min-h-72 flex-col items-center justify-center gap-3 pb-8 text-xs text-(--app-text-muted)"
          >
            <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-(--theme-accent)" />
            <span>{{ t("Loading.Loading") }}</span>
          </div>

          <div v-else class="flex min-h-75 flex-col" :class="modernIsland ? '' : 'bg-(--app-surface-panel-strong)'">
            <div class="min-h-0 flex-1 overflow-auto py-4 pt-2" :class="modernIsland ? 'px-4' : 'px-6'">
              <div v-if="launchSuccessVisible" class="flex min-h-full items-center justify-center py-6">
                <section
                  class="launch-success-card w-full rounded-xl border border-(--app-border) bg-(--workspace-surface-panel) px-5 py-6 sm:px-6"
                >
                  <div class="flex items-start gap-3">
                    <div class="grid size-11 shrink-0 place-items-center rounded-full bg-primary/12 text-primary">
                      <UIcon name="i-lucide-app-window" class="size-5" />
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <h3 class="text-sm font-semibold text-(--app-fg)">
                          {{ t("ConnectionSetup.ClientLaunchStarted") }}
                        </h3>
                        <UBadge
                          v-if="launchedProtocol"
                          :label="launchedProtocol.toUpperCase()"
                          color="primary"
                          variant="soft"
                          size="sm"
                        />
                      </div>
                      <p class="mt-2 text-sm leading-6 text-(--app-fg)">
                        {{ launchSummary }}
                      </p>
                      <p class="mt-1 text-xs leading-5 text-(--app-muted)">
                        {{ launchHint }}
                      </p>
                    </div>
                  </div>

                  <div class="mt-5 rounded-lg border border-(--app-border) bg-(--workspace-surface-header) px-4 py-3">
                    <div class="text-xs text-(--app-muted)">
                      {{ t("ConnectionSetup.ConnectionTarget") }}
                    </div>
                    <div class="mt-1 break-all font-ui-mono text-sm text-(--app-fg)">
                      {{ assetAddress }}
                    </div>
                    <div v-if="launchedClientName" class="mt-2 text-xs text-(--app-muted)">
                      {{ t("ConnectionSetup.Client") }}:
                      {{ launchedClientName }}
                    </div>
                  </div>
                </section>
              </div>

              <template v-else-if="currentAsset">
                <ConnectFormFields
                  v-model:draft="draft"
                  :asset="currentAsset"
                  :asset-type="props.assetType"
                  :preferred-connect-method="preferredConnectMethod"
                  :submit-label="externalClientLaunch ? t('ConnectionSetup.OpenInClient') : t('Common.Connect')"
                  :submitting="connecting"
                  :disabled="connecting || !draft.protocol || !draft.connectMethod"
                  @submit="submit"
                />
              </template>
            </div>

            <div
              v-if="connecting || connectionError"
              class="border-t border-(--app-border) bg-(--workspace-surface-footer) px-5 py-3"
            >
              <div v-if="connecting" class="space-y-2">
                <div class="flex items-center gap-2 text-xs text-(--app-muted)">
                  <UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin" />
                  <span>{{ t("ConnectionSetup.Establishing") }}</span>
                </div>
                <div class="connection-activity-track">
                  <span class="connection-activity-bar" />
                </div>
              </div>

              <div
                v-if="connectionError"
                class="mt-2 flex items-start gap-2 rounded-md border border-error/25 bg-error/10 px-3 py-2 text-xs text-error"
              >
                <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3.5 shrink-0" />
                <span class="min-w-0 wrap-break-word">{{ connectionError }}</span>
              </div>
            </div>

            <div
              v-if="launchSuccessVisible"
              class="border-t border-(--app-border) bg-(--workspace-surface-footer) px-5 pt-3 pb-5"
            >
              <div class="flex flex-col gap-3 sm:flex-row">
                <UButton
                  :label="t('ConnectionSetup.OpenAgain')"
                  color="primary"
                  :loading="connecting"
                  block
                  @click="submit"
                />
                <UButton
                  :label="t('ConnectionSetup.BackToForm')"
                  color="neutral"
                  variant="outline"
                  block
                  @click="resetLaunchSuccessState"
                />
              </div>
            </div>
          </div>
        </section>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.connection-setup-shell {
  box-shadow:
    0 1px 0 color-mix(in srgb, var(--app-surface-panel-strong) 82%, transparent) inset,
    var(--theme-shadow-soft);
}

.connection-setup-stage--island {
  background: transparent;
}

.connection-setup-stage--island.is-leaving {
  opacity: 0;
  pointer-events: none;
  transition: opacity 200ms ease;
}

.connection-setup-shell--island {
  width: min(520px, 100%);
  border: 1px solid color-mix(in srgb, var(--theme-fg) 18%, transparent);
  border-radius: var(--workspace-island-radius);
  background: var(--app-surface-overlay);
  box-shadow:
    0 1px 0 color-mix(in srgb, var(--theme-fg) 8%, transparent) inset,
    0 10px 28px color-mix(in srgb, #000 16%, transparent);
}

.connection-setup-shell--island .connection-activity-bar {
  background: var(--theme-accent);
}

.island-dialog-enter-active,
.island-dialog-leave-active {
  transition:
    opacity 220ms ease,
    transform 220ms ease;
}

.island-dialog-enter-from,
.island-dialog-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}

.launch-success-card {
  box-shadow:
    0 1px 0 color-mix(in srgb, var(--app-surface-panel-strong) 78%, transparent) inset,
    0 16px 36px color-mix(in srgb, var(--app-fg) 5%, transparent);
}

.connection-activity-track {
  position: relative;
  height: 0.1875rem;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-border) 70%, transparent);
}

.connection-activity-bar {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 38%;
  border-radius: inherit;
  background: var(--ui-primary);
  animation: connection-activity-slide 1.05s ease-in-out infinite alternate;
}

@keyframes connection-activity-slide {
  from {
    transform: translateX(-20%);
  }

  to {
    transform: translateX(185%);
  }
}
</style>
