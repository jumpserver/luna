<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { PermOrgItem } from "~/types/index";

import { useUserInfoStore } from "~/store/modules/userInfo";

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
  <div v-show="loggedIn" class="flex w-full items-center">
    <UDropdownMenu
      :items="organizationDropdownItems"
      :content="{ align: 'start', side: 'bottom' }"
      :ui="{ content: 'w-48 max-h-64 overflow-y-auto' }"
    >
      <UButton
        variant="ghost"
        size="sm"
        color="neutral"
        class="h-7 w-full rounded-sm px-2"
        :ui="{ base: 'grid grid-cols-[16px_minmax(0,1fr)_14px] items-center gap-2' }"
      >
        <UIcon name="fluent:organization-16-regular" class="size-4 text-gray-500 dark:text-gray-400" />
        <span class="min-w-0 truncate text-left text-xs font-medium">{{ currentOrg }}</span>
        <UIcon name="i-lucide-chevron-down" class="size-3.5 justify-self-end text-gray-400 dark:text-gray-500" />
      </UButton>
    </UDropdownMenu>
  </div>
</template>
