export function useConnectFormAppearance() {
  const { modernIsland } = useSettingManager();

  const formFieldUi = computed(() =>
    modernIsland.value
      ? {
          label: "text-xs font-medium text-[var(--app-text-muted)]",
          container: "mt-2"
        }
      : {
          label: "text-sm font-semibold tracking-[0.025em] text-[var(--app-text-muted)]",
          container: "mt-2"
        }
  );

  const controlBaseUi = computed(() =>
    modernIsland.value
      ? "h-8 rounded-[length:var(--workspace-island-radius)] bg-[var(--app-input-bg)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--theme-fg)_14%,transparent)] transition-[box-shadow,background-color] hover:ring-[color-mix(in_srgb,var(--theme-fg)_22%,transparent)] focus-visible:ring-2 focus-visible:ring-[var(--app-focus-ring)]"
      : "h-8 rounded-[4px] bg-[var(--app-input-bg)] ring-1 ring-inset ring-[var(--app-border)] shadow-sm transition-[box-shadow,background-color] hover:ring-[var(--app-border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--app-focus-ring)]"
  );

  const overlayMenuUi = computed(() =>
    modernIsland.value
      ? {
          content:
            "bg-[var(--app-surface-panel)] text-[var(--app-fg)] ring-1 ring-[color-mix(in_srgb,var(--theme-fg)_22%,transparent)] shadow-[0_18px_48px_color-mix(in_srgb,#000_45%,transparent)]"
        }
      : {}
  );

  return {
    modernIsland,
    formFieldUi,
    controlBaseUi,
    overlayMenuUi
  };
}
