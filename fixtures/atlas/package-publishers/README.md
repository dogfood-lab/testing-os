# package-publishers

Atlas fixtures, one repository per directory, each a package with a main:
unpublished has no workflow that publishes it; published runs npm publish on
a tag; declared marks itself "private": false and has a release workflow.

extension is a VS Code extension that vsce and ovsx publish, one of them only
by hand. member publishes two workspace members, one from a step's
working-directory and one after a cd, and checks the tarball with npm publish
--dry-run, which publishes nothing; its root package is never published.
chosen publishes the one package under packages/ that the pushed tag names.
