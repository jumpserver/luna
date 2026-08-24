export function fitDisplayScale(
  containerWidth: number,
  containerHeight: number,
  displayWidth: number,
  displayHeight: number
) {
  if (!containerWidth || !containerHeight || !displayWidth || !displayHeight) return 1;
  return Math.max(0.1, Math.min(containerWidth / displayWidth, containerHeight / displayHeight));
}
