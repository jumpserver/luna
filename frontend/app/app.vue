<script lang="ts" setup>
useApplicationConfig();

const route = useRoute()
const { userTheme } = useThemeAdapter();

const backgroundColor = computed(() => {
  return userTheme.value === 'dark'
    ? 'rgba(35, 35, 35, 0.5)'
    : 'rgba(230, 230, 230, 0.5)';
});

const LOCALE_PREFIX_RE = /^\/[a-z]{2}(?:-[A-Z]{2})?(?=\/|$)/;
const pageKey = computed(() => route.path.replace(LOCALE_PREFIX_RE, ''))

// 因为 <Body> 是一个虚拟组件，底层并不会响应 Vue 的 :style 绑定。它的作用是把插槽内容插入到真正的 <body> 中，但自身不是一个响应式桥梁。
useHead({
  bodyAttrs: {
    style: computed(
      () => `
      background-color: ${backgroundColor.value};
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
          <NuxtPage :page-key="pageKey"  />
        </NuxtLayout>
      </UApp>
    </Body>
  </Html>
</template>
