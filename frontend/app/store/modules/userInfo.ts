export const useUserInfoStore = defineStore(
  'userInfo',
  () => {
    const userData = ref<any[]>([]);
    const loggedIn = ref(false);

    const setUserLoggedIn = (l: boolean) => {
      loggedIn.value = l;
    };

    const getUserData = () => {
      return userData.value;
    }

    const setUserData = (data: any) => {
      userData.value = data;
    }

    return {
      loggedIn,

      getUserData,
      setUserData,
      setUserLoggedIn,
    };
  },
  {
    persist: {
      storage: localStorage,
    },
  }
);
