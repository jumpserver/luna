<script lang="ts" setup>
import { useWarmupSetting } from "@/composables/useWarmupSetting";

useApplicationConfig();

const LOCALE_PREFIX_RE = /^\/[a-z]{2}(?:-[A-Z]{2})?(?=\/|$)/;

import { h, ref, resolveComponent } from "vue";

const route = useRoute();
const toast = useToast();
const { t } = useI18n();
const { userTheme } = useThemeAdapter();
const { isMacOS } = usePlatform();

const backgroundColor = computed(() => {
  const isDark = userTheme.value === "dark";

  // 只在 macOS 下设置透明度
  if (isMacOS.value) {
    return isDark ? "rgba(30, 30, 30, 0.6)" : "rgba(240, 240, 240, 0.4)";
  } else {
    // Windows 和其他平台使用不透明的背景色
    return isDark ? "rgb(30, 30, 30)" : "rgb(240, 240, 240)";
  }
});

const pageKey = computed(() => route.path.replace(LOCALE_PREFIX_RE, ""));

const platformClass = computed(() => {
  const platformKey = isMacOS.value ? "darwin" : "windows";
  return `platform-${platformKey}`;
});

// 因为 <Body> 是一个虚拟组件，底层并不会响应 Vue 的 :style 绑定。它的作用是把插槽内容插入到真正的 <body> 中，但自身不是一个响应式桥梁。
useHead({
  bodyAttrs: {
    class: computed(() => platformClass.value),
    style: computed(
      () => `
    background-color: ${backgroundColor.value};
  `
    )
  }
});

onMounted(async () => {
  try {
    await useWarmupSetting();

    const upd = await useTauriUpdaterCheck();

    if (upd) {
      const confirmed = window.confirm(
        `${t("Update.FoundNewVersion")} ${upd.version}, ${t("Update.CurrentVersion")} ${upd.currentVersion}。\n${t("Update.ConfirmInstall")}`
      );

      if (!confirmed) {
        await upd.close();
        return;
      }

      try {
        let total = 0;
        let received = 0;
        const progress = ref(0);

        const progressToastId = "tauri-update-progress";
        const UProgressComp = resolveComponent("UProgress") as any;
        let lastPercent = -1;
        let lastTime = 0;

        toast.add({
          id: progressToastId,
          title: t("Update.Downloading"),
          description: () =>
            h("div", { class: "flex flex-col gap-1 w-56" }, [
              h("div", { class: "text-xs opacity-70" }, () => `${progress.value}%`),
              h(UProgressComp, { modelValue: progress.value, value: progress.value, max: 100 })
            ]),
          color: "primary",
          icon: "i-lucide-download"
        });

        await upd.downloadAndInstall((ev) => {
          if (ev.event === "Started") {
            total = ev.data?.contentLength || 0;
          } else if (ev.event === "Progress") {
            received += ev.data?.chunkLength || 0;
            const percent = total ? Math.min(100, Math.round((received / total) * 100)) : 0;
            progress.value = percent;

            // 仅在增量 >=5% 或 500ms 间隔 或 100% 时更新一次
            const now = Date.now();
            if (percent === 100 || percent - lastPercent >= 5 || now - lastTime >= 500) {
              lastPercent = percent;
              lastTime = now;
              toast.add({
                id: progressToastId,
                title: t("Update.Downloading"),
                description: () =>
                  h("div", { class: "flex flex-col gap-1 w-56" }, [
                    h("div", { class: "text-xs opacity-70" }, () => `${progress.value}%`),
                    h(UProgressComp, {
                      modelValue: progress.value,
                      value: progress.value,
                      max: 100
                    })
                  ]),
                color: "primary",
                icon: "i-lucide-download"
              });
            }
          }
        });

        toast.add({
          id: progressToastId,
          title: t("Update.Completed"),
          description: t("Update.CompletedDesc"),
          color: "success",
          icon: "line-md:check-all"
        });
      } catch (e) {
        toast.add({
          id: "tauri-update-progress",
          title: t("Update.Failed"),
          description: t("Update.FailedDesc"),
          color: "error",
          icon: "line-md:close-circle"
        });
      } finally {
        await upd.close();
      }
    }
  } catch (error) {
    console.error(error);
  }
});
</script>

<template>
  <Html class="overflow-x-hidden overflow-y-hidden">
    <Body class="font-sans antialiased h-screen w-screen">
      <UApp>
        <NuxtLayout>
          <NuxtPage :page-key="pageKey" />
        </NuxtLayout>
      </UApp>
    </Body>
  </Html>
</template>
