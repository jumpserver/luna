<script setup lang="ts">
import { resolveAssetIconSrc } from "~/utils/assetIcon";

interface Props {
  type?: string;
  size?: "sm" | "md" | "lg" | "xl";
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  size: "lg",
  class: "",
  type: "linux"
});
const appBaseURL = useRuntimeConfig().app.baseURL;

const imageProps = computed(() => {
  const prop: { src?: string; alt?: string } = {};
  const src = resolveAssetIconSrc(props.type, appBaseURL);
  const alt = props.type;

  if (src) {
    prop.src = src;
  } else {
    prop.alt = alt;
  }

  return prop;
});

const sizeClasses = computed(() => {
  const sizeMap = {
    sm: "size-6",
    md: "size-7",
    lg: "size-8",
    xl: "size-10"
  };
  return sizeMap[props.size];
});
</script>

<template>
  <UAvatar
    :size="size"
    v-bind="imageProps"
    :ui="{ root: 'rounded-md', image: `${sizeClasses} p-1` }"
    class="shrink-0 bg-neutral-200 dark:bg-neutral-600"
    :class="[props.class]"
  />
</template>
