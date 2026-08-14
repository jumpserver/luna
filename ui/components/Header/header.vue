<script setup lang="ts">
import { useUserInfoStore } from "~/store/modules/userInfo";

const router = useRouter();
const { t } = useI18n();
const { isMacOS } = usePlatform();
const { activeWorkspaceMode } = useWorkspaceMode();
const userInfoStore = useUserInfoStore();
const { loggedIn } = storeToRefs(userInfoStore);
const isToolRoute = computed(() => {
  const path = router.currentRoute.value.path.toLowerCase();
  return path.includes("/tools") || path.includes("/videoplayer") || path.includes("/transcode");
});

const showSidebarChrome = computed(
  () => !isToolRoute.value && (activeWorkspaceMode.value !== "assets" || loggedIn.value || isTauriRuntime())
);
const toolWindowTitleClass = computed(() => {
  if (!(isMacOS.value && router.currentRoute.value.query.tool_window === "1")) {
    return "px-4";
  }

  return "pl-[84px] pr-4";
});

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
  <WorkspaceTopHeader>
    <template v-if="showSidebarChrome" #leading>
      <SideBarTopControls />
    </template>

    <WorkspaceTabHeader v-if="activeWorkspaceMode === 'assets'" />

    <div
      v-else-if="pageHeader"
      class="h-full min-w-0 flex items-center justify-center gap-2"
      :class="toolWindowTitleClass"
    >
      <UIcon :name="pageHeader.icon" class="text-primary h-4 w-4 shrink-0" />
      <span class="min-w-0 truncate text-sm font-medium">
        {{ pageHeader.title }}
      </span>
    </div>
  </WorkspaceTopHeader>
</template>
