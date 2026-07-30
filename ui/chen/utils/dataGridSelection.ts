export interface ChenGridCell {
  rowIndex: number
  colId: string
}

export interface ChenGridSelection {
  dragging: boolean
  moved: boolean
  anchor: ChenGridCell | null
  current: ChenGridCell | null
}

export function emptyChenGridSelection(): ChenGridSelection {
  return {
    dragging: false,
    moved: false,
    anchor: null,
    current: null
  };
}

export function startChenGridSelection(cell: ChenGridCell): ChenGridSelection {
  return {
    dragging: true,
    moved: false,
    anchor: cell,
    current: cell
  };
}

export function extendChenGridSelection(selection: ChenGridSelection, cell: ChenGridCell): ChenGridSelection {
  if (!selection.anchor) return startChenGridSelection(cell);
  return {
    ...selection,
    current: cell,
    moved: selection.moved || selection.anchor.rowIndex !== cell.rowIndex || selection.anchor.colId !== cell.colId
  };
}

export function finishChenGridSelection(selection: ChenGridSelection): ChenGridSelection {
  return { ...selection, dragging: false };
}

export function getChenGridSelectionBounds(selection: ChenGridSelection, displayedColIds: string[]) {
  if (!selection.anchor || !selection.current) return null;

  const anchorCol = displayedColIds.indexOf(selection.anchor.colId);
  const currentCol = displayedColIds.indexOf(selection.current.colId);
  if (anchorCol === -1 || currentCol === -1) return null;

  return {
    minRow: Math.min(selection.anchor.rowIndex, selection.current.rowIndex),
    maxRow: Math.max(selection.anchor.rowIndex, selection.current.rowIndex),
    minCol: Math.min(anchorCol, currentCol),
    maxCol: Math.max(anchorCol, currentCol),
    displayedColIds
  };
}

export function isChenGridCellSelected(selection: ChenGridSelection, displayedColIds: string[], cell: ChenGridCell) {
  const bounds = getChenGridSelectionBounds(selection, displayedColIds);
  if (!bounds) return false;
  const colIndex = displayedColIds.indexOf(cell.colId);
  return (
    cell.rowIndex >= bounds.minRow
    && cell.rowIndex <= bounds.maxRow
    && colIndex >= bounds.minCol
    && colIndex <= bounds.maxCol
  );
}
