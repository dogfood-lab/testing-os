export function load(argv) {
  return { names: argv.filter((word) => !word.startsWith('-')) };
}
