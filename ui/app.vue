222222222<script lang="ts" setup>
useApplicationConfig();

const route = useRoute();
const { userTheme } = useThemeAdapter();
const { isMacOS } = usePlatform();

const backgroundColor = computed(() => {
  const isDark = userTheme.value === "dark";

  // 只在 macOS 下设置透明度
  if (isMacOS.value) {
    return isDark
      ? "rgba(30, 30, 30, 0.6)"
      : "rgba(240, 240, 240, 0.4)";
  } else {
    // Windows 和其他平台使用不透明的背景色
    return isDark
      ? "rgb(30, 30, 30)"
      : "rgb(240, 240, 240)";
  }
});

const LOCALE_PREFIX_RE = /^\/[a-z]{2}(?:-[A-Z]{2})?(?=\/|$)/;
const pageKey = computed(() => route.path.replace(LOCALE_PREFIX_RE, ''));

// 平台 class 名称
const platformClass = computed(() => {
  const platformKey = isMacOS.value ? 'darwin' : 'windows';
  return `platform-${platformKey}`;
});

// 因为 <Body> 是一个虚拟组件，底层并不会响应 Vue 的 :style 绑定。它的作用是把插槽内容插入到真正的 <body> 中，但自身不是一个响应式桥梁。
useHead({
  bodyAttrs: {
    class: computed(() => platformClass.value),
    style: computed(
      () => `
    background-color: ${backgroundColor.value};
  `
    )
  }
})
</script>

<template>
  <Html class="overflow-x-hidden overflow-y-hidden">
    <Body class="font-sans antialiased h-screen w-screen">
      <UApp>
        <NuxtLayout>
          <NuxtPage :page-key="pageKey" />
        </NuxtLayout>
      </UApp>
    </Body>
  </Html>
</template>
