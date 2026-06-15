<script setup lang="ts">
interface Props {
  type?: string
  size?: "sm" | "md" | "lg" | "xl"
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: "lg",
  class: "",
  type: "linux"
});

const imageProps = computed(() => {
  const prop: { src?: string, alt?: string } = {};
  const iconMap: Record<string, string> = {
    windows: "/icons/windows.png",
    linux: "/icons/linux.png",
    unix: "/icons/linux.png",
    other: "/icons/linux.png",
    mysql: "/icons/mysql.png",
    mariadb: "/icons/mariadb.png",
    oracle: "/icons/oracle.png",
    postgresql: "/icons/postgre.png",
    sqlserver: "/icons/sqlserver.png",
    redis: "/icons/redis.png",
    mongodb: "/icons/mongodb.png",
    dameng: "/icons/dameng.png",
    clickhouse: "/icons/clickhouse.png",
    windows_ad: "/icons/windows.png",
    website: "/icons/browser.png"
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
    class="shrink-0 bg-neutral-200 dark:bg-neutral-600"
    :class="[props.class]"
  />
</template>
