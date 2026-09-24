<#
.SYNOPSIS
  Stage the MSIX layout.
#>
$Root = Split-Path -Parent $PSScriptRoot
$MsixDir = Join-Path $Root "msix"
$LayoutDir = Join-Path $MsixDir "layout"

# Copy manifest
Copy-Item (Join-Path $MsixDir "AppxManifest.xml") -Destination $LayoutDir

# Copy assets
Get-ChildItem (Join-Path $MsixDir "Assets\*.png") | ForEach-Object {
  Copy-Item $_.FullName -Destination (Join-Path $LayoutDir "Assets")
}
