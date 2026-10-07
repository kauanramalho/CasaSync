export function cropGeometry(imageWidth, imageHeight, width, height, crop) {
  const zoom = Math.max(1, Math.min(3, Number(crop.zoom) || 1));
  const scale = Math.max(width / imageWidth, height / imageHeight) * zoom;
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const shiftX = Math.max(0, (drawWidth - width) / 2);
  const shiftY = Math.max(0, (drawHeight - height) / 2);
  return {
    drawWidth, drawHeight, shiftX, shiftY,
    dx: (width - drawWidth) / 2 + Math.max(-40, Math.min(40, Number(crop.x) || 0)) / 40 * shiftX,
    dy: (height - drawHeight) / 2 + Math.max(-40, Math.min(40, Number(crop.y) || 0)) / 40 * shiftY
  };
}

export function panCrop(crop, dx, dy, geometry) {
  return {
    ...crop,
    x: geometry.shiftX ? Math.max(-40, Math.min(40, crop.x + dx / geometry.shiftX * 40)) : 0,
    y: geometry.shiftY ? Math.max(-40, Math.min(40, crop.y + dy / geometry.shiftY * 40)) : 0
  };
}
