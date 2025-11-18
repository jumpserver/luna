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
    postgresql: "/icons/postgre.png",
    sqlserver: "/icons/sqlserver.png",
    mariadb: "/icons/mariadb.png"
  };

  return iconMap[props.type.toLowerCase()] || ""; // 默认使用 linux 图标
});

const imageProps = computed(() => {
  const prop: { src?: string; alt?: string } = {};
  const iconMap: Record<string, string> = {
    windows: "/icons/windows.png",
    linux: "/icons/linux.png",
    mysql: "/icons/mysql.png",
    mariadb: "/icons/mariadb.png",
    oracle: "/icons/oracle.png",
    postgresql: "/icons/postgre.png",
    sqlserver: "/icons/sqlserver.png",
    redis: "/icons/redis.png",
    mongodb: "/icons/mongodb.png",
    dameng: "/icons/dameng.png",
    clickhouse: "/icons/clickhouse.png"
  };

  const src = iconMap[props.type] || "";
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
    :class="['shrink-0', props.class, 'bg-neutral-200 dark:bg-neutral-600']"
  />
</template>
