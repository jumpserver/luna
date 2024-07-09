<template>
  <n-image height="30px" lazy :src="logoImage" alt="Logo 图片" />
</template>

<script setup lang="ts">
defineProps<{
  logoImage: string;
}>();
</script>
