<script setup lang="ts">
const openGithub = () => {
  window.open('https://github.com/jumpserver/jumpserver', '_blank');
};
</script>

<template>
  <div class="flex gap-2 justify-center w-full text-gray-500">
    <!-- <section class="flex items-center">
      <UIcon
        name="i-lucide-github"
        class="size-4 cursor-pointer"
        @click="openGithub"
      />
    </section> -->

    <section class="flex items-center">
      <UIcon name="i-lucide-git-commit-vertical" class="size-4" />
      <span class="text-sm">当前版本: v3.1.0</span>
    </section>
  </div>
</template>
