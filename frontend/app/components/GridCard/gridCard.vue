<script setup lang="ts">
import IconLinux from '~/assets/icon-linux.svg';

const showEdit = ref(false);

const handleMouseOver = () => {
  showEdit.value = true;
};

const handleMouseLeave = () => {
  showEdit.value = false;
};
</script>

<template>
  <UCard
    variant="outline"
    :ui="{
      header: 'p-2',
      body: 'p-2 sm:p-4',
    }"
    class="hover:cursor-pointer"
    @mouseover="handleMouseOver"
    @mouseleave="handleMouseLeave"
  >
    <template #header>
      <div class="flex justify-between">
        <section class="flex items-center gap-2">
          <div class="w-2 h-2 bg-[#55B787] rounded-full"></div>
          <span class="text-xs-plus">已激活</span>
        </section>
      </div>
    </template>

    <section class="flex gap-4 items-center w-full">
      <IconLinux :font-controlled="false" class="size-6" />

      <div class="flex flex-col gap-1 flex-1">
        <span class="text-sm font-medium">y4</span>

        <div class="flex items-center gap-2 text-[13px]">
          <span class="">https://y4.cmdb.cc</span>

          <USeparator orientation="vertical" size="sm" class="h-3" />

          <span>Ubuntu 22.04</span>
        </div>
      </div>

      <UButton
        v-if="showEdit"
        size="sm"
        variant="ghost"
        color="neutral"
        class="rounded-lg"
        icon="i-fa6-regular:pen-to-square"
      >
      </UButton>
    </section>
  </UCard>
</template>
