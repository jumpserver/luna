<script setup lang="ts">
import type { ClientPolicyNotice, LangType } from "~/types";
import { clientNoticeOverlay } from "~/shared/desktop/bridge";

definePageMeta({ layout: false });
const bridge = clientNoticeOverlay();
const notices = shallowRef<ClientPolicyNotice[]>([]);
const { setLocale } = useI18n();
let unlisten: (() => void) | undefined;
onMounted(() => {
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
  unlisten = bridge?.listen((snapshot) => {
    const appearance = snapshot.appearance;
    if (appearance) {
      const root = document.documentElement;
      root.classList.toggle("dark", appearance.dark);
      root.style.colorScheme = appearance.dark ? "dark" : "light";
      root.style.fontFamily = appearance.fontFamily;
      root.style.fontSize = appearance.fontSize;
      for (const [name, value] of Object.entries(appearance.variables)) root.style.setProperty(name, value);
    }
    void setLocale(snapshot.locale as LangType);
    notices.value = snapshot.notices;
  });
});
onBeforeUnmount(() => unlisten?.());
</script>

<template>
  <ClientPolicyNotices embedded :notices="notices" @dismiss="bridge?.dismiss($event)" />
</template>
