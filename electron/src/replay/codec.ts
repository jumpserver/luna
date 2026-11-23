export function computeTargetDimensions(width, height, resolution = "original") {
  const heights = { p1080: 1080, p720: 720, p360: 360 };
  const targetHeight = heights[resolution];
  let targetWidth = width;
  let nextHeight = height;
  if (targetHeight && height > targetHeight) {
    targetWidth = Math.max(2, Math.round(width * (targetHeight / height)));
    nextHeight = targetHeight;
  }
  return {
    width: Math.max(2, Math.ceil(targetWidth / 2) * 2),
    height: Math.max(2, Math.ceil(nextHeight / 2) * 2)
  };
}
