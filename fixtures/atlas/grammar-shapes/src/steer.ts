import { mint } from './mint.js';

export function steer(dx: number, aligned: boolean) {
  return { left: dx < -3, right: dx > 3, fire: aligned, coin: mint };
}
