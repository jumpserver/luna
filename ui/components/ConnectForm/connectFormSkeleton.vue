<script setup lang="ts">
const { modernIsland } = useConnectFormAppearance();
</script>

<template>
  <div aria-busy="true" aria-live="polite">
    <div class="flex flex-col gap-4" :class="{ 'connect-form--island': modernIsland }">
      <div class="protocol-tabs-track">
        <div class="protocol-tabs">
          <span v-for="width in ['w-10', 'w-14', 'w-12']" :key="width" class="protocol-tab-button">
            <USkeleton class="h-3.5" :class="width" />
          </span>
        </div>
      </div>

      <div class="flex flex-col gap-4">
        <div>
          <USkeleton class="h-3.5" :class="modernIsland ? 'w-8' : 'w-10'" />
          <USkeleton
            class="mt-2 h-8 w-full"
            :class="
              modernIsland ? 'rounded-[length:var(--workspace-island-radius)]' : 'rounded-[length:var(--app-radius)]'
            "
          />
        </div>

        <div>
          <USkeleton class="h-3.5 w-14" />
          <div
            class="mt-2 overflow-hidden"
            :class="
              modernIsland
                ? 'rounded-[length:var(--workspace-island-radius)] border border-[color-mix(in_srgb,var(--theme-fg)_14%,transparent)] bg-[color-mix(in_srgb,var(--theme-fg)_6%,transparent)]'
                : 'rounded-[length:var(--app-radius)] border border-[var(--app-border)] bg-[var(--app-input-bg)] shadow-sm'
            "
          >
            <div class="flex gap-1 px-2 pt-2">
              <USkeleton v-for="item in 2" :key="item" class="h-7 w-[4.5rem] rounded-full" />
            </div>
            <div class="flex flex-col gap-1.5 p-2">
              <USkeleton
                v-for="item in 3"
                :key="item"
                class="h-9 w-full"
                :class="
                  modernIsland
                    ? 'rounded-[length:var(--workspace-island-radius)]'
                    : 'rounded-[length:var(--app-radius)]'
                "
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-4 flex items-start gap-2">
      <USkeleton class="mt-0.5 size-4 shrink-0 rounded" />
      <div class="min-w-0 flex-1 space-y-1.5 pt-px">
        <USkeleton class="h-3.5 w-24" />
        <USkeleton class="h-3 w-full max-w-80" />
      </div>
    </div>

    <div class="mt-6 mb-2">
      <USkeleton
        class="w-full"
        :class="
          modernIsland
            ? 'h-8 rounded-[length:var(--workspace-island-radius)]'
            : 'h-10 rounded-[length:var(--app-radius)]'
        "
      />
    </div>
  </div>
</template>

<style scoped>
.protocol-tabs-track {
  display: flex;
  justify-content: flex-start;
  border-bottom: 1px solid var(--app-border);
}

.protocol-tabs {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  align-items: flex-end;
  justify-content: flex-start;
  gap: 1rem;
}

.protocol-tab-button {
  flex: 0 0 auto;
  margin-bottom: -1px;
  padding: 0.25rem 0 0.375rem;
}
</style>
