# dotnet-projects

An Atlas fixture for a .NET desktop app CI tests and publishes, the shape
registry-stats' Desktop CI has: `dotnet test` on the test project, and a
PowerShell step that runs `dotnet publish $env:APP_PROJECT` to build the
MSIX, the project named in the job's env. The test project is run, never
checked, and the app project is built.
