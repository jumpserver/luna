import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";

/**
 * 将当前 i18n locale 和语言变化广播给其他窗口。
 */
export const useLocaleBroadcaster = () => {
  const { locale } = useI18n();
  const currentLocale = computed(() => (locale.value || "zh").toString());
  let unlisten: Awaited<ReturnType<typeof useTauriEventListen>> | null = null;
  const suppressNextBroadcast = ref(false);

  const broadcast = (code: string) => {
    try {
      useTauriEventEmit("language-changed", { code });
    } catch {}
  };

  onMounted(async () => {
    // 主动向其他窗口广播一次当前语言，避免新窗口初始状态不同步
    broadcast(currentLocale.value);

    // 监听其他窗口发来的语言更新
    try {
      unlisten = await useTauriEventListen("language-changed", (event: any) => {
        const code = (event?.payload?.code || event?.payload || "").toString();
        if (!code) return;
        if (code === currentLocale.value) return;
        suppressNextBroadcast.value = true;
        locale.value = code as any;
      });
    } catch {}
  });

  watch(
    () => currentLocale.value,
    (code) => {
      if (!code) return;
      if (suppressNextBroadcast.value) {
        suppressNextBroadcast.value = false;
        return;
      }
      broadcast(code);
    },
    { immediate: true }
  );

  onBeforeUnmount(() => {
    if (unlisten) {
      unlisten();
      unlisten = null;
    }
  });

  return {
    broadcastLanguage: broadcast,
    currentLocale
  };
};
