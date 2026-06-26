<script setup lang="ts">
import type { WorkspaceSessionTab } from "~/composables/useWorkspaceTabs";

const props = defineProps<{
  tab: WorkspaceSessionTab
}>();

const DEFAULT_KOKO_IFRAME_BASE_URL = "http://localhost:4200";

const iframeRef = ref<HTMLIFrameElement | null>(null);
const ticket = ref("");
const ticketError = ref("");
const ticketLoading = ref(false);
const iframeReady = ref(false);
const iframeSrc = ref("");
const colorMode = useColorMode();
const terminalThemeName = computed(() => colorMode.value === "dark" ? "OneHalfDark" : "OneHalfLight");
const mainThemeCode = computed(() => colorMode.value === "dark" ? "darkGary" : "default");
const { activeTabId, markSessionConnected, markSessionFailed } = useWorkspaceTabs();
const { createKokoTicket } = useWorkspaceConnectors();

let ticketRequestSeq = 0;
let ticketTokenId = "";

const token = computed(() => props.tab.payload?.token || props.tab.payload || {});
const tokenId = computed(() => props.tab.payload?.id || token.value?.id || "");
const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, "");
const baseUrl = computed(() => {
  const rawOverride = import.meta.client ? globalThis.localStorage?.getItem("koko_iframe_base_url")?.trim() || "" : "";
  if (rawOverride) return normalizeBaseUrl(rawOverride);
  return DEFAULT_KOKO_IFRAME_BASE_URL;
});

function refreshIframeSrc() {
  if (!tokenId.value) {
    iframeSrc.value = "";
    return;
  }

  const query = new URLSearchParams({
    disableautohash: "false",
    token: tokenId.value,
    colorMode: colorMode.value === "light" ? "light" : "dark",
    themeType: mainThemeCode.value,
    terminal_theme_name: terminalThemeName.value,
    _: String(Date.now())
  });

  if (ticket.value) {
    query.set("ticket", ticket.value);
  }

  iframeSrc.value = `${baseUrl.value}/koko/connect/?${query.toString()}`;
}

function sendThemeSync() {
  if (!iframeReady.value) return;
  const frameWindow = iframeRef.value?.contentWindow;
  if (!frameWindow) return;

  const targetOrigin = new URL(baseUrl.value).origin;
  const lunaId = `clients-${props.tab.id}`;
  const baseMessage = {
    id: lunaId,
    origin: window.location.origin,
    disbaleFileManager: false
  };

  frameWindow.postMessage({ ...baseMessage, name: "PING", data: "" }, targetOrigin);
  frameWindow.postMessage({ ...baseMessage, name: "CHANGE_MAIN_THEME", data: mainThemeCode.value }, targetOrigin);
  frameWindow.postMessage(
    { ...baseMessage, name: "TERMINAL_THEME_CHANGE", data: "", theme: terminalThemeName.value },
    targetOrigin
  );
}

function handleIframeLoad() {
  iframeReady.value = true;
  markSessionConnected(props.tab.id);
  setTimeout(sendThemeSync, 0);
  setTimeout(sendThemeSync, 300);
}

async function ensureTicket() {
  if (!tokenId.value) return;
  if (ticket.value && ticketTokenId === tokenId.value) return;
  if (ticketLoading.value && ticketTokenId === tokenId.value) return;

  const requestSeq = ++ticketRequestSeq;
  ticketLoading.value = true;
  ticketError.value = "";
  ticket.value = "";
  ticketTokenId = tokenId.value;

  try {
    const result = await createKokoTicket({
      baseUrl: baseUrl.value,
      tokenId: tokenId.value
    });

    if (requestSeq !== ticketRequestSeq) return;
    ticket.value = String(result.ticket || "");
    iframeReady.value = false;
    refreshIframeSrc();
  } catch (error) {
    if (requestSeq !== ticketRequestSeq) return;
    ticketError.value = String(error);
    markSessionFailed({ tabId: props.tab.id, assetId: props.tab.assetId, protocol: props.tab.protocol, account: props.tab.account });
  } finally {
    if (requestSeq === ticketRequestSeq) {
      ticketLoading.value = false;
    }
  }
}

function focus() {
  iframeRef.value?.focus();
}

watch(
  () => props.tab.payload,
  () => {
    if (tokenId.value) void ensureTicket();
  },
  { deep: true }
);

watch(
  () => colorMode.value,
  () => {
    refreshIframeSrc();
    sendThemeSync();
  }
);

watch(
  () => activeTabId.value,
  (tabId) => {
    if (tabId === props.tab.id) {
      nextTick(focus);
    }
  }
);

onMounted(() => {
  if (tokenId.value) {
    void ensureTicket();
  }
});

defineExpose({ focus });
</script>

<template>
  <div class="h-full min-h-0 w-full" @mousedown="focus">
    <div v-if="iframeSrc" class="h-full min-h-0 w-full overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-zinc-950">
      <iframe
        ref="iframeRef"
        :src="iframeSrc"
        class="h-full w-full border-0 bg-white dark:bg-zinc-950"
        title="Koko Connector"
        @load="handleIframeLoad"
      />
    </div>

    <div
      v-else
      class="grid h-full min-h-0 place-items-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 dark:border-white/10 dark:text-gray-400"
    >
      <div class="flex flex-col items-center gap-2">
        <UIcon :name="ticketError ? 'i-lucide-circle-alert' : 'i-lucide-loader-circle'" class="size-5" :class="ticketError ? 'text-amber-500' : 'animate-spin'" />
        <div>{{ ticketLoading ? "正在准备 Koko 连接..." : (ticketError || "正在准备 Koko 连接...") }}</div>
      </div>
    </div>
  </div>
</template>
