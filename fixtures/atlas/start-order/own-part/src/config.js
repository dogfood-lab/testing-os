export function loadConfig(argv) {
  return { verbose: argv.includes('--verbose') };
}
