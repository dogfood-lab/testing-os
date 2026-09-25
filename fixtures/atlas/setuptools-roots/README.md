# setuptools-roots

An Atlas fixture for Python source roots setuptools names, the shape
armature has: package-dir puts top-level modules under tools/, and a
packages.find where names lib/. Imports of those packages resolve, and a
test's import of a stub module beside it resolves, as pytest puts the
test's directory on its path.
