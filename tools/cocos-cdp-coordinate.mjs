/**
 * Convert a Cocos UI node world position to a browser client coordinate for CDP input.
 *
 * Cocos world coordinates already include the Canvas node's runtime translation. Subtracting
 * Canvas.worldPosition a second time makes rendered controls and event hit points diverge when
 * SHOW_ALL exposes a viewport wider than the 1280x720 design resolution.
 */
export function cocosWorldToClient({ world, canvasRect, viewport, design, scale }) {
  for (const [name, value] of Object.entries({
    worldX: world?.x,
    worldY: world?.y,
    rectLeft: canvasRect?.left,
    rectTop: canvasRect?.top,
    viewportX: viewport?.x,
    viewportY: viewport?.y,
    designHeight: design?.height,
    scaleX: scale?.x,
    scaleY: scale?.y,
  })) {
    if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  }
  if (scale.x <= 0 || scale.y <= 0 || design.height <= 0) {
    throw new RangeError('design height and view scales must be positive');
  }
  return {
    x: canvasRect.left + viewport.x + world.x * scale.x,
    y: canvasRect.top + viewport.y + (design.height - world.y) * scale.y,
  };
}

/** Expression body suitable for Runtime.evaluate in task-local CDP drivers. */
export const COCOS_WORLD_TO_CLIENT_EXPRESSION = `({ world, canvasRect, viewport, design, scale }) => ({
  x: canvasRect.left + viewport.x + world.x * scale.x,
  y: canvasRect.top + viewport.y + (design.height - world.y) * scale.y,
})`;
