import { argv } from 'node:process';

async function main() {
  console.log(argv.slice(2).join(' '));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
