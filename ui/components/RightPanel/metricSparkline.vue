<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    primary: number[];
    secondary?: number[];
    fixedMax?: number;
  }>(),
  { secondary: () => [], fixedMax: 0 }
);

const width = 240;
const height = 42;
const rangeMax = computed(() =>
  props.fixedMax > 0 ? props.fixedMax : Math.max(1, ...props.primary, ...props.secondary)
);

function points(values: number[]) {
  if (values.length === 0) return "";
  const denominator = Math.max(1, values.length - 1);
  return values
    .map((value, index) => {
      const x = (index / denominator) * width;
      const y = height - (Math.min(rangeMax.value, Math.max(0, value)) / rangeMax.value) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
</script>

<template>
  <svg viewBox="0 0 240 42" preserveAspectRatio="none" class="h-10 w-full" aria-hidden="true">
    <line x1="0" y1="40" x2="240" y2="40" stroke="var(--app-border)" stroke-width="1" />
    <polyline
      v-if="secondary.length"
      :points="points(secondary)"
      fill="none"
      stroke="var(--app-muted)"
      stroke-width="1.75"
      vector-effect="non-scaling-stroke"
    />
    <polyline
      :points="points(primary)"
      fill="none"
      stroke="var(--ui-color-primary-500)"
      stroke-width="2"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>
