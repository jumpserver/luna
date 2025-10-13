<script setup lang="ts">
interface Props {
  type: string;
  size?: "sm" | "md" | "lg" | "xl";
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  size: "lg",
  class: "",
  type: "linux"
});

const iconPath = computed(() => {
  // 根据类型返回对应的图标路径
  const iconMap: Record<string, string> = {
    windows: "/icons/windows.png",
    linux: "/icons/linux.png",
    mysql: "/icons/mysql.png",
    oracle: "/icons/oracle.png",
    postgre: "/icons/postgre.png",
    sqlserver: "/icons/sqlserver.png"
  };

  console.log(props.type);

  return iconMap[props.type] || "/icons/linux.png"; // 默认使用 linux 图标
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
    :src="iconPath"
    :ui="{ root: 'rounded-md', image: `${sizeClasses} p-1` }"
    :class="['flex-shrink-0', props.class]"
  />
</template>
