<script lang="ts" setup>
import { useDebounceFn, useWindowSize } from "@vueuse/core";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { getShareSession } from "@/lion/api/index";
import SessionShare from "@/lion/components/SessionShare/index.vue";
import { useGuacamoleClient } from "@/lion/hooks/useGuacamoleClient";
import { createLionConnectTicket } from "@/lion/hooks/useLionConnectTicket";
import { useLionEndpoint } from "@/lion/hooks/useLionEndpoint";
import { LUNA_MESSAGE_TYPE } from "@/lion/types/postmessage.type";
import { withLionWsUrl } from "@/lion/utils/base";
import { lunaCommunicator } from "@/lion/utils/lunaBus";

const { width, height } = useWindowSize();
const { addErrorToast } = useErrorToast();
const { t } = useI18n();
const route = useRoute();
const endpointUrl = useLionEndpoint();
const wsUrl = computed(() => withLionWsUrl("/ws/share/", endpointUrl.value));
const displayRef = ref<HTMLElement | null>(null);
const verifyValue = ref<string>("");
const showModal = ref<boolean>(true);
const shareCode = ref<string>("");
const readonly = ref<boolean>(false);
const errMessage = ref<string>("");
const drawShow = ref<boolean>(false);
const sessionObject = ref<Record<string, any>>({});
const authTicket = ref("");
const verificationLoading = ref(false);
const shareId = (route.params as Record<string, string>).id || "";
let connectGeneration = 0;
let disposed = false;

const {
  connectToGuacamole,
  connectStatus,
  debouncedSendClipboardToRemote,
  disconnectGuaclient,
  guaDisplay,
  loading,
  onlineUsersMap,
  registerMouseAndKeyboardHanlder,
  resizeGuaScale,
  sendInputActive
} = useGuacamoleClient(t, endpointUrl);

const debouncedResize = useDebounceFn(() => {
  resizeGuaScale(width.value, height.value);
}, 300);

watch([width, height], () => debouncedResize(), { immediate: true });

const onlineUsers = computed(() => Object.values(onlineUsersMap.value).filter(Boolean));

const handleLunaOpen = () => {
  drawShow.value = !drawShow.value;
};

const onFinish = () => {
  if (verificationLoading.value) return;
  shareCode.value = verifyValue.value.trim();
  if (!shareCode.value) return;
  nextTick(() => {
    if (disposed) return;
    showModal.value = false;
    void connectShareSession(shareCode.value);
  });
};

const handleKeyUp = (event: KeyboardEvent) => {
  if (event.key === "Enter") onFinish();
};

async function connectShareSession(code: string) {
  const generation = ++connectGeneration;
  verificationLoading.value = true;
  errMessage.value = "";
  window.removeEventListener("focus", debouncedSendClipboardToRemote);
  try {
    authTicket.value = await createLionConnectTicket(endpointUrl.value);
    if (disposed || generation !== connectGeneration) return;
    const res = await getShareSession(shareId, { code }, endpointUrl.value, { ticket: authTicket.value });
    if (disposed || generation !== connectGeneration) return;
    if (res.message && !res.success) {
      addErrorToast({ title: res.message || t("ShareSessionError") });
      loading.value = false;
      errMessage.value = res.message || t("ShareSessionError");
      return;
    }

    readonly.value = res.action_permission?.value === "readonly";
    sessionObject.value = res.session || {};
    if (!res.id || !res.session?.id) {
      throw new Error(t("ShareSessionError"));
    }
    const shareParams = {
      type: "share",
      SESSION_ID: res.session.id,
      SHARE_ID: shareId,
      RECORD_ID: res.id,
      Writable: readonly.value ? "false" : "true",
      ...(authTicket.value ? { ticket: authTicket.value } : {})
    };

    connectToGuacamole(wsUrl.value, shareParams, window.innerWidth, window.innerHeight);
    const displayEl = displayRef.value;
    if (displayEl) displayEl.appendChild(guaDisplay.value.getElement());
    if (!readonly.value) {
      registerMouseAndKeyboardHanlder();
      window.addEventListener("focus", debouncedSendClipboardToRemote);
    }
  } catch (error) {
    if (disposed || generation !== connectGeneration) return;
    loading.value = false;
    const message = error instanceof Error ? error.message : t("ShareSessionError");
    errMessage.value = message || t("ShareSessionError");
    addErrorToast({ title: message || t("ShareSessionError") });
  } finally {
    if (generation === connectGeneration) verificationLoading.value = false;
  }
}

onMounted(() => {
  lunaCommunicator.onLuna(LUNA_MESSAGE_TYPE.OPEN, handleLunaOpen);
  lunaCommunicator.onLuna(LUNA_MESSAGE_TYPE.INPUT_ACTIVE, sendInputActive);
  if (route.query.code) {
    shareCode.value = route.query.code as string;
    showModal.value = false;
    nextTick(() => {
      if (!disposed) void connectShareSession(shareCode.value);
    });
  }
});

onUnmounted(() => {
  disposed = true;
  connectGeneration += 1;
  window.removeEventListener("focus", debouncedSendClipboardToRemote);
  lunaCommunicator.offLuna(LUNA_MESSAGE_TYPE.OPEN, handleLunaOpen);
  lunaCommunicator.offLuna(LUNA_MESSAGE_TYPE.INPUT_ACTIVE, sendInputActive);
  disconnectGuaclient();
});
</script>

<template>
  <UModal v-model:open="showModal" :dismissible="false">
    <template #content>
      <UCard>
        <template #header>
          <span class="font-medium">{{ t("VerifyCode") }}</span>
        </template>
        <UInput
          v-model="verifyValue"
          size="lg"
          maxlength="4"
          :placeholder="t('InputVerifyCode')"
          :disabled="verificationLoading"
          @keyup="handleKeyUp"
        />
        <template #footer>
          <UButton block :loading="verificationLoading" @click="onFinish">
            {{ t("Confirm") }}
          </UButton>
        </template>
      </UCard>
    </template>
  </UModal>

  <div v-if="!showModal" class="flex h-full w-full flex-col justify-center">
    <div v-if="loading" class="flex h-screen w-screen items-center justify-center">
      <div class="flex flex-col items-center gap-2 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" />
        <span>{{ t("Connecting") }}: {{ connectStatus }}</span>
      </div>
    </div>

    <div
      v-show="!loading && !errMessage"
      ref="displayRef"
      class="relative flex h-full w-full justify-center"
      @contextmenu.prevent
    />

    <p v-if="errMessage" class="text-center text-error">
      {{ errMessage }}
    </p>
  </div>

  <USlideover v-model:open="drawShow" :ui="{ content: 'w-full max-w-[502px]' }">
    <template #body>
      <SessionShare
        v-if="sessionObject.id"
        :session="sessionObject.id"
        :users="onlineUsers"
        :disable-create="true"
        :endpoint-url="endpointUrl"
        :ticket="authTicket"
      />
    </template>
  </USlideover>
</template>
