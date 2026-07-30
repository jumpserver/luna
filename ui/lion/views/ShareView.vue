<script lang="ts" setup>
import { useDebounceFn, useWindowSize } from "@vueuse/core";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { getShareSession } from "@/lion/api/index";
import Osk from "@/lion/components/Osk.vue";
import SessionShare from "@/lion/components/SessionShare/index.vue";
import { useGuacamoleClient } from "@/lion/hooks/useGuacamoleClient";
import { withLionWsUrl } from "@/lion/utils/base";

const { width, height } = useWindowSize();
const { addErrorToast } = useErrorToast();
const { t } = useI18n();
const route = useRoute();
const wsUrl = withLionWsUrl("/ws/share/");
const verifyValue = ref<string>("");
const showModal = ref<boolean>(true);
const shareCode = ref<string>("");
const readonly = ref<boolean>(false);
const errMessage = ref<string>("");
const showOsk = ref<boolean>(false);
const keyboardLayout = ref<string>("default");
const drawShow = ref<boolean>(false);
const sessionObject = ref<Record<string, any>>({});
const connectStatus = ref<string>("Connecting...");
const shareId = (route.params as Record<string, string>).id || "";

const { connectToGuacamole, guaDisplay, loading, onlineUsersMap, registerMouseAndKeyboardHanlder, resizeGuaScale }
  = useGuacamoleClient(t);

const debouncedResize = useDebounceFn(() => {
  resizeGuaScale(width.value, height.value);
}, 300);

watch([width, height], () => debouncedResize(), { immediate: true });

const onlineUsers = computed(() => Object.values(onlineUsersMap.value).filter(Boolean));

const onFinish = () => {
  shareCode.value = verifyValue.value;
  nextTick(() => {
    showModal.value = false;
    connectShareSession(shareCode.value);
  });
};

const handleKeyUp = (event: KeyboardEvent) => {
  if (event.key === "Enter") onFinish();
};

function connectShareSession(code: string) {
  getShareSession(shareId, { code })
    .then((response: any) => response.json())
    .then((res) => {
      if (res.message && !res.success) {
        addErrorToast({ title: res.message || t("ShareSessionError") });
        loading.value = false;
        errMessage.value = res.message || t("ShareSessionError");
        return;
      }

      readonly.value = res.action_permission?.value === "readonly";
      const shareParams = {
        type: "share",
        SESSION_ID: res.session.id,
        SHARE_ID: shareId,
        RECORD_ID: res.id,
        Writable: readonly.value ? "false" : "true"
      };

      connectToGuacamole(wsUrl, shareParams, window.innerWidth, window.innerHeight);
      const displayEl = document.getElementById("display");
      if (displayEl) displayEl.appendChild(guaDisplay.value.getElement());
      if (!readonly.value) registerMouseAndKeyboardHanlder();
    })
    .catch((error) => {
      addErrorToast({ title: error.message || t("ShareSessionError") });
    });
}

const handleScreenKeyboard = (layout: string) => {
  keyboardLayout.value = layout;
  showOsk.value = true;
};

onMounted(() => {
  if (route.query.code) {
    shareCode.value = route.query.code as string;
    showModal.value = false;
    nextTick(() => connectShareSession(shareCode.value));
  }
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
          @keyup="handleKeyUp"
        />
        <template #footer>
          <UButton block @click="onFinish">
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

    <div v-show="!loading && !errMessage" id="display" class="relative flex h-screen w-screen justify-center" />

    <Osk v-if="showOsk" :keyboard="keyboardLayout" @keyboard-change="handleScreenKeyboard" />
    <p v-if="errMessage" class="text-center text-error">
      {{ errMessage }}
    </p>
  </div>

  <USlideover v-model:open="drawShow" :ui="{ content: 'w-full max-w-[502px]' }">
    <template #body>
      <SessionShare v-if="sessionObject" :session="sessionObject.id" :users="onlineUsers" :disable-create="true" />
    </template>
  </USlideover>
</template>
