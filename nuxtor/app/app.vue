<script lang="ts" setup>
const colorMode = useColorMode();

const backgroundColor = computed(() => {
  console.log('colorMode', colorMode.value);
  return colorMode.value === 'dark'
    ? 'rgba(0, 0, 0, 0.4)'
    : 'rgba(255, 255, 255, 0.4)';
});

// 因为 <Body> 是一个虚拟组件，底层并不会响应 Vue 的 :style 绑定。它的作用是把插槽内容插入到真正的 <body> 中，但自身不是一个响应式桥梁。
useHead({
  bodyAttrs: {
    style: computed(
      () => `
      background-color: ${backgroundColor.value};
      backdrop-filter: blur(25px);
      -webkit-backdrop-filter: blur(25px);
    `
    ),
  },
});
</script>

<template>
  <Html class="overflow-x-hidden overflow-y-hidden">
    <Body class="font-sans antialiased h-screen w-screen">
      <UApp>
        <NuxtLayout>
          <NuxtPage />
        </NuxtLayout>
      </UApp>
    </Body>
  </Html>
</template>
