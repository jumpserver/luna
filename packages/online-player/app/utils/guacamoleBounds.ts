export type VisibleRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function fitDisplayScale(
  containerWidth: number,
  containerHeight: number,
  displayWidth: number,
  displayHeight: number
) {
  if (!containerWidth || !containerHeight || !displayWidth || !displayHeight) return 1;
  return Math.max(0.1, Math.min(containerWidth / displayWidth, containerHeight / displayHeight));
}

export function visibleBoundsFromAlpha(image: ArrayLike<number>, width: number, height: number): VisibleRect | null {
  const xStep = Math.max(2, Math.floor(width / 240));
  const yStep = Math.max(2, Math.floor(height / 240));

  const rowHasContent = (y: number) => {
    for (let x = 0; x < width; x += xStep) {
      if ((image[(y * width + x) * 4 + 3] ?? 0) > 0) return true;
    }
    return false;
  };

  const columnHasContent = (x: number, top: number, bottom: number) => {
    for (let y = top; y <= bottom; y += yStep) {
      if ((image[(y * width + x) * 4 + 3] ?? 0) > 0) return true;
    }
    return false;
  };

  let top = 0;
  let bottom = height - 1;
  let left = 0;
  let right = width - 1;

  while (top < bottom && !rowHasContent(top)) top += yStep;
  while (bottom > top && !rowHasContent(bottom)) bottom -= yStep;
  while (left < right && !columnHasContent(left, top, bottom)) left += xStep;
  while (right > left && !columnHasContent(right, top, bottom)) right -= xStep;

  if (right <= left || bottom <= top) return null;

  const paddingX = xStep * 2;
  const paddingY = yStep * 2;
  return {
    left: Math.max(0, left - paddingX),
    top: Math.max(0, top - paddingY),
    width: Math.min(width, right - left + paddingX * 2),
    height: Math.min(height, bottom - top + paddingY * 2)
  };
}

export function accumulateVisibleBounds(
  current: VisibleRect | null,
  sampled: VisibleRect | null,
  fullWidth: number,
  fullHeight: number
): VisibleRect | null {
  if (!sampled || !sampled.width || !sampled.height) return current;

  if (sampled.width / fullWidth > 0.985 && sampled.height / fullHeight > 0.985) {
    return { left: 0, top: 0, width: fullWidth, height: fullHeight };
  }

  const nextRight = Math.min(fullWidth, sampled.left + sampled.width);
  const nextBottom = Math.min(fullHeight, sampled.top + sampled.height);
  const nextLeft = Math.max(0, sampled.left);
  const nextTop = Math.max(0, sampled.top);

  if (!current) {
    return {
      left: nextLeft,
      top: nextTop,
      width: Math.max(1, nextRight - nextLeft),
      height: Math.max(1, nextBottom - nextTop)
    };
  }

  const left = Math.max(0, Math.min(current.left, sampled.left));
  const top = Math.max(0, Math.min(current.top, sampled.top));
  const right = Math.min(fullWidth, Math.max(current.left + current.width, nextRight));
  const bottom = Math.min(fullHeight, Math.max(current.top + current.height, nextBottom));
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  };
}
