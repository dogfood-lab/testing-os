# action-jobs

An Atlas fixture for jobs whose work is done by actions, the shape the
organization `.github` repository has. Docs Quality lints Markdown with
markdownlint-cli2 and checks links with lychee in jobs made only of `uses:`
steps, beside a job that runs a script. Org Guard lists the organization's
repositories and reads each one through `gh api`, which is a read of other
repositories, never of this one.
PR comment lists its own pull request's comments through
`repos/${REPO}/issues/...`, the workflow's own repository, which is no
read of another.
