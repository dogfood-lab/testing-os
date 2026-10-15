declare function identity<T>(value: unknown): T;
export const kind = identity<typeof import('lib-t')>(null);
export let query: typeof import('lib-u');
export type Foo = import('lib-v').Foo;
export function f(a: import('lib-x').Opts): void {}
export const value = await import('lib-y');
