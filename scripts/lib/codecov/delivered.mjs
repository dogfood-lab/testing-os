/**
 * Whether Codecov holds coverage for a repository's default branch, read
 * from Codecov's public API after the first upload from main. Codecov keeps
 * the default branch it first saw: a repository whose history began on
 * master can stay there after GitHub moved to main, and then every upload
 * from main lands on a branch Codecov does not show.
 *
 * @param {{ slug: string, defaultBranch: string | null }} repository
 * @param {(url: string, init?: object) => Promise<{ status: number, json: () => Promise<any> }>} fetch
 * @returns {Promise<{ delivered: boolean, line: string }>}
 */
export async function deliveryOf({ slug, defaultBranch }, fetch) {
  const [owner, name] = slug.split('/');
  let response;
  try {
    response = await fetch(`https://api.codecov.io/api/v2/github/${owner}/repos/${name}/`, { headers: { accept: 'application/json' } });
  } catch (error) {
    return { delivered: false, line: `could not reach api.codecov.io (${error.message})` };
  }
  if (response.status === 404) return { delivered: false, line: 'not on Codecov yet; it appears after the first upload' };
  if (response.status !== 200) return { delivered: false, line: `Codecov answered ${response.status}` };
  const body = await response.json();
  const branch = String(body.branch ?? '');
  const coverage = body.totals?.coverage;
  const figure = coverage == null ? null : `${Number(coverage)}% on ${branch}`;
  if (body.active === false) return { delivered: false, line: "on Codecov but not active; activate it in the repository's Codecov settings" };
  if (defaultBranch != null && branch !== defaultBranch) return { delivered: false, line: `Codecov reads ${branch}, and GitHub's default branch is ${defaultBranch}; set ${defaultBranch} in the repository's Codecov settings` };
  if (defaultBranch == null && branch !== 'main') return { delivered: false, line: `Codecov reads ${branch}; if GitHub's default branch is not ${branch}, set it in the repository's Codecov settings${figure ? ` (${figure})` : ''}` };
  if (figure == null) return { delivered: false, line: `on Codecov, and no coverage on ${branch} yet` };
  return { delivered: true, line: `delivered, ${figure}` };
}
