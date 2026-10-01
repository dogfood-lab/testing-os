param([string]$Version)
dotnet pack src/Core/Core.csproj -c Release -p:Version=$Version
