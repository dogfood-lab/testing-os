export function parseFlags(argv) {
  return { positionals: argv.filter((arg) => !arg.startsWith('-')) };
}
