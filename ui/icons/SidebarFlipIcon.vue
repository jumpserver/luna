<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    :class="iconClass"
    class="flip-icon"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path
      d="M19,2H5C2.243,2,0,4.243,0,7v10c0,2.757,2.243,5,5,5h14c2.757,0,5-2.243,5-5V7c0-2.757-2.243-5-5-5ZM2,17V7c0-1.654,1.346-3,3-3H13V20H5c-1.654,0-3-1.346-3-3Zm20,0c0,1.654-1.346,3-3,3h-4V4h4c1.654,0,3,1.346,3,3v10Zm-2-6c0,.553-.448,1-1,1h-1c-.552,0-1-.447-1-1s.448-1,1-1h1c.552,0,1,.447,1,1Zm0,4c0,.553-.448,1-1,1h-1c-.552,0-1-.447-1-1s.448-1,1-1h1c.552,0,1,.447,1,1Zm0-8c0,.553-.448,1-1,1h-1c-.552,0-1-.447-1-1s.448-1,1-1h1c.552,0,1,.447,1,1Z"
    />
  </svg>
</template>

<script setup lang="ts">
interface Props {
  size?: string | number;
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  size: "24",
  class: ""
});

const iconClass = computed(() => {
  return props.class || "";
});
</script>

<style>
.flip-icon {
  transform: scaleX(-1);
}
</style>
