export function clean(values: number[]): number[] {
  return values.filter((value) => Number.isFinite(value));
}
