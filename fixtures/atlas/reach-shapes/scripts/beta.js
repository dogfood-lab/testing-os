export async function run(argv) {
  if (argv.length === 0) throw new Error('beta needs a project');
  return argv[0];
}
