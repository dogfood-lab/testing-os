# release-binaries

An Atlas fixture for a release that builds binaries and uploads them, the
shapes saints-mile and commandui have. Release Binaries builds the game on
two systems of a matrix and into an MSIX package, and a later job uploads
what they built to the release that started the run (softprops on a
release event, gh release upload by hand). Release Desktop builds the
Tauri app and uploads its MSI and NSIS installers. Tag Release creates a
release on a tag push and ships nothing it builds, and Release Notes uploads
files no build here makes.
