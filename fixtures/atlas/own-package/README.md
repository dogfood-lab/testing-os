# own-package

An Atlas fixture for a site that depends on the repository's own package
by a `file:` path, the shapes site-theme and registry-stats have:
`site/package.json` declares `"@f/theme": "file:.."`, and the site's
config and a script import it by name. The name resolves to the root
package, so the site imports `types` and `src`; none of these imports is
unresolved.
