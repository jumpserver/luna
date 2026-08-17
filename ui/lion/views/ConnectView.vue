<script lang="ts" setup>
import type { LionUploadCustomRequestOptions, LionUploadFileInfo } from "@/lion/types/upload";
import type { ConnectorSessionContext } from "~/shared/connectors/types/session";
import { connectorSessionKey } from "@jumpserver/connectors-core";
import { useDebounceFn } from "@vueuse/core";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import ClipBoardText from "@/lion/components/ClipBoardText.vue";
import CombinationKey from "@/lion/components/CombinationKey.vue";
import FileManager from "@/lion/components/FileManager.vue";
import KeyboardOption from "@/lion/components/KeyboardOption.vue";
import Osk from "@/lion/components/Osk.vue";
import OtherOption from "@/lion/components/OtherOption.vue";
import SessionShare from "@/lion/components/SessionShare/index.vue";
import { useGuacamoleClient } from "@/lion/hooks/useGuacamoleClient";
import { createLionConnectTicket } from "@/lion/hooks/useLionConnectTicket";
import { useLionEndpoint } from "@/lion/hooks/useLionEndpoint";
import { LUNA_MESSAGE_TYPE } from "@/lion/types/postmessage.type";
import { withLionWsUrl } from "@/lion/utils/base";
import { getCurrentConnectParams } from "@/lion/utils/common";
import { lunaCommunicator } from "@/lion/utils/lunaBus";
import { ErrorStatusCodes } from "@/lion/utils/status";

const emit = defineEmits<{ disconnected: [message: string] }>();

const toast = useToast();
const { addErrorToast } = useErrorToast();
const { t } = useI18n();
const containerRef = ref<HTMLElement | null>(null);
const displayRef = ref<HTMLElement | null>(null);
const sessionContext = inject(connectorSessionKey, ref<ConnectorSessionContext | null>(null));
const endpointUrl = useLionEndpoint(() => unref(sessionContext)?.endpointUrl);
const activeToken = ref("");
const activeTicket = ref("");
let ticketCreatedAt = 0;
let ticketRefreshPromise: Promise<string> | null = null;

const {
  guaDisplay,
  connectToGuacamole,
  connectStatus,
  onlineUsersMap,
  disconnectGuaclient,
  sendTextToRemote,
  sendKeyEvent,
  uploadFile,
  clientFileReceived,
  resizeGuaScale,
  sendGuaSize,
  scale,
  handleFolderOpen,
  driverName,
  loading,
  registerMouseAndKeyboardHanlder,
  sessionObject,
  currentFolder,
  currentFolderFiles,
  hasClipboardPermission,
  debouncedSendClipboardToRemote,
  fileFsLoading,
  currentGuacFsObject,
  enableShare,
  action_permission,
  remoteClipboardText,
  clipboardPasteTextLimit,
  sendInputActive
} = useGuacamoleClient(t, endpointUrl, () => ({ ticket: activeTicket.value, token: activeToken.value }));

const drawShow = ref(false);
const autoFit = ref<boolean>(true);

const resolveVisibleContainerSize = () => {
  const rect = containerRef.value?.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;

  return {
    width: Math.max(Math.floor(rect.width), 640),
    height: Math.max(Math.floor(rect.height), 480)
  };
};

let remoteWidth = 0;
let remoteHeight = 0;

const debouncedResize = useDebounceFn(() => {
  const size = resolveVisibleContainerSize();
  if (!size) return;

  const { width, height } = size;
  resizeGuaScale(width, height);
  if (!autoFit.value || (width === remoteWidth && height === remoteHeight)) return;
  sendGuaSize(width, height);
  remoteWidth = width;
  remoteHeight = height;
}, 300);

let resizeObserver: ResizeObserver | null = null;

interface GuacamoleFile {
  mimetype?: any;
  streamName?: any;
  type: "DIRECTORY" | "FILE";
  name: string;
  parent?: GuacamoleFile | null;
  is_dir?: boolean;
}

interface UploadItem {
  uploadOptions: LionUploadCustomRequestOptions;
  folder: GuacamoleFile;
}

const uploadingFiles = ref<Array<UploadItem>>([]);
const isUploading = ref(false);
const displayUploadingFiles = ref<Array<LionUploadFileInfo>>([]);
const showOsk = ref<boolean>(false);
let uploadSequence = 0;

const createUploadId = () => {
  uploadSequence += 1;
  return globalThis.crypto?.randomUUID?.() || `lion-drop-${Date.now()}-${uploadSequence}`;
};

function getKeyboardLayout() {
  if (!import.meta.client) return "en-us-qwerty";
  const lunaSetting = localStorage.getItem("LunaSetting");
  if (lunaSetting) {
    const setting = JSON.parse(lunaSetting);
    const graphics = setting.graphics || {};
    const layout = graphics.keyboard_layout || setting.keyboard_layout;
    if (layout) return layout;
  }
  return "en-us-qwerty";
}

const keyboardLayout = ref<string>(getKeyboardLayout());
const currentTab = ref("general");
const shouldEnableScroll = ref(false);

const refreshConnectTicket = async () => {
  if (!activeToken.value) return activeTicket.value;
  if (activeTicket.value && Date.now() - ticketCreatedAt < 25 * 60 * 1000) return activeTicket.value;
  const previousTicket = activeTicket.value;
  const previousTicketAge = Date.now() - ticketCreatedAt;
  if (!ticketRefreshPromise) {
    ticketRefreshPromise = createLionConnectTicket(endpointUrl.value, activeToken.value).finally(() => {
      ticketRefreshPromise = null;
    });
  }
  try {
    activeTicket.value = await ticketRefreshPromise;
    ticketCreatedAt = Date.now();
    return activeTicket.value;
  } catch (error) {
    if (previousTicket && previousTicketAge < 30 * 60 * 1000) return previousTicket;
    throw error;
  }
};

const handleUploadFile = async (options: LionUploadCustomRequestOptions, folder: any) => {
  if (action_permission.value && !action_permission.value.enable_upload) {
    toast.add({ title: `${t("UploadFile")} ${t("NoPermission")}`, color: "warning" });
    return;
  }
  try {
    await refreshConnectTicket();
  } catch (error) {
    addErrorToast({ title: error instanceof Error ? error.message : String(error) });
    return;
  }
  const item = { uploadOptions: options, folder: folder || currentFolder.value };
  displayUploadingFiles.value.push(options.file);
  uploadingFiles.value.push(item);
  if (isUploading.value) {
    toast.add({ title: `${t("FileAddUploadingList")}: ${options.file.name}`, color: "info" });
    return;
  }
  isUploading.value = true;
  toast.add({ title: `${t("FileUploadStart")}: ${options.file.name}`, color: "info" });
  processUploadQueue().then(() => handleFolderOpen(currentFolder.value));
};

const handleRemoveFile = (file: LionUploadFileInfo) => {
  if (file.status === "uploading") {
    toast.add({ title: t("FileUploadingWarning"), color: "warning" });
    return;
  }
  if (file.status === "pending") {
    uploadingFiles.value = uploadingFiles.value.filter((item) => item.uploadOptions.file.id !== file.id);
  }
  displayUploadingFiles.value = displayUploadingFiles.value.filter((item) => item.id !== file.id);
};

async function processUploadQueue() {
  while (isUploading.value && uploadingFiles.value.length > 0) {
    const uploadItem = uploadingFiles.value.shift();
    if (!uploadItem?.uploadOptions) continue;
    const { uploadOptions, folder } = uploadItem;

    try {
      await refreshConnectTicket();
      uploadOptions.file.status = "uploading";
      await uploadFile(uploadOptions, folder);
      uploadOptions.file.status = "finished";
    } catch (statusError: any) {
      uploadOptions.file.status = "error";
      let msg = statusError.message as string;
      if (statusError.code && ErrorStatusCodes[statusError.code]) {
        msg = t(ErrorStatusCodes[statusError.code]);
      } else {
        msg = `${t("FileUploadError")}: ${uploadOptions.file.name}`;
      }
      addErrorToast({ title: msg });
    }
  }
  isUploading.value = false;
}

const fileDrop = (event: DragEvent) => {
  event.stopPropagation();
  event.preventDefault();
  const files = event.dataTransfer?.files;
  if (!files?.length) return;

  Array.from(files).forEach((fileObj) => {
    const id = createUploadId();
    handleUploadFile(
      {
        file: {
          id,
          name: fileObj.name,
          batchId: id,
          percentage: 0,
          type: fileObj.type,
          status: "pending",
          file: fileObj
        }
      },
      currentFolder.value
    );
  });
};

const getBrowserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch (error) {
    console.debug("Unable to detect browser timezone", error);
    return "";
  }
};

const preventDefault = (event: Event) => {
  event.stopPropagation();
  event.preventDefault();
};

let displayElement: HTMLElement | null = null;
let disposed = false;

const handleLunaOpen = () => {
  nextTick(() => {
    drawShow.value = !drawShow.value;
  });
};

const handleLunaInputActive = () => {
  nextTick(() => sendInputActive());
};

const resolveConnectConfig = async () => {
  const ctx = unref(sessionContext);
  if (ctx?.tokenId) {
    return {
      // Lion 同时保留 TOKEN_ID 协议参数和 Koko 票据绑定所需的 token 参数。
      ws: withLionWsUrl("/ws/connect/", ctx.endpointUrl),
      token: ctx.tokenId,
      ticket: ctx.ticket || (await createLionConnectTicket(ctx.endpointUrl, ctx.tokenId))
    };
  }

  const params = getCurrentConnectParams();
  const token = params.data.token || params.data.TOKEN_ID || "";
  return {
    ws: withLionWsUrl("/ws/connect/", endpointUrl.value),
    token,
    ticket: await createLionConnectTicket(endpointUrl.value, token)
  };
};

onMounted(async () => {
  loading.value = true;
  await nextTick();
  if (disposed) return;

  lunaCommunicator.onLuna(LUNA_MESSAGE_TYPE.OPEN, handleLunaOpen);
  lunaCommunicator.onLuna(LUNA_MESSAGE_TYPE.INPUT_ACTIVE, handleLunaInputActive);

  let connectConfig: Awaited<ReturnType<typeof resolveConnectConfig>>;
  try {
    connectConfig = await resolveConnectConfig();
  } catch (error) {
    if (disposed) return;
    loading.value = false;
    addErrorToast({ title: error instanceof Error ? error.message : String(error) });
    return;
  }
  if (disposed) return;
  const { ws, token, ticket } = connectConfig;
  activeToken.value = token;
  activeTicket.value = ticket;
  ticketCreatedAt = ticket ? Date.now() : 0;
  const initialSize = resolveVisibleContainerSize();
  const width = initialSize?.width || Math.max(window.innerWidth, 640);
  const height = initialSize?.height || Math.max(window.innerHeight, 480);
  connectToGuacamole(
    ws,
    {
      TOKEN_ID: token,
      token,
      ...(ticket ? { ticket } : {}),
      GUAC_KEYBOARD: keyboardLayout.value,
      GUAC_TIMEZONE: getBrowserTimezone()
    },
    width,
    height,
    true
  );

  const displayEl = displayRef.value;
  if (!displayEl) {
    loading.value = false;
    disconnectGuaclient();
    return;
  }
  displayElement = displayEl;
  displayEl.appendChild(guaDisplay.value.getElement());

  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => debouncedResize());
    resizeObserver.observe(containerRef.value);
    debouncedResize();
  }

  displayEl.addEventListener("dragenter", preventDefault, false);
  displayEl.addEventListener("dragover", preventDefault, false);
  displayEl.addEventListener("drop", fileDrop, false);
  displayEl.addEventListener("contextmenu", preventDefault, false);

  registerMouseAndKeyboardHanlder();
  window.addEventListener("focus", debouncedSendClipboardToRemote);
});

onUnmounted(() => {
  disposed = true;
  resizeObserver?.disconnect();
  resizeObserver = null;
  displayElement?.removeEventListener("dragenter", preventDefault, false);
  displayElement?.removeEventListener("dragover", preventDefault, false);
  displayElement?.removeEventListener("drop", fileDrop, false);
  displayElement?.removeEventListener("contextmenu", preventDefault, false);
  displayElement = null;
  disconnectGuaclient();
  lunaCommunicator.offLuna(LUNA_MESSAGE_TYPE.OPEN, handleLunaOpen);
  lunaCommunicator.offLuna(LUNA_MESSAGE_TYPE.INPUT_ACTIVE, handleLunaInputActive);
  lunaCommunicator.sendLuna(LUNA_MESSAGE_TYPE.CLOSE, "");
  window.removeEventListener("focus", debouncedSendClipboardToRemote);
});

const ClipBoardTextChange = (text: string) => {
  if (!text?.trim()) return;
  sendTextToRemote(text);
};

const handleScreenKeyboard = (name: string, keysym: any) => {
  if (name === "keydown") sendKeyEvent(1, keysym);
  else if (name === "keyup") sendKeyEvent(0, keysym);
};

const handleDownloadFile = async (file: { name: string; streamName?: GuacamoleFile["streamName"] }) => {
  if (!file?.streamName) return;
  if (action_permission.value && !action_permission.value.enable_download) {
    toast.add({ title: t("FileDownloadDenied"), color: "warning" });
    return;
  }
  try {
    await refreshConnectTicket();
  } catch (error) {
    addErrorToast({ title: error instanceof Error ? error.message : String(error) });
    return;
  }
  currentGuacFsObject.value.requestInputStream(file.streamName, (stream: any, mimetype: any) => {
    clientFileReceived(stream, mimetype, file.name);
  });
};

const fitPercentage = computed(() => Math.floor(scale.value * 100));

watch(connectStatus, (status) => {
  if (status === "Disconnected" && !disposed) emit("disconnected", t("GuacamoleErrDisconnected"));
});

watch(
  autoFit,
  () => {
    if (autoFit.value) debouncedResize();
  },
  { immediate: true }
);

const handleCombineKeys = (keys: string[]) => {
  keys.forEach((keysym: any) => sendKeyEvent(1, keysym));
  setTimeout(() => keys.forEach((keysym: any) => sendKeyEvent(0, keysym)), 100);
};

const scaleGuaDisplay = (value: number) => {
  if (value <= 0) return;
  const newScale = value / 100;
  if (newScale > scale.value) shouldEnableScroll.value = true;
  else if (newScale <= 1) shouldEnableScroll.value = false;
  guaDisplay.value.scale(newScale);
  scale.value = newScale;
};

const onlineUsers = computed(() => Object.values(onlineUsersMap.value).filter(Boolean));
const assetName = computed(() => sessionObject.value?.asset?.name || "");
const isRemoteApp = computed(() => Boolean(sessionObject.value?.remote_app));

const drawerTabs = computed(() => {
  const tabs = [{ value: "general", label: t("General"), icon: "i-lucide-keyboard" }];
  if (driverName.value) {
    tabs.push({ value: "file-manager", label: t("FileManagement"), icon: "i-lucide-folder-kanban" });
  }
  if (sessionObject.value) {
    tabs.push({ value: "share-collaboration", label: t("SessionShare"), icon: "i-lucide-share-2" });
  }
  return tabs;
});
</script>

<template>
  <div ref="containerRef" class="relative flex h-full w-full min-h-0 flex-col">
    <div v-if="loading" class="absolute inset-0 z-10 flex items-center justify-center bg-default/80">
      <div class="flex flex-col items-center gap-2 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" />
        <span>{{ t("Connecting") }}: {{ connectStatus }}</span>
      </div>
    </div>

    <div
      ref="displayRef"
      class="relative flex h-full w-full min-h-0 justify-center"
      :class="[shouldEnableScroll ? 'overflow-auto' : 'overflow-hidden']"
    />

    <Osk v-if="showOsk" :keyboard="keyboardLayout" @keyboard-change="handleScreenKeyboard" />
  </div>

  <USlideover v-model:open="drawShow" :ui="{ content: 'w-full max-w-[min(800px,90vw)] min-w-[600px]' }">
    <template #header>
      <div class="flex w-full items-center justify-between gap-3">
        <span class="font-medium">{{ assetName }}</span>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-x"
          @click="
            () => {
              drawShow = false;
            }
          "
        />
      </div>
    </template>

    <template #body>
      <UTabs v-model="currentTab" :items="drawerTabs" value-key="value" label-key="label" class="w-full" />

      <div class="mt-4 space-y-4">
        <template v-if="currentTab === 'general'">
          <ClipBoardText
            :disabled="!hasClipboardPermission"
            :copy-disabled="!action_permission.enable_copy"
            :paste-disabled="!action_permission.enable_paste"
            :paste-policy-disabled="action_permission.clipboard_policy?.paste?.enabled === false"
            :remote-text="remoteClipboardText"
            :text-limit="clipboardPasteTextLimit"
            @update:text="ClipBoardTextChange"
          />
          <KeyboardOption v-if="!isRemoteApp" v-model:opened="showOsk" v-model:keyboard="keyboardLayout" />
          <CombinationKey :is-remote-app="isRemoteApp" @combine-keys="handleCombineKeys" />
          <OtherOption
            v-model:auto-fit="autoFit"
            :fit-percentage="fitPercentage"
            :is-remote-app="isRemoteApp"
            @update-scale="scaleGuaDisplay"
          />
        </template>

        <FileManager
          v-else-if="currentTab === 'file-manager' && driverName"
          :loading="fileFsLoading"
          :files="currentFolderFiles"
          :name="driverName"
          :folder="currentFolder"
          :display-uploading-files="displayUploadingFiles"
          :download-disabled="action_permission?.enable_download === false"
          :upload-disabled="action_permission?.enable_upload === false"
          @open-folder="handleFolderOpen"
          @download-file="handleDownloadFile"
          @upload-file="handleUploadFile"
          @remove-upload-file="handleRemoveFile"
        />

        <SessionShare
          v-else-if="currentTab === 'share-collaboration' && sessionObject"
          :session="sessionObject.id"
          :users="onlineUsers"
          :disable-create="!enableShare"
          :endpoint-url="endpointUrl"
          :token-id="activeToken"
          :ticket="activeTicket"
        />
      </div>
    </template>
  </USlideover>
</template>
