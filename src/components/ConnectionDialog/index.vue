<template>
  <n-dialog v-if="showDialog" closable autofocus :show-icon="false" :title="`1xas`">
    <n-tabs type="line" animated>
      <n-tab-pane name="oasis" tab="Oasis"> Wonderwall </n-tab-pane>
      <n-tab-pane name="the beatles" tab="the Beatles"> Hey Jude </n-tab-pane>
      <n-tab-pane name="jay chou" tab="周杰伦"> 七里香 </n-tab-pane>
    </n-tabs>
  </n-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const showDialog = ref(true);
</script>

<style scoped lang="scss"></style>
