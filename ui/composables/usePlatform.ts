/**
 * 平台检测 composable
 * 提供跨平台的平台检测功能
 */
export const usePlatform = () => {
  const platform = ref<string>('');
  const isLoading = ref(true);

  // 计算属性：判断是否为 macOS
  const isMacOS = computed(() => platform.value === 'darwin' || platform.value === 'macos');
  
  // 计算属性：判断是否为 Windows
  const isWindows = computed(() => platform.value === 'win32' || platform.value === 'windows');
  
  // 计算属性：判断是否为 Linux
  const isLinux = computed(() => platform.value === 'linux');

  // 获取平台信息
  const getPlatform = async () => {
    try {
      isLoading.value = true;
      const currentPlatform = await useTauriOsPlatform();
      platform.value = currentPlatform;
      console.log('Platform detected:', platform.value);
    } catch (error) {
      console.error('Failed to get platform info:', error);
      // 如果无法获取平台信息，默认为 windows
      platform.value = 'win32';
    } finally {
      isLoading.value = false;
    }
  };

  // 组件挂载时自动获取平台信息
  onMounted(() => {
    getPlatform();
  });

  return {
    platform: readonly(platform),
    isLoading: readonly(isLoading),
    isMacOS,
    isWindows,
    isLinux,
    getPlatform,
  };
};

