export function format(values: number[], note: string): string {
  return `${values.join(',')} ${note}`;
}
