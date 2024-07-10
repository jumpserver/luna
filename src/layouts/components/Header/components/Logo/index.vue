<template>
  <n-image height="30px" lazy :src="logoImage" alt="Logo 图片" />
</template>

<script setup lang="ts">
defineProps<{
  logoImage: string;
}>();
</script>

<style scoped lang="scss">
.n-image {
  padding: 0 20px;
  &:hover {
    cursor: pointer;
    background-color: green;
  }
}
</style>
