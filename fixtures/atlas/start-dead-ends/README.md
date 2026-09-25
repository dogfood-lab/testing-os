# start-dead-ends

Atlas fixtures for where a path never starts or ends, one repository per
directory. In gate/ a pull request runs a script that checks the package
and imports nothing here, beside the tests node --test finds by its own
patterns; the path never ends on the gate script, and goes through the
tests into src/ instead. In constant/ a door builds a site whose src/ holds
a content config (imports and one object) beside the code that does the
work; the path starts at the code, never at the config.
