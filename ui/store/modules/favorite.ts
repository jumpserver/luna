export const useFavoriteStore = defineStore("favorite", () => {
  const favoritesMap = ref<Record<string, true>>({});

  const setFavorites = (ids: string[]) => {
    const map: Record<string, true> = {};

    for (const id of ids) {
      if (id) map[id] = true as const;
    }
    favoritesMap.value = map;
  };

  const clear = () => {
    favoritesMap.value = {};
  };

  const isFavorite = (id: string): boolean => {
    return !!favoritesMap.value[id];
  };

  return {
    favoritesMap,
    clear,
    isFavorite,
    setFavorites
  };
});
