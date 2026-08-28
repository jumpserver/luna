export type AiPanelSource = "workspace" | "sftp";

const open = shallowRef(false);
const source = shallowRef<AiPanelSource>("workspace");

export const useAiPanel = () => {
  const setOpen = (value: boolean) => {
    open.value = value;
  };

  const openAi = (nextSource: AiPanelSource = "workspace") => {
    source.value = nextSource;
    open.value = true;
  };

  const toggleAi = (nextSource: AiPanelSource = "workspace") => {
    if (open.value) {
      open.value = false;
      return;
    }

    openAi(nextSource);
  };

  return {
    open,
    source,
    setOpen,
    openAi,
    toggleAi
  };
};
