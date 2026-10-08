// Fit popovers to both portrait and short landscape/keyboard viewports.
export function fitPopover(rect, viewport, { preferredWidth = rect.width, preferredHeight = 288, gap = 8, padding = 16 } = {}) {
  const width = Math.max(0, Math.min(preferredWidth, viewport.width - padding * 2));
  const below = Math.max(0, viewport.height - rect.bottom - padding - gap);
  const above = Math.max(0, rect.top - padding - gap);
  const openAbove = below < preferredHeight && above > below;
  const maxHeight = Math.min(preferredHeight, Math.max(above, below), Math.max(0, viewport.height - padding * 2));
  const top = openAbove ? rect.top - gap - maxHeight : rect.bottom + gap;
  return {
    left: Math.max(padding, Math.min(rect.left, viewport.width - width - padding)),
    top: Math.max(padding, Math.min(top, viewport.height - padding - maxHeight)),
    width,
    maxHeight
  };
}
