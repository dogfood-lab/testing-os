# config-readers

An Atlas fixture for files that configuration names, the shapes stillpoint's
desktop app uses. app/tauri.conf.json lists the icons app/gen-icons.mjs
draws, relative to itself; msix/AppxManifest.xml names the logos
msix/gen-assets.mjs draws, with backslashes, as element text and as
attribute values; msix/build-msix.ps1 copies the manifest and the logos into
msix/layout/ with Copy-Item, through variables built with Join-Path from
$PSScriptRoot. data/notes.json quotes a logo's path and configures nothing.
CI runs both generators.
