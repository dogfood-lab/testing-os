# door-only-tests

A repository whose code is C# and PowerShell, which Atlas does not read,
with a C# test project and a site. The only parts the map reads are the
tests and the site, so it can say nothing about which code part a test
touches, and must not claim every code part it reads is tested.
