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
import { LUNA_MESSAGE_TYPE } from "@/lion/types/postmessage.type";
import { withLionWsUrl } from "@/lion/utils/base";
import { readClipboardText } from "@/lion/utils/clipboard";
import { getCurrentConnectParams } from "@/lion/utils/common";
import { lunaCommunicator } from "@/lion/utils/lunaBus";
import { ErrorStatusCodes } from "@/lion/utils/status";

const toast = useToast();
const { addErrorToast } = useErrorToast();
const { t } = useI18n();
const containerRef = ref<HTMLElement | null>(null);
const sessionContext = inject(connectorSessionKey, ref<ConnectorSessionContext | null>(null));

const {
  guaDisplay,
  connectToGuacamole,
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
  fileFsLoading,
  currentGuacFsObject,
  enableShare,
  action_permission,
  remoteClipboardText,
  sendInputActive
} = useGuacamoleClient(t);

const drawShow = ref(false);
const connectStatus = ref("Connecting");
const autoFit = ref<boolean>(true);

const resolveContainerSize = () => {
  const rect = containerRef.value?.getBoundingClientRect();
  return {
    width: Math.max(Math.floor(rect?.width || window.innerWidth), 640),
    height: Math.max(Math.floor(rect?.height || window.innerHeight), 480)
  };
};

const debouncedResize = useDebounceFn(() => {
  const { width, height } = resolveContainerSize();
  resizeGuaScale(width, height);
  if (!autoFit.value) return;
  sendGuaSize(width, height);
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

function getKeyboardLayout() {
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

const handleUploadFile = (options: LionUploadCustomRequestOptions, folder: any) => {
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
  displayUploadingFiles.value = displayUploadingFiles.value.filter((f) => f.name !== file.name);
};

async function processUploadQueue() {
  while (isUploading.value && uploadingFiles.value.length > 0) {
    const uploadItem = uploadingFiles.value.shift();
    if (!uploadItem?.uploadOptions) continue;
    const { uploadOptions, folder } = uploadItem;

    try {
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
    } finally {
      setTimeout(handleRemoveFile, 5000, uploadOptions.file);
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
    handleUploadFile(
      {
        file: {
          id: `batch-id-${fileObj.name}`,
          name: fileObj.name,
          batchId: `batch-id-${fileObj.name}`,
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

const debouncedSendClipboardToRemote = useDebounceFn(async () => {
  const text = await readClipboardText();
  if (!text?.trim()) return;
  sendTextToRemote(text);
}, 300);

const resolveConnectConfig = () => {
  const ctx = unref(sessionContext);
  if (ctx?.tokenId) {
    return {
      // ponytail: lion 走 Guacamole connect 参数 TOKEN_ID，不用 koko 的 ?token= WS 查询串
      ws: withLionWsUrl("/ws/connect/"),
      token: ctx.tokenId
    };
  }

  const params = getCurrentConnectParams();
  return {
    ws: params.ws || "",
    token: params.data.token || ""
  };
};

onMounted(async () => {
  loading.value = true;
  await nextTick();

  lunaCommunicator.onLuna(LUNA_MESSAGE_TYPE.OPEN, () => {
    nextTick(() => {
      drawShow.value = !drawShow.value;
    });
  });
  lunaCommunicator.onLuna(LUNA_MESSAGE_TYPE.INPUT_ACTIVE, () => {
    nextTick(() => sendInputActive());
  });

  const { ws, token } = resolveConnectConfig();
  const { width, height } = resolveContainerSize();
  connectToGuacamole(
    ws,
    {
      TOKEN_ID: encodeURIComponent(token),
      GUAC_KEYBOARD: keyboardLayout.value
    },
    width,
    height,
    true
  );

  const displayEl = document.getElementById("display");
  if (!displayEl) {
    console.error("Display element not found");
    return;
  }
  displayEl.appendChild(guaDisplay.value.getElement());

  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => debouncedResize());
    resizeObserver.observe(containerRef.value);
    debouncedResize();
  }

  displayEl.addEventListener(
    "dragenter",
    (e) => {
      e.stopPropagation();
      e.preventDefault();
    },
    false
  );
  displayEl.addEventListener(
    "dragover",
    (e) => {
      e.stopPropagation();
      e.preventDefault();
    },
    false
  );
  displayEl.addEventListener("drop", fileDrop, false);

  registerMouseAndKeyboardHanlder();
  window.addEventListener("focus", debouncedSendClipboardToRemote);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  disconnectGuaclient();
  lunaCommunicator.offLuna(LUNA_MESSAGE_TYPE.OPEN);
  lunaCommunicator.sendLuna(LUNA_MESSAGE_TYPE.CLOSE, "");
  window.removeEventListener("focus", debouncedSendClipboardToRemote);
});

const ClipBoardTextChange = (text: string) => {
  if (!text?.trim()) return;
  sendTextToRemote(text);
};

document.addEventListener(
  "contextmenu",
  (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  },
  false
);

const handleScreenKeyboard = (name: string, keysym: any) => {
  if (name === "keydown") sendKeyEvent(1, keysym);
  else if (name === "keyup") sendKeyEvent(0, keysym);
};

const handleDownloadFile = (file: GuacamoleFile) => {
  if (!file?.streamName) return;
  if (action_permission.value && !action_permission.value.enable_download) {
    toast.add({ title: t("FileDownloadDenied"), color: "warning" });
    return;
  }
  currentGuacFsObject.value.requestInputStream(file.streamName, (stream: any, mimetype: any) => {
    clientFileReceived(stream, mimetype, file.name);
  });
};

const fitPercentage = computed(() => Math.floor(scale.value * 100));

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
      id="display"
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
            :remote-text="remoteClipboardText"
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
        />
      </div>
    </template>
  </USlideover>
</template>
