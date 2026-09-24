# start-tests

Atlas fixtures for "Where to start" when the pull request's door runs only
tests, one repository per directory. In command/ the manifest installs two
commands; the path starts at the entry of the one named for the package and
passes the engine's barrel through to the file its call reaches. The
package's own entry holds one constant. In package/ nothing is installed but
the package, whose entry is a barrel; the path starts past it. In constant/
nothing is installed, and the test imports a file holding one constant before
the file that does the work; the path starts at the one doing the work.
