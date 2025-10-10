<script setup lang="ts">
import { useUserSettingStore } from '~/store/modules/userSetting';

const userSettingStore = useUserSettingStore();

const { componentsConfig } = useAppConfig();
const { theme } = storeToRefs(userSettingStore);

const clearSelectionCallback = ref<(() => void) | null>(null);

const clearSelection = () => {
  if (clearSelectionCallback.value) {
    clearSelectionCallback.value();
  }
};

const providerClearSelection = (callback: () => void) => {
  clearSelectionCallback.value = callback;
};

provide('providerClearSelection', providerClearSelection);
</script>

<template>
	<UCard
		variant="soft"
		class="w-full"
		:style="{
			borderTopRightRadius: '0px',
			borderTopLeftRadius: '0px',
			backgroundColor:
				theme === 'dark'
					? componentsConfig.pages.mainCardDarkBackgroundColor
					: componentsConfig.pages.mainCardLightBackgroundColor
		}"
		:ui="{
			header: 'p-0 sm:p-0',
			body: 'p-2 sm:p-4 px-4 py-2 h-[calc(100vh-58px)]'
		}"
		@click="clearSelection"
	>
		<template #header>
			<Header />
		</template>

		<slot />
	</UCard>
</template>
