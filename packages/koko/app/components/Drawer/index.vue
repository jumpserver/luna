<script setup lang="ts">
import { HOST_MESSAGE_TYPE } from "@jumpserver/connectors-core";
import KokoDrawerFileManagement from "#koko/components/Drawer/FileManagement/index.vue";
import KokoDrawerGeneral from "#koko/components/Drawer/General/index.vue";
import { useKokoTerminalEvents } from "#koko/composables/useTerminalEvents";
import { useKokoConnectionStore } from "#koko/stores/connection";
import mittBus from "#koko/utils/mittBus";

const props = defineProps<{ hiddenFileManager?: boolean }>();

const MAX_WAIT_TIME = 15_000;
const { t } = useI18n();
const connectionStore = useKokoConnectionStore();
const { hostBridge } = useKokoTerminalEvents();

const drawerOpen = ref(false);
const activeTab = ref("general");
const hasToken = ref(false);
const showEmpty = ref(false);
const isRequestingToken = ref(false);
const fileManagerToken = ref("");
const timeoutId = ref<ReturnType<typeof setTimeout> | null>(null);
const isDisableFileManager = ref(false);

const drawerTabs = computed(() => {
  const tabs = [
    { value: "general", label: t("koko.drawer.general"), icon: "i-lucide-keyboard" },
    { value: "file-manager", label: t("koko.drawer.fileManagement"), icon: "i-lucide-folder-kanban" }
  ];
  if (props.hiddenFileManager || isDisableFileManager.value) {
    return tabs.filter((tab) => tab.value !== "file-manager");
  }
  return tabs;
});

watch(hasToken, (value) => {
  if (!value) return;
  isRequestingToken.value = false;
  showEmpty.value = false;
  if (timeoutId.value) clearTimeout(timeoutId.value);
  timeoutId.value = null;
});

const closeDrawer = () => {
  drawerOpen.value = false;
};

const requestFileToken = () => {
  if (timeoutId.value) clearTimeout(timeoutId.value);
  isRequestingToken.value = true;
  showEmpty.value = false;
  hostBridge.sendHost(HOST_MESSAGE_TYPE.CREATE_FILE_CONNECT_TOKEN, "");
  timeoutId.value = setTimeout(() => {
    if (!hasToken.value && isRequestingToken.value) {
      showEmpty.value = true;
      isRequestingToken.value = false;
    }
  }, MAX_WAIT_TIME);
};

const handleTabChange = (tabName: string | number) => {
  activeTab.value = String(tabName);
  if (activeTab.value === "file-manager" && !hasToken.value && !isRequestingToken.value) {
    requestFileToken();
  }
};

const handleCreateFileConnectToken = (message: { token?: string }) => {
  if (message.token) {
    fileManagerToken.value = message.token;
    hasToken.value = true;
  } else if (isRequestingToken.value) {
    showEmpty.value = true;
    isRequestingToken.value = false;
  }
};

const handleReconnect = () => {
  hasToken.value = false;
  showEmpty.value = false;
  fileManagerToken.value = "";
  requestFileToken();
};

onMounted(() => {
  hostBridge.onHost(HOST_MESSAGE_TYPE.OPEN, () => {
    drawerOpen.value = true;
  });
  hostBridge.onHost(HOST_MESSAGE_TYPE.GET_FILE_CONNECT_TOKEN, (message) =>
    handleCreateFileConnectToken(message as { token?: string })
  );
  hostBridge.onHost(HOST_MESSAGE_TYPE.PING, () => {
    isDisableFileManager.value = hostBridge.getDisableFileManager();
  });
  isDisableFileManager.value = hostBridge.getDisableFileManager();

  mittBus.on("open-setting", () => {
    drawerOpen.value = !drawerOpen.value;
  });
  mittBus.on("close-drawer", () => {
    drawerOpen.value = false;
  });
  mittBus.on("file-manager-expired", () => {
    showEmpty.value = true;
  });
});

onUnmounted(() => {
  if (timeoutId.value) clearTimeout(timeoutId.value);
  mittBus.off("open-setting");
  mittBus.off("close-drawer");
  mittBus.off("file-manager-expired");
});
</script>

<template>
  <USlideover
    id="drawer-inner-target"
    v-model:open="drawerOpen"
    :ui="{ content: 'w-full max-w-[min(800px,90vw)] min-w-[600px]' }"
  >
    <template #header>
      <div class="flex w-full items-center justify-between gap-3">
        <span class="font-medium">{{ connectionStore.assetName || t("koko.terminal.title") }}</span>
        <UButton color="neutral" variant="ghost" icon="i-lucide-x" @click="closeDrawer" />
      </div>
    </template>

    <template #body>
      <UTabs
        v-model="activeTab"
        :items="drawerTabs"
        value-key="value"
        label-key="label"
        class="w-full"
        @update:model-value="handleTabChange"
      />

      <div class="mt-4">
        <KokoDrawerGeneral v-if="activeTab === 'general'" />
        <KokoDrawerFileManagement
          v-else-if="activeTab === 'file-manager'"
          :sftp-token="fileManagerToken"
          :show-empty="showEmpty"
          @reconnect="handleReconnect"
        />
      </div>
    </template>
  </USlideover>
</template>
