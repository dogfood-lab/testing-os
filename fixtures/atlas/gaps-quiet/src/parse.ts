export function parse(text: string): number[] {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`not a list: ${String(error)}`);
  }
}
