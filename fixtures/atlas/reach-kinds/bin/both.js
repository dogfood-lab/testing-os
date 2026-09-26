export function both() {
  return 'both';
}

if (process.argv[1]?.endsWith('both.js')) console.log(both());
