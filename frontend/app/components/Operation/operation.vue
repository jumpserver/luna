<script setup lang="ts">
	import type { DropdownMenuItem } from "@nuxt/ui";
	import type { ActionItem } from "~/types";
	import { LogicalPosition } from "@tauri-apps/api/dpi";
	import { useUserSettingStore } from "~/store/modules/userSetting";

	const { t } = useI18n();
	const userSettingStore = useUserSettingStore();

	const { componentsConfig } = useAppConfig();
	const { layouts, sort, theme } = storeToRefs(userSettingStore);

	const darkColor = componentsConfig.operation.darkColor;
	const lightColor = componentsConfig.operation.lightColor;

	// 刷新、排序、切换布局
	const actionItems = computed<ActionItem[]>(() => [
		{
			key: "refresh",
			type: "action",
			iconName: "i-lucide-refresh-ccw",
			tooltipLabel: t("ToolTips.Refresh")
		},
		{
			key: "sort",
			type: "select",
			iconName: "i-lucide-arrow-down-wide-narrow",
			tooltipLabel: t("ToolTips.Sort"),
			selectItems: [
				{
					icon: "i-lucide-arrow-down-a-z",
					label: t("Sort.A-z"),
					value: "az",
					type: "checkbox" as const,
					checked: sort.value === "az",
					onUpdateChecked: (checked: boolean) => {
						if (checked) {
							userSettingStore.setSort("az");
						}
					}
				},
				{
					icon: "i-lucide-arrow-up-z-a",
					label: t("Sort.Z-A"),
					value: "za",
					type: "checkbox" as const,
					checked: sort.value === "za",
					onUpdateChecked: (checked: boolean) => {
						if (checked) {
							userSettingStore.setSort("za");
						}
					}
				},
				{
					type: "separator" as const
				},
				{
					icon: "i-lucide-calendar-arrow-down",
					label: t("Sort.NewestToOldest"),
					value: "newest-to-oldest",
					type: "checkbox" as const,
					checked: sort.value === "newest-to-oldest",
					onUpdateChecked: (checked: boolean) => {
						if (checked) {
							userSettingStore.setSort("newest-to-oldest");
						}
					}
				},
				{
					icon: "i-lucide-calendar-arrow-up",
					label: t("Sort.OldestToNewest"),
					value: "oldest-to-newest",
					type: "checkbox" as const,
					checked: sort.value === "oldest-to-newest",
					onUpdateChecked: (checked: boolean) => {
						if (checked) {
							userSettingStore.setSort("oldest-to-newest");
						}
					}
				}
			] as DropdownMenuItem[]
		},
		{
			key: "layout",
			type: "select",
			iconName: "i-lucide-layout-grid",
			tooltipLabel: t("ToolTips.Layout"),
			selectItems: [
				{
					icon: "i-lucide-grid-2x2",
					label: t("Layout.Grid"),
					value: "grid",
					type: "checkbox" as const,
					checked: layouts.value === "grid",
					onUpdateChecked: (checked: boolean) => {
						if (checked) {
							userSettingStore.setLayouts("grid");
						}
					}
				},
				{
					icon: "i-lucide-table-of-contents",
					label: t("Layout.Table"),
					value: "table",
					type: "checkbox" as const,
					checked: layouts.value === "table",
					onUpdateChecked: (checked: boolean) => {
						if (checked) {
							userSettingStore.setLayouts("table");
						}
					}
				}
			] as DropdownMenuItem[]
		},
		{
			key: "settings",
			type: "action",
			iconName: "i-lucide-settings",
			tooltipLabel: t("ToolTips.Settings"),
			onClick: () => {
				// eslint-disable-next-line no-new
				new useTauriWebviewWindowWebviewWindow("secondary", {
					title: "",
					url: "/setting",
					minWidth: 760,
					minHeight: 520,
					titleBarStyle: "overlay",
					trafficLightPosition: new LogicalPosition(10, 22)
				});
			}
		}
	]);
</script>

<template>
	<div
		class="flex w-full items-center justify-end px-4 h-12"
		:style="{
			backgroundColor: theme === 'dark' ? darkColor : lightColor
		}"
	>
		<!-- <section>
      <span class="text-xl font-bold"> 资产管理 </span>
    </section> -->

		<section class="flex item-center flex-nowrap gap-3 h-7 mr-2">
			<UInput
				clearable
				icon="i-lucide-search"
				variant="outline"
				:placeholder="t('Operation.Search')"
				:style="{ with: '18rem', borderRadius: '8px' }"
			/>

			<template v-for="action of actionItems" :key="action.iconName">
				<template v-if="action.type === 'action'">
					<UButton
						:icon="action.iconName"
						size="sm"
						color="neutral"
						variant="outline"
						class="rounded-lg"
						@click="action.onClick"
					/>
				</template>

				<template v-else>
					<UDropdownMenu arrow :items="action.selectItems" size="sm">
						<UButton
							:icon="action.iconName"
							size="sm"
							color="neutral"
							variant="outline"
							class="rounded-lg"
						/>
					</UDropdownMenu>
				</template>
			</template>
		</section>
	</div>
</template>
