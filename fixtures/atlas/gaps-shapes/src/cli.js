export function main(argv) {
  if (argv.includes('--help')) return 'usage: importedcli <file>';
  try {
    return JSON.parse(argv[0]);
  } catch {
    return null;
  }
}
