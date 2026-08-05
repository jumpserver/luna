<script setup lang="ts">
import AclDialogContent from "~/components/Modal/aclDialogContent.vue";

const props = defineProps<{ scopeId: string }>();
const { groupForScope, closeScope } = useAclDialog();
const group = groupForScope(props.scopeId);

onBeforeUnmount(() => {
  void closeScope(props.scopeId);
});
</script>

<template>
  <div
    v-if="group"
    class="absolute inset-0 z-[5] grid place-items-center overflow-auto bg-[var(--workspace-surface-background)] p-6"
  >
    <section
      class="w-[min(640px,100%)] rounded-lg border border-[var(--app-border)] bg-[var(--workspace-surface-panel)] p-6 shadow-[var(--theme-shadow-soft)]"
    >
      <AclDialogContent :group="group" embedded />
    </section>
  </div>
</template>
