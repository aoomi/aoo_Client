export const LAYOUT_UUID = 'd2a70b67-5fb2-4d77-984b-74e31aaae109';

export function compressUuid (uuid) {
  const hex = uuid.replaceAll('-', '');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = hex.slice(0, 5);
  for (let index = 5; index < 32; index += 3) {
    const value = Number.parseInt(hex.slice(index, index + 3), 16);
    result += alphabet[value >> 6] + alphabet[value & 63];
  }
  return result;
}

export const LAYOUT_TYPE = compressUuid(LAYOUT_UUID);

export function expectedGeometry (owner, padding) {
  return {
    anchor: { x: 0, y: 1 },
    position: {
      x: -owner.anchorX * owner.width + padding.left,
      y: -owner.anchorY * owner.height + owner.height - padding.top,
    },
    size: {
      width: Math.max(0, owner.width - padding.left - padding.right),
      height: Math.max(0, owner.height - padding.top - padding.bottom),
    },
  };
}
