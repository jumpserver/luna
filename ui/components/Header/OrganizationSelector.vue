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
const handleOrgChange = (org: string) => {
  const orgData = currentOrganizations.value.find((o: PermOrgItem) => o.name === org);

  if (orgData) {
    setCurrentOrg(orgData);

    nextTick(() => {
      useEventBus().emit("refresh", undefined);
    });
  }
};

onMounted(async () => {
  if (loggedIn.value && userInfoStore.currentUser) {
    currentOrg.value = userInfoStore.currentUser.org.name;
    // 确保 orgId 也被正确设置
    if (userInfoStore.currentUser.org?.id) {
      userInfoStore.orgId = userInfoStore.currentUser.org.id;
    }
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
  <div v-show="loggedIn" class="flex items-center">
    <UDropdownMenu
      :items="organizationDropdownItems"
      :content="{ align: 'start', side: 'bottom' }"
      :ui="{ content: 'w-48 max-h-64 overflow-y-auto' }"
    >
      <UButton variant="ghost" size="md" color="neutral" class="btn-common px-3">
        <UIcon name="fluent:organization-16-regular" />
        <span class="truncate max-w-32 font-medium">{{ currentOrg }}</span>
        <UIcon name="i-lucide-chevron-down" class="ml-1 size-3" />
      </UButton>
    </UDropdownMenu>
  </div>
</template>
