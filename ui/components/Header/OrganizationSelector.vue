<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { PermOrgItem } from "~/types/index";

import { useUserInfoStore } from "~/store/modules/userInfo";

withDefaults(
  defineProps<{
    selectable?: boolean;
  }>(),
  {
    selectable: true
  }
);

const userInfoStore = useUserInfoStore();
const { setCurrentOrg } = userInfoStore;
const { loggedIn, currentOrganizations, currentUser } = storeToRefs(userInfoStore);

const currentOrg = ref<string>("");

const organizationDropdownItems = computed<DropdownMenuItem[]>(() =>
  currentOrganizations.value.map((org: PermOrgItem) => ({
    label: org.name,
    type: "checkbox" as const,
    checked: org.name === currentOrg.value,
    onSelect: () => handleOrgChange(org.name)
  }))
);

/**
 * @description 切换组织
 * @param org
 */
function handleOrgChange(org: string) {
  const orgData = currentOrganizations.value.find((o: PermOrgItem) => o.name === org);

  if (orgData) {
    setCurrentOrg(orgData);

    nextTick(() => {
      useEventBus().emit("refresh", undefined);
    });
  }
}

onMounted(async () => {
  if (loggedIn.value && userInfoStore.currentUser) {
    currentOrg.value = userInfoStore.currentUser.org.name;
  }
});

watch(
  () => currentUser.value?.org?.name,
  (name: string | undefined) => {
    if (name) currentOrg.value = name;
  }
);
</script>

<template>
  <div v-show="loggedIn" class="flex w-full min-w-0 max-w-full items-center gap-1">
    <UAvatar
      :alt="currentOrg"
      color="primary"
      size="xs"
      class="shrink-0"
      :ui="{ root: 'rounded-md', fallback: 'uppercase' }"
    />
    <UDropdownMenu
      v-if="selectable"
      size="sm"
      :items="organizationDropdownItems"
      :content="{ align: 'start', side: 'bottom' }"
      :ui="{
        content: 'w-44 max-h-64 overflow-y-auto p-1',
        item: 'mx-0 px-2 py-1.5 rounded-md leading-5 transition-colors duration-150',
        itemLabel: 'text-xs'
      }"
    >
      <UButton
        variant="ghost"
        size="sm"
        color="neutral"
        data-workspace-tour="organization"
        class="h-7 min-w-0 w-fit max-w-full py-0 pr-1.5 pl-1"
        :ui="{
          base: 'flex items-center justify-start gap-1.5 rounded-md bg-transparent transition-colors hover:bg-black/5 focus:bg-transparent active:bg-transparent data-[state=open]:bg-black/[0.06] dark:hover:bg-white/8 dark:data-[state=open]:bg-white/10'
        }"
      >
        <span
          data-overflow-tooltip
          class="min-w-0 truncate text-left text-xs font-medium text-gray-700 dark:text-gray-300"
        >
          {{ currentOrg }}
        </span>
        <UIcon name="i-lucide-chevrons-up-down" class="size-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
      </UButton>
    </UDropdownMenu>
    <span
      v-else
      data-workspace-tour="organization"
      data-overflow-tooltip
      class="min-w-0 truncate px-1 text-left text-xs font-medium text-gray-700 dark:text-gray-300"
    >
      {{ currentOrg }}
    </span>
  </div>
</template>
