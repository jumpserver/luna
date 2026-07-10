<script setup lang="ts">
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";
import type {
  AssetItem,
  AssetPageType,
  ConnectionInfo,
  ConnectionPreferenceInfo,
  PermedAccount,
  PermedProtocol
} from "~/types/index";

import ConnectForm from "~/components/ConnectForm/connectForm.vue";
import { useUserInfoStore } from "~/store/modules/userInfo";
import { sortPermedProtocols, sortProtocolNames } from "~/utils";

const props = withDefaults(
  defineProps<{
    tab: WorkspaceSessionTab;
    assetType?: AssetPageType;
  }>(),
  {
    assetType: "assets"
  }
);

const { t, locale } = useI18n();
const { getAssetDetail } = useAssetAction();
const { confirmConnection } = useAssetConnection();
const { getMethodsForProtocol } = useConnectMethods();
const { closeSession, startSessionConnection } = useWorkspaceTabs();
const userInfoStore = useUserInfoStore();

const currentAsset = ref<AssetItem | null>(props.tab.setupAsset || null);
const loading = ref(false);
const connecting = ref(false);

const draftProtocol = ref<string>("");
const draftAccount = ref<string>("");
const draftManualUsername = ref<string>("");
const draftManualPassword = ref<string>("");
const draftDynamicPassword = ref<string>("");
const draftRememberSecret = ref<boolean>(false);
const draftRememberSelection = ref<boolean>(false);
const draftConnectMethod = ref<string>("");
const draftConnectOptions = ref<Record<string, any>>({});

const title = computed(() => props.tab.assetName || currentAsset.value?.name || "");

const getVisibleProtocols = (protocols: PermedProtocol[]) => {
  if (isTauriRuntime()) return protocols;
  return protocols.filter((protocol) => protocol?.public !== false);
};

const getManualInputLabel = () => (locale.value === "zh" ? "手动输入" : "Manual input");
const getAnonymousLabel = () => (locale.value === "zh" ? "匿名账号" : "Anonymous");
const getDynamicAccountLabel = (account?: PermedAccount) => {
  if (!account) return "";

  const base = t("Account.DynamicUser");
  const username = account.username || "";
  return username ? `${base}(${username})` : base;
};

const hasReusableSavedConnection = (asset: AssetItem) => {
  const saved = asset.savedConnection;
  if (!saved?.protocol || !saved.username) return false;

  const mode = saved.accountMode || "hosted";
  if (mode === "manual") {
    return !!(saved.rememberSecret && saved.manualUsername && saved.manualPassword);
  }
  if (mode === "dynamic") {
    return !!(saved.rememberSecret && saved.dynamicPassword);
  }

  return true;
};

const resolveAutoAccount = (accounts: PermedAccount[]) => {
  const visibleAccounts = accounts.filter((account) => {
    return account.alias !== "@ANON" || props.assetType?.toLowerCase() === "web";
  });

  if (visibleAccounts.length !== 1) return null;

  const account = visibleAccounts[0]!;
  if (account.alias === "@INPUT" || account.alias === "@USER") return null;
  if (account.alias === "@ANON") {
    return {
      label: "@ANON",
      account: "@ANON"
    };
  }

  return {
    label: account.name,
    account: account.name
  };
};

const resolvePreferredProtocol = (
  source: ConnectionPreferenceInfo | ConnectionInfo | undefined,
  protocols: PermedProtocol[]
) => {
  const available = sortPermedProtocols(protocols).map((item) => item.name);
  const explicit = (props.tab.protocol || "").trim();
  const preferred = (source?.protocol || "").trim();

  if (explicit && available.includes(explicit)) return explicit;
  if (preferred && available.includes(preferred)) return preferred;
  return available[0] || "";
};

const resolvePreferredAccount = (
  source: ConnectionPreferenceInfo | ConnectionInfo | undefined,
  accounts: PermedAccount[]
) => {
  const mode = source?.accountMode || "hosted";
  const username = (source?.username || "").trim();

  if (mode === "manual") {
    const manual = accounts.find((account) => account.alias === "@INPUT");
    if (manual) return getManualInputLabel();
  }

  if (mode === "dynamic") {
    const dynamic = accounts.find((account) => account.alias === "@USER");
    if (dynamic) return getDynamicAccountLabel(dynamic);
  }

  if (mode === "anonymous") {
    const anonymous = accounts.find((account) => account.alias === "@ANON");
    if (anonymous) return "@ANON";
  }

  if (mode === "hosted" && username) {
    const hosted = accounts.find((account) => {
      if (source?.accountId && account.id === source.accountId) return true;
      return account.name === username || account.username === username || account.alias === username;
    });

    if (hosted) return hosted.name;
  }

  const firstHosted = accounts.find((account) => account?.alias && !account.alias.startsWith("@"));
  if (firstHosted) return firstHosted.name;

  const dynamic = accounts.find((account) => account.alias === "@USER");
  if (dynamic) return getDynamicAccountLabel(dynamic);

  const manual = accounts.find((account) => account.alias === "@INPUT");
  if (manual) return getManualInputLabel();

  const anonymous = accounts.find((account) => account.alias === "@ANON");
  if (anonymous) return "@ANON";

  return "";
};

const initDraft = (asset: AssetItem) => {
  const saved: ConnectionInfo | undefined = asset.savedConnection;
  const preferred = userInfoStore.getConnectionPreferenceForAsset(asset.id) || undefined;
  const source = {
    ...(saved || {}),
    ...(preferred || {})
  } as ConnectionPreferenceInfo | ConnectionInfo;

  const protocols = sortPermedProtocols(getVisibleProtocols(asset.permedProtocols || ([] as PermedProtocol[])));
  const accounts = asset.permedAccounts || ([] as PermedAccount[]);

  draftProtocol.value = resolvePreferredProtocol(source, protocols);
  draftAccount.value = resolvePreferredAccount(source, accounts);
  draftManualUsername.value = source?.manualUsername || "";
  draftManualPassword.value = saved?.manualPassword || "";
  draftDynamicPassword.value = saved?.dynamicPassword || "";
  draftRememberSecret.value = saved?.rememberSecret || false;
  draftRememberSelection.value = false;
  draftConnectMethod.value = source?.connectMethod || "";
  draftConnectOptions.value = { ...(source?.connectOptions || {}) };
};

const tryAutoConnect = async (asset: AssetItem) => {
  if (hasReusableSavedConnection(asset)) {
    draftRememberSelection.value = true;
    await submit();
    return true;
  }

  const protocols = sortPermedProtocols(getVisibleProtocols(asset.permedProtocols || ([] as PermedProtocol[])));
  if (protocols.length !== 1) return false;

  const autoAccount = resolveAutoAccount(asset.permedAccounts || []);
  if (!autoAccount) return false;

  let methods: Awaited<ReturnType<typeof getMethodsForProtocol>> = [];
  try {
    methods = await getMethodsForProtocol(protocols[0]!.name);
  } catch {
    return false;
  }

  if (methods.length !== 1) return false;

  draftProtocol.value = protocols[0]!.name;
  draftAccount.value = autoAccount.label;
  draftConnectMethod.value = methods[0]!.value;
  draftRememberSelection.value = true;
  await submit();
  return true;
};

const normalizeProtocols = () => {
  const protocols = getVisibleProtocols(currentAsset.value?.permedProtocols || [])
    .map((p) => (p?.name ? p.name.trim() : ""))
    .filter((name) => name.length > 0);

  return sortProtocolNames(protocols);
};

const buildConnectionInfo = () => {
  let accountMode: "hosted" | "dynamic" | "manual" | "anonymous" = "hosted";
  let normalizedAccount = draftAccount.value || "";
  let accountId: string | undefined;

  const v = draftAccount.value || "";

  if (v === getManualInputLabel()) accountMode = "manual";
  if (v.includes("@ANON") || v === getAnonymousLabel()) {
    accountMode = "anonymous";
    normalizedAccount = "@ANON";
  }
  if (v.startsWith(t("Account.DynamicUser"))) {
    accountMode = "dynamic";

    const accs = currentAsset.value?.permedAccounts || [];
    const dynamicAcc = accs.find((a) => a.alias === "@USER");

    if (dynamicAcc) normalizedAccount = dynamicAcc.name;
    else normalizedAccount = v.replace(/\(.+\)/, "");
  }

  if (accountMode === "hosted") {
    const accs = currentAsset.value?.permedAccounts || [];
    const matched = accs.find(
      (a) => a.name === normalizedAccount || a.username === normalizedAccount || a.alias === normalizedAccount
    );
    accountId = matched?.id;
  }

  return {
    protocol: draftProtocol.value || "",
    account: normalizedAccount,
    accountId,
    accountMode,
    manualUsername: draftManualUsername.value || "",
    manualPassword: draftManualPassword.value || "",
    dynamicPassword: draftDynamicPassword.value || "",
    rememberSecret: !!draftRememberSecret.value,
    rememberSelection: !!draftRememberSelection.value,
    connectMethod: draftConnectMethod.value || "",
    connectOptions: { ...draftConnectOptions.value },
    availableProtocols: normalizeProtocols()
  };
};

async function ensureDetails(asset: AssetItem) {
  const noAccounts = !asset.permedAccounts || asset.permedAccounts.length === 0;
  const noProtocols = !asset.permedProtocols || asset.permedProtocols.length === 0;

  if (!noAccounts && !noProtocols) return asset;

  let unsubscribe = () => {};
  const detailsReady = new Promise<AssetItem>((resolve) => {
    unsubscribe = useEventBus().on(
      "assetDetailUpdated",
      (payload: { assetId: string; permedAccounts: PermedAccount[]; permedProtocols: PermedProtocol[] }) => {
        if (payload.assetId !== asset.id) return;

        currentAsset.value = {
          ...(currentAsset.value || asset),
          permedAccounts: payload.permedAccounts || [],
          permedProtocols: payload.permedProtocols || []
        } as AssetItem;

        resolve(currentAsset.value!);
      },
      false
    );
  });
  const fallback = new Promise<AssetItem>((resolve) => {
    setTimeout(resolve, 2500, currentAsset.value || asset);
  });

  await getAssetDetail(asset.id);
  const updated = await Promise.race([detailsReady, fallback]);
  unsubscribe();
  return updated;
}

async function loadAsset() {
  const asset = currentAsset.value || props.tab.setupAsset;
  if (!asset) return;

  loading.value = true;
  try {
    currentAsset.value = await ensureDetails(asset);
    initDraft(currentAsset.value);
    await tryAutoConnect(currentAsset.value);
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (!currentAsset.value || connecting.value) return;

  const info = buildConnectionInfo();
  connecting.value = true;
  startSessionConnection(props.tab.id, {
    protocol: info.protocol,
    account: info.account
  });
  await confirmConnection(currentAsset.value, {
    ...info,
    tabId: props.tab.id
  });
}

onMounted(loadAsset);
</script>

<template>
  <div class="h-full min-h-0 w-full overflow-auto bg-[var(--workspace-surface-background)] p-6">
    <div class="mx-auto flex min-h-full w-full max-w-2xl items-center">
      <div v-if="loading" class="grid h-full min-h-64 place-items-center text-sm text-[var(--app-muted)]">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
          <span>{{ t("Loading.Loading") }}</span>
        </div>
      </div>

      <template v-else-if="currentAsset">
        <section
          class="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-panel-strong)] shadow-[var(--theme-shadow-soft)]"
        >
          <div
            class="flex items-center justify-between gap-4 border-b border-[var(--app-border)] bg-[var(--app-header-bg)] px-5 py-4"
          >
            <div class="min-w-0">
              <div
                class="flex min-w-0 items-center gap-2 text-xs font-medium tracking-[0.12em] text-[var(--app-muted)]"
              >
                <UIcon name="i-lucide-plug" class="size-4 shrink-0" />
                <span class="shrink-0">{{ t("ContextMenu.Connect") }}</span>
                <span class="truncate font-ui-mono">- {{ props.tab.address }}</span>
                <span class="shrink-0 rounded bg-[var(--app-hover-soft)] px-1.5 py-0.5 text-[10px] uppercase">
                  {{ title }}
                </span>
              </div>
            </div>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              size="sm"
              :aria-label="t('Common.Cancel')"
              @click="closeSession(props.tab.id)"
            />
          </div>

          <div class="px-5 py-5">
            <ConnectForm
              v-model:protocol="draftProtocol"
              v-model:account="draftAccount"
              v-model:manual-username="draftManualUsername"
              v-model:manual-password="draftManualPassword"
              v-model:dynamic-password="draftDynamicPassword"
              v-model:remember-secret="draftRememberSecret"
              v-model:connect-method="draftConnectMethod"
              v-model:connect-options="draftConnectOptions"
              :accounts="currentAsset.permedAccounts || []"
              :protocols="currentAsset.permedProtocols || []"
              :asset-type="props.assetType"
              @keydown.enter="submit"
            />

            <div class="mt-5 flex items-center justify-between gap-4 border-t border-[var(--app-border)] pt-4">
              <UCheckbox
                v-model="draftRememberSelection"
                icon="i-lucide-check"
                :label="t('EditModal.RememberSelection')"
              />
              <UButton
                :label="t('Common.Connect')"
                color="primary"
                :loading="connecting"
                class="min-w-28 justify-center"
                @click="submit"
              />
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>
