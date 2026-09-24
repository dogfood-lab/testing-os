import { pathToFileURL } from 'node:url';

export function greet(name) {
  return `hello ${name}`;
}

function main() {
  console.log(greet(process.argv[2] ?? 'world'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
