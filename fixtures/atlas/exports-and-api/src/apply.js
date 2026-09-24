export async function openIssue(org, repo, token) {
  await fetch(`https://api.github.com/repos/${org}/${repo}/issues`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title: 'registry drift' }),
  });
}

export async function openPull(octokit, owner, repo) {
  await octokit.rest.pulls.create({ owner, repo, head: 'sync', base: 'main', title: 'sync' });
}

export async function readRepo(org, repo) {
  return fetch(`https://api.github.com/repos/${org}/${repo}`);
}
