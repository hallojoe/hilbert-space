import { Vector3 } from 'three';
import { hilbert3D } from 'three/addons/utils/GeometryUtils.js';

export const MIN_ORDER = 1;
export const MAX_ORDER = 6;

/** Order n visits all 8^n cells once, in face-adjacent order. */
export function createHilbert(order) {
  if (!Number.isInteger(order) || order < MIN_ORDER || order > MAX_ORDER) {
    throw new RangeError(`Order must be an integer from ${MIN_ORDER} to ${MAX_ORDER}.`);
  }
  // GeometryUtils calls its eight-corner base case iteration zero.
  const points = hilbert3D(new Vector3(), 1, order - 1);
  const extent = 1 - 1 / (2 ** order);
  const positions = new Float32Array(points.length * 3);
  points.forEach((point, index) => point.multiplyScalar(1 / extent).toArray(positions, index * 3));
  return positions;
}

export function clampReveal(value, total) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.min(total, Math.floor(Number(value)))) : 0;
}
