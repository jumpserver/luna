<script setup lang="ts">
import { useUserInfoStore } from "~/store/modules/userInfo";

const router = useRouter();
const { t } = useI18n();
const { isMacOS } = usePlatform();
const { activeWorkspaceMode } = useWorkspaceMode();
const userInfoStore = useUserInfoStore();
const { loggedIn } = storeToRefs(userInfoStore);
const hasMacTrafficLightInset = computed(() => isDesktopRuntime() && isMacOS.value);
const isToolRoute = computed(() => {
  const path = router.currentRoute.value.path.toLowerCase();
  return path.includes("/tools") || path.includes("/videoplayer") || path.includes("/transcode");
});

const showSidebarChrome = computed(
  () => !isToolRoute.value && (activeWorkspaceMode.value !== "assets" || loggedIn.value || isDesktopRuntime())
);

const returnFromTool = async () => {
  const previousPath = router.options.history.state.back;
  if (typeof previousPath === "string" && previousPath) {
    router.back();
    return;
  }

  await navigateTo("/");
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

  return null;
});
</script>

<template>
  <div>
    <HeaderDesktopTitleBar />
    <WorkspaceTopHeader>
      <template v-if="showSidebarChrome" #leading>
        <SideBarTopControls />
      </template>

      <WorkspaceTabHeader v-if="activeWorkspaceMode === 'assets'" />

      <div v-else-if="pageHeader" class="relative h-full min-w-0 flex items-center justify-center px-10">
        <UTooltip arrow :text="t('ToolTips.Back')">
          <UButton
            icon="i-lucide-arrow-left"
            :aria-label="t('ToolTips.Back')"
            color="neutral"
            variant="ghost"
            size="sm"
            class="absolute top-1/2 -translate-y-1/2"
            :class="hasMacTrafficLightInset ? 'left-24' : 'left-1'"
            :ui="{ leadingIcon: 'size-4' }"
            @click="returnFromTool"
          />
        </UTooltip>

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
