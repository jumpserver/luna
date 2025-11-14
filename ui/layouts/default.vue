<script lang="ts" setup>
const { initialTheme, listenOSThemeChange } = useThemeAdapter();
const { isWindows } = usePlatform();

const cardUi = computed(() => {
  const base = ["rounded-none", "overflow-visible"];

  if (isWindows.value) {
    base.push("border-0", "ring-0", "shadow-none", "bg-transparent");
  }

  return {
    header: "p-0 sm:px-0",
    body: "p-0 sm:p-0",
    footer: "p-0 sm:p-0",
    root: base.join(" ")
  };
});

onMounted(() => {
  initialTheme();
  listenOSThemeChange();
});
</script>

<template>
  <UCard
    variant="outline"
    :ui="cardUi"
    style="background-color: transparent"
  >
    <div class="flex gap-0 w-full h-screen border-none">
      <SideBar />

      <Main class="flex-1 min-w-0">
        <slot />
      </Main>
    </div>
  </UCard>
</template>
