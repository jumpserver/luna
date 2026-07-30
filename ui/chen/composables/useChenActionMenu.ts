import type { Ref } from "vue";
import type { ChenActionItem, ChenTreeNode } from "~/chen/types";

import { ref } from "vue";

interface ChenActionMenuOptions<T> {
  fetchActions: (node: ChenTreeNode) => Promise<ChenActionItem[]>;
  mapItems: (node: ChenTreeNode, actions: ChenActionItem[]) => T[];
  onError: (node: ChenTreeNode, cause: unknown) => void;
}

export function useChenActionMenu<T>(options: ChenActionMenuOptions<T>) {
  const visible = ref(false);
  const position = ref({ x: 0, y: 0 });
  const items = ref<T[]>([]) as Ref<T[]>;
  const node = ref<ChenTreeNode | null>(null);
  let generation = 0;

  function clear() {
    visible.value = false;
    items.value = [];
    node.value = null;
  }

  function close() {
    generation += 1;
    clear();
  }

  async function open(target: ChenTreeNode, event: Pick<MouseEvent, "clientX" | "clientY">) {
    close();
    const requestGeneration = generation;

    try {
      const actions = await options.fetchActions(target);
      if (requestGeneration !== generation || !actions.length) return;

      const mappedItems = options.mapItems(target, actions);
      if (!mappedItems.length) return;

      items.value = mappedItems;
      position.value = { x: event.clientX, y: event.clientY };
      node.value = target;
      visible.value = true;
    } catch (cause) {
      if (requestGeneration === generation) options.onError(target, cause);
    }
  }

  return {
    close,
    items,
    node,
    open,
    position,
    visible
  };
}
