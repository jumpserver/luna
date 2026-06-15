<script setup lang="ts">
const localePath = useLocalePath();

await navigateTo(localePath("windows"), { replace: true });
</script>
