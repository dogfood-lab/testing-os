# shell-arrays

An Atlas fixture for a bash array of manifests a release step hands to jq,
the shape storyboard-os has. The paths inside PKG_JSONS=( ... ) are values,
not commands, and jq reads what it is handed; the release runs neither
manifest.
