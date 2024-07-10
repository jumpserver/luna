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
  justify-content: center;
  width: 100%;
  &:hover {
    cursor: pointer;
    background-color: green;
  }
}
</style>
