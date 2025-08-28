<script lang="ts" setup>
import item2 from '@/assets/images/item2.png';
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <img :src="item2" alt="item2" class="w-10 h-10" />

          <div class="flex flex-col gap-1">
            <p class="text-sm font-medium">Iterm2</p>

            <UBadge color="neutral" variant="soft" size="sm">
              /Applications/iTerm.app
            </UBadge>
          </div>
        </div>

        <USwitch
          unchecked-icon="i-lucide-x"
          checked-icon="i-lucide-check"
          default-value
        />
      </div>
    </template>

    <template #default>
      <div class="flex w-full justify-between items-center">
        <div class="flex flex-col gap-4">
          <div class="flex items-center gap-2">
            <UBadge color="info" variant="soft"> SSh </UBadge>
          </div>

          <div class="text-xs text-gray-500">
            iTerm2 is a virtual terminal application software on the MacOS
            operating system
          </div>
        </div>

        <UButton
          size="sm"
          color="neutral"
          variant="soft"
          icon="i-lucide-arrow-down-to-line"
        >
          下载应用
        </UButton>
      </div>
    </template>
  </UCard>
</template>
