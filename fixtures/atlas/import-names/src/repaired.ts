// The grammar cannot read typeof import() as the type argument of an awaited call;
// the repair pass reads the file again with the construct rewritten.
declare function importOriginal<T>(): Promise<T>;
// import(…).Item[] is the other construct the grammar stops on: this one is read by the repair pass.
export type Items = import('lib-s').Item[];
export async function load() {
  const actual = await importOriginal<typeof import('lib-r')>();
  return actual;
}
