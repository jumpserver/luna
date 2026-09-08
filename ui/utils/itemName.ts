export const ITEM_NAME_MAX_LENGTH = 128;

export const normalizeItemName = (name: string) => name.trim().toLocaleLowerCase();

// Match <input maxlength>, which counts UTF-16 code units.
export const isItemNameTooLong = (name: string) => name.trim().length > ITEM_NAME_MAX_LENGTH;

export function hasItemName(items: Array<{ id: string; name: string }>, name: string, excludeId?: string) {
  const normalized = normalizeItemName(name);
  if (!normalized) return false;
  return items.some((item) => item.id !== excludeId && normalizeItemName(item.name) === normalized);
}
