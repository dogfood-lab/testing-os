export function checkLinks(pages: string[]) {
  return pages.filter((page) => page.endsWith('.md'));
}
