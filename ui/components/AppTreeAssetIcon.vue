<script setup lang="ts">
const props = defineProps<{
  src: string;
  fallback?: string;
}>();

const filename = computed(() => props.src.split("/").pop());
const iconName = computed(() => (props.src ? "" : props.fallback || "i-lucide-terminal"));
// Use the original brand silhouettes with theme-aware colors at small tree sizes.
const maskColor = computed(() => {
  if (filename.value === "mysql.svg") return "text-info";
  if (filename.value === "mariadb.svg") return "text-warning";
  if (filename.value === "oracle.svg" || filename.value === "sqlserver.svg") return "text-error";
  return "";
});
</script>

<template>
  <UIcon
    v-if="iconName"
    :name="iconName"
    class="app-tree-icon sidebar-icon-img"
    :class="iconName.startsWith('i-tabler-') ? 'text-info' : 'sidebar-icon'"
    aria-hidden="true"
  />
  <span
    v-else-if="maskColor"
    class="app-tree-icon sidebar-icon-img bg-current"
    :class="maskColor"
    :style="{
      maskImage: `url(${JSON.stringify(src)})`,
      maskSize: 'contain',
      maskRepeat: 'no-repeat',
      maskPosition: 'center'
    }"
    aria-hidden="true"
  />
  <img v-else :src="src" alt="" class="app-tree-icon sidebar-icon-img" />
</template>
