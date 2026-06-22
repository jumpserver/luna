<script setup lang="ts">
import type { UnlistenFn } from "@tauri-apps/api/event";

definePageMeta({
  layout: "auth"
});

const toast = useToast();
const route = useRoute();
const localePath = useLocalePath();

const { t } = useI18n();
const { userTheme } = useThemeAdapter();

const url = ref<string | null>((route.query.auth_url as string) || null);
const unlistenAuth = ref<UnlistenFn | null>(null);
const didCancel = ref(false);

const cardBgClass = computed(() =>
  userTheme.value === "dark"
    ? "bg-[#111112] border-gray-800 shadow-black/30"
    : "bg-white border-gray-100 shadow-black/5"
);
const headingClass = computed(() => (userTheme.value === "dark" ? "text-gray-50" : "text-gray-900"));
const subTextClass = computed(() => (userTheme.value === "dark" ? "text-gray-300" : "text-gray-600"));

const cancelAuthFlow = () => {
  if (didCancel.value) return;
  didCancel.value = true;
  void useTauriCoreInvoke("auth_cancel", {}).catch((error) => {
    console.debug("auth_cancel failed:", error);
  });
};

const back = () => {
  cancelAuthFlow();
  navigateTo({
    path: localePath({ path: "/" })
  });
};

const handleCopyUrl = () => {
  if (url.value && typeof url.value === "string") {
    useTauriClipboardManagerWriteText(url.value).then(() => {
      toast.add({
        title: t("Auth.CopySuccess"),
        color: "primary",
        icon: "line-md:check-all",
        progress: false,
        duration: 1000
      });
    });
  }
};

const handleOpenManually = () => {
  if (url.value && typeof url.value === "string") {
    useTauriOpenerOpenUrl(url.value);
  }
};

onMounted(async () => {
  unlistenAuth.value = await useTauriEventListen("auth_url", (event) => {
    const payload = (event?.payload || "").toString();
    if (payload) {
      url.value = payload;
    }
  });
});

onBeforeUnmount(() => {
  if (unlistenAuth.value) unlistenAuth.value();
});
</script>

<template>
  <div class="flex flex-col items-center justify-center px-6 py-10 h-full">
    <div class="flex flex-col items-center gap-6 rounded-3xl px-8 py-10 w-full max-w-xl border" :class="cardBgClass">
      <div class="flex flex-col items-center gap-3">
        <img src="/logo.png" alt="logo" class="w-16 h-16 rounded-2xl">
      </div>

      <section class="text-center space-y-4 w-full">
        <div class="p-4">
          <h1 class="text-2xl font-semibold leading-snug" :class="headingClass">
            {{ t("Auth.SignInTitle") }}
          </h1>
        </div>

        <p class="text-sm leading-relaxed" :class="subTextClass">
          {{ t("Auth.BrowserHintPrefix") }}

          <a class="text-primary hover:underline font-medium" href="javascript:void(0)" @click="handleOpenManually">
            {{ t("Auth.OpenManually") }}
          </a>
          {{ t("Auth.Or") }}
          <a class="text-primary hover:underline font-medium" href="javascript:void(0)" @click="handleCopyUrl">
            {{ t("Auth.CopyUrl") }}
          </a>
        </p>

        <UButton color="neutral" variant="link" class="font-semibold text-gray-300" @click="back">
          {{ t("Auth.Back") }}
        </UButton>
      </section>
    </div>
  </div>
</template>
