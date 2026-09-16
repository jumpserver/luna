<script setup lang="ts">
import { useUserInfoStore } from "~/store/modules/userInfo";

const router = useRouter();
const localePath = useLocalePath();
const { t } = useI18n();
const { isMacOS } = usePlatform();
const { activeWorkspaceMode } = useWorkspaceMode();
const userInfoStore = useUserInfoStore();
const { loggedIn } = storeToRefs(userInfoStore);
const { exitFocusMode, focusMode, tabs, workspaceFullscreen } = useWorkspaceTabs();
const hasMacTrafficLightInset = computed(() => isDesktopRuntime() && isMacOS.value);
const showWorkspaceHeader = computed(() => !focusMode.value);
const isToolRoute = computed(() => {
  const path = router.currentRoute.value.path.toLowerCase();
  return (
    path.includes("/tools") ||
    path.includes("/videoplayer") ||
    path.includes("/transcode") ||
    (path.includes("/face") && !path.includes("/facelive"))
  );
});
const showSidebarChrome = computed(() => loggedIn.value && !isToolRoute.value);
const showAssetTabs = computed(
  () => activeWorkspaceMode.value === "assets" && (loggedIn.value || tabs.value.length > 0)
);

const returnFromTool = async () => {
  if (!loggedIn.value) {
    await navigateTo(localePath({ path: "/" }));
    return;
  }

  const previousPath = router.options.history.state.back;
  if (typeof previousPath === "string" && previousPath) {
    router.back();
    return;
  }

  await navigateTo(localePath({ path: "/" }));
};

const pageHeader = computed(() => {
  const path = router.currentRoute.value.path.toLowerCase();

  if (path.includes("/videoplayer")) {
    return {
      icon: "lucide:clapperboard",
      title: t("Menu.Player")
    };
  }

  if (path.includes("/tools")) {
    return {
      icon: "lucide:menu",
      title: t("Menu.Tool")
    };
  }

  if (path.includes("/transcode")) {
    return {
      icon: "lucide:repeat-2",
      title: t("Transcode.Title")
    };
  }

  if (path.includes("/face") && !path.includes("/facelive")) {
    return {
      icon: "lucide:scan-face",
      title: t("Menu.Face")
    };
  }

  return null;
});
</script>

<template>
  <div>
    <HeaderDesktopTitleBar />
    <div
      v-if="hasMacTrafficLightInset && !showWorkspaceHeader && !workspaceFullscreen"
      data-desktop-drag-region
      class="flex h-10 min-h-10 shrink-0 items-center justify-end bg-[var(--app-surface-canvas)] pr-2"
    >
      <UButton
        v-if="focusMode"
        color="neutral"
        variant="ghost"
        size="xs"
        icon="i-lucide-minimize-2"
        data-desktop-drag-region="false"
        :label="t('TabMenu.ExitFocusMode')"
        :title="t('TabMenu.ExitFocusModeHint')"
        @click="exitFocusMode"
      />
    </div>
    <WorkspaceTopHeader v-show="showWorkspaceHeader">
      <template v-if="showSidebarChrome" #leading>
        <SideBarTopControls />
      </template>
      <template v-else-if="pageHeader" #leading>
        <div class="flex h-full items-center" :class="hasMacTrafficLightInset ? 'pl-[88px] pr-2' : 'px-2.5'">
          <UTooltip arrow :text="t('ToolTips.Back')">
            <UButton
              icon="i-lucide-arrow-left"
              :aria-label="t('ToolTips.Back')"
              color="neutral"
              variant="ghost"
              size="sm"
              :ui="{ leadingIcon: 'size-4' }"
              @click="returnFromTool"
            />
          </UTooltip>
        </div>
      </template>

      <WorkspaceTabHeader
        v-if="showAssetTabs"
        :class="hasMacTrafficLightInset && !showSidebarChrome ? 'pl-[88px]' : undefined"
      />

      <div v-else-if="pageHeader" class="relative h-full min-w-0 flex items-center justify-center px-10">
        <div class="flex min-w-0 items-center justify-center gap-2">
          <UIcon :name="pageHeader.icon" class="text-primary size-4 shrink-0" />
          <span class="min-w-0 truncate text-sm font-medium">
            {{ pageHeader.title }}
          </span>
        </div>
      </div>
    </WorkspaceTopHeader>
  </div>
</template>
