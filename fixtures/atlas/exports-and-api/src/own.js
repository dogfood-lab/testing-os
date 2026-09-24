export async function report(github, context) {
  await github.rest.issues.create({ ...context.repo, title: 'nightly report' });
}
