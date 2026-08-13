import type { Ref } from "vue";
import { computed, ref, shallowRef } from "vue";

interface FilePaneEntry {
  name: string;
  is_dir: boolean;
}

interface UseSftpPaneSelectionOptions<T extends FilePaneEntry> {
  visibleEntries: Ref<T[]>;
  clearAnchorOnClear?: boolean;
}

export function useSftpPaneSelection<T extends FilePaneEntry>(options: UseSftpPaneSelectionOptions<T>) {
  const selectedEntries = shallowRef<T[]>([]);
  const selectionRevision = ref(0);
  const lastClickedIndex = ref(-1);

  const selectableVisibleEntries = computed(() => options.visibleEntries.value.filter((entry) => entry.name !== ".."));
  const selectedEntry = computed(() => selectedEntries.value.at(-1) || null);
  const visibleSelectedCount = computed(
    () => selectableVisibleEntries.value.filter((entry) => isSelected(entry)).length
  );
  const selectAllState = computed<boolean | "indeterminate">(() => {
    if (!visibleSelectedCount.value) return false;
    return visibleSelectedCount.value === selectableVisibleEntries.value.length ? true : "indeterminate";
  });

  function clearSelection() {
    selectedEntries.value = [];
    selectionRevision.value += 1;
    if (options.clearAnchorOnClear ?? true) lastClickedIndex.value = -1;
  }

  function updateSelection(entries: T[]) {
    selectedEntries.value = entries;
    selectionRevision.value += 1;
  }

  function isSelected(entry: T) {
    return selectedEntries.value.some((item) => item.name === entry.name);
  }

  function selectEntry(entry: T, event?: Pick<MouseEvent, "shiftKey" | "ctrlKey" | "metaKey">) {
    if (entry.name === "..") return;
    const index = options.visibleEntries.value.findIndex((item) => item.name === entry.name);

    if (event?.shiftKey && lastClickedIndex.value >= 0 && index >= 0) {
      const start = Math.min(lastClickedIndex.value, index);
      const end = Math.max(lastClickedIndex.value, index);
      updateSelection(options.visibleEntries.value.slice(start, end + 1).filter((item) => item.name !== ".."));
      return;
    }

    if (event?.ctrlKey || event?.metaKey) {
      updateSelection(
        isSelected(entry)
          ? selectedEntries.value.filter((item) => item.name !== entry.name)
          : [...selectedEntries.value, entry]
      );
      lastClickedIndex.value = index;
      return;
    }

    updateSelection([entry]);
    lastClickedIndex.value = index;
  }

  function toggleEntry(entry: T, selected: boolean) {
    if (entry.name === ".." || isSelected(entry) === selected) return;
    updateSelection(
      selected ? [...selectedEntries.value, entry] : selectedEntries.value.filter((item) => item.name !== entry.name)
    );
  }

  function toggleAllVisible(selected: boolean) {
    const visibleNames = new Set(selectableVisibleEntries.value.map((entry) => entry.name));
    updateSelection(
      selected
        ? [...selectedEntries.value.filter((entry) => !visibleNames.has(entry.name)), ...selectableVisibleEntries.value]
        : selectedEntries.value.filter((entry) => !visibleNames.has(entry.name))
    );
  }

  function selectNavigationTarget(entry: T, extend: boolean) {
    const targetIndex = options.visibleEntries.value.findIndex((item) => item.name === entry.name);
    if (!extend) {
      updateSelection([entry]);
      lastClickedIndex.value = targetIndex;
      return;
    }

    const currentIndex = selectedEntry.value
      ? options.visibleEntries.value.findIndex((item) => item.name === selectedEntry.value?.name)
      : -1;
    const anchorIndex = lastClickedIndex.value >= 0 ? lastClickedIndex.value : currentIndex;
    if (anchorIndex < 0) {
      updateSelection([entry]);
      lastClickedIndex.value = targetIndex;
      return;
    }

    const start = Math.min(anchorIndex, targetIndex);
    const end = Math.max(anchorIndex, targetIndex);
    updateSelection(options.visibleEntries.value.slice(start, end + 1).filter((item) => item.name !== ".."));
  }

  function moveSelection(direction: -1 | 1, extend = false) {
    const entries = selectableVisibleEntries.value;
    if (!entries.length) return;

    const currentIndex = selectedEntry.value
      ? entries.findIndex((entry) => entry.name === selectedEntry.value?.name)
      : direction === 1
        ? -1
        : entries.length;
    const targetIndex = Math.max(0, Math.min(entries.length - 1, currentIndex + direction));
    const target = entries[targetIndex];
    if (!target || (!extend && target.name === selectedEntry.value?.name)) return;
    selectNavigationTarget(target, extend);
  }

  function moveSelectionToBoundary(boundary: "start" | "end", extend = false) {
    const entries = selectableVisibleEntries.value;
    const target = boundary === "start" ? entries[0] : entries.at(-1);
    if (!target || (!extend && target.name === selectedEntry.value?.name)) return;
    selectNavigationTarget(target, extend);
  }

  function clearTransferredSelection(names: string[], sourcePath: string, revision: number, currentPath: string) {
    if (currentPath !== sourcePath || selectionRevision.value !== revision) return;

    const transferredNames = new Set(names);
    const remaining = selectedEntries.value.filter((entry) => !transferredNames.has(entry.name));
    if (remaining.length === selectedEntries.value.length) return;

    selectedEntries.value = remaining;
  }

  return {
    selectedEntries,
    selectedEntry,
    selectionRevision,
    selectableVisibleEntries,
    selectAllState,
    clearSelection,
    updateSelection,
    clearTransferredSelection,
    isSelected,
    moveSelection,
    moveSelectionToBoundary,
    selectEntry,
    toggleEntry,
    toggleAllVisible
  };
}
