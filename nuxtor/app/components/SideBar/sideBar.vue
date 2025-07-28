<script setup lang="ts">
	import type { NavigationMenuItem } from "@nuxt/ui";

	defineProps<{
		collapsed: boolean
	}>();

	const { t } = useI18n();

	const items = ref<NavigationMenuItem[][]>([
		[
			{
				label: t("Menu.Linux"),
				icon: "fa-brands:linux",
				to: "/linux"
			},
			{
				label: t("Menu.Windows"),
				icon: "fa-brands:windows",
				to: "/windows"
			},
			{
				label: t("Menu.Database"),
				icon: "fa-solid:database",
				to: "/database"
			},
			{
				label: t("Menu.Device"),
				icon: "fa-solid:laptop",
				to: "/device"
			},
			{
				label: t("Menu.Favorite"),
				icon: "fa-solid:star",
				to: "/favorite"
			},
			{
				label: t("Menu.Player"),
				icon: "i-lucide-video"
			}
		]
	]);
</script>

<template>
	<div
		class="flex flex-col justify-between"
		:style="{
			width: collapsed ? '64px' : '185px'
		}"
	>
		<UNavigationMenu
			:items="items"
			:collapsed="collapsed"
			class="px-4 py-6"
			orientation="vertical"
		/>

		<div class="flex items-center mb-4 ml-4 gap-4">
			<UAvatar size="sm" src="https://github.com/benjamincanac.png" />

			123123
		</div>
	</div>
</template>
