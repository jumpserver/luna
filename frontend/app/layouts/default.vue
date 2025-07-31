<script lang="ts" setup>
const collapsed = ref(false);

const handleCollapse = () => {
  collapsed.value = !collapsed.value;
};
</script>

<template>
  <UCard
    variant="outline"
    :ui="{
      header: 'p-0 sm:px-0',
      body: 'p-0 sm:p-0',
      footer: 'p-0 sm:p-0',
    }"
  >
    <!--  style="background-color: transparent" -->
    <template #header>
      <Header @collapse="handleCollapse" />
    </template>

    <div class="flex gap-0 w-full h-screen">
      <SideBar :collapsed="collapsed" />

      <Main class="flex-1 min-w-0">
        <slot />
      </Main>
    </div>
  </UCard>
</template>
