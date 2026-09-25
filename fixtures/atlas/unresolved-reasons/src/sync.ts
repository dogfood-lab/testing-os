export async function load(): Promise<unknown> {
  const pkgName = '@x/optional';
  return import(/* @vite-ignore */ pkgName).catch(() => null);
}
