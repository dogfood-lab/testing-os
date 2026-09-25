# import-table

An Atlas fixture for a command that loads its subcommands through a table,
the shape style-dataset-lab has. bin/tool.js holds a const object literal of
script paths and loads the one a command names, once straight from the
table and once through a const bound to the lookup; every path the tables
hold is one it may load. Its entry also loops over namespaces and returns
early when the command names one, a condition on the loop's variable.
