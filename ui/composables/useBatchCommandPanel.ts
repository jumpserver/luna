const batchPanelOpen = ref(false);
const batchCommand = ref("");

export const useBatchCommandPanel = () => {
  const setOpen = (value: boolean) => {
    batchPanelOpen.value = value;
  };

  const toggle = () => {
    batchPanelOpen.value = !batchPanelOpen.value;
  };

  const fillCommand = (command: string) => {
    batchCommand.value = command;
    batchPanelOpen.value = true;
  };

  return {
    batchPanelOpen,
    batchCommand,
    setOpen,
    toggle,
    fillCommand
  };
};
