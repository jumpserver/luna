<script setup lang="ts">
import type { ClientNoticeAppearance, ClientPolicyNotice } from "~/types";
import { useElementSize, useMutationObserver } from "@vueuse/core";
import { desktopInvoke, desktopListen } from "~/shared/desktop/bridge";
import { formatClientLoginTimestamp } from "~/utils/clientLoginPolicy";
import { isElectronRuntime } from "~/utils/runtime";

const props = withDefaults(defineProps<{ notices: ClientPolicyNotice[]; embedded?: boolean }>(), { embedded: false });
const emit = defineEmits<{ dismiss: [id: string] }>();
const { t, locale } = useI18n();
const noticeArea = useTemplateRef<HTMLElement>("noticeArea");
const { width, height } = useElementSize(noticeArea);
const { bottom: bottomOffset, policyHeight } = useNotificationOffsets();
watch(
  height,
  (value) => {
    if (!props.embedded) policyHeight.value = value;
  },
  { immediate: true }
);
const desktop = isElectronRuntime() && !props.embedded;
const nativeOverlay = ref(false);
const appearance = shallowRef<ClientNoticeAppearance>();
let sentAppearance: ClientNoticeAppearance | undefined;
const unlisten: Array<() => void> = [];

function readAppearance() {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  appearance.value = {
    dark: root.classList.contains("dark"),
    variables: Object.fromEntries(
      [...style].filter((name) => name.startsWith("--")).map((name) => [name, style.getPropertyValue(name)])
    ),
    fontFamily: style.fontFamily,
    fontSize: style.fontSize
  };
}

async function updateNative() {
  if (!desktop) return;
  try {
    const shown = await desktopInvoke<boolean>("client_policy_notice_overlay", {
      ids: props.notices.map((notice) => notice.id),
      width: width.value,
      height: height.value,
      bottom: bottomOffset.value,
      locale: locale.value,
      ...(appearance.value !== sentAppearance ? { appearance: appearance.value } : {})
    });
    nativeOverlay.value = shown;
    if (shown) sentAppearance = appearance.value;
  } catch (error) {
    nativeOverlay.value = false;
    console.warn("Client notice overlay is unavailable", error);
  }
}

watch([() => props.notices, width, height, bottomOffset, locale, appearance], () => void updateNative(), {
  flush: "post"
});
useMutationObserver(() => (desktop ? document.documentElement : undefined), readAppearance, {
  attributes: true,
  attributeFilter: ["class", "style"]
});
onMounted(async () => {
  if (!desktop) return;
  readAppearance();
  unlisten.push(await desktopListen<string>("client-policy-notice-dismiss", ({ payload }) => emit("dismiss", payload)));
  unlisten.push(await desktopListen("client-policy-notice-layer", () => void updateNative()));
  void updateNative();
});
onBeforeUnmount(() => {
  if (!props.embedded) policyHeight.value = 0;
  for (const stop of unlisten) stop();
  if (desktop) void desktopInvoke("client_policy_notice_overlay", { ids: [] });
});
const messages = {
  absolute_timeout: "ClientLock.LifetimeSoon",
  policy_changed: "ClientLock.PolicyChangedSoon",
  idle_lock: "ClientLock.IdleSoon"
};
</script>

<template>
  <aside
    v-if="notices.length"
    ref="noticeArea"
    class="z-[450] flex flex-col gap-4 overflow-y-auto"
    :class="[
      embedded ? 'max-h-screen w-full' : 'fixed right-4 w-96 max-w-[calc(100vw-2rem)]',
      { invisible: nativeOverlay }
    ]"
    :style="embedded ? undefined : { bottom: `${bottomOffset}px`, maxHeight: `calc(100vh - ${bottomOffset + 16}px)` }"
    aria-live="polite"
  >
    <UCard
      v-for="notice in notices"
      :key="notice.id"
      :ui="{ root: 'app-notification-card ring-0', body: 'p-4 sm:p-4' }"
    >
      <div class="flex items-start gap-2.5">
        <UIcon name="i-lucide-clock-alert" class="mt-0.5 size-5 shrink-0 text-warning" />
        <p class="flex-1 text-sm">
          {{
            t(messages[notice.kind], {
              at: formatClientLoginTimestamp(notice.at, locale),
              seconds: notice.remainingSeconds
            })
          }}
        </p>
        <UButton
          v-if="notice.kind !== 'idle_lock'"
          icon="i-lucide-x"
          color="neutral"
          variant="link"
          size="xs"
          class="size-6 shrink-0 justify-center p-0 text-muted hover:text-highlighted"
          :aria-label="t('Common.Close')"
          @click="$emit('dismiss', notice.id)"
        />
      </div>
    </UCard>
  </aside>
</template>
