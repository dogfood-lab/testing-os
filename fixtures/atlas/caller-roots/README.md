# caller-roots

An Atlas fixture. Every write here goes somewhere the caller decides: the
home directory through a helper in another file (JavaScript and Python), a
path handed in on the command line (with and without a default that shares
its name with the tracked data/keep.json), an environment variable, the
working directory through Path.cwd() and a directory that defaults to ".",
and a relative Path whose root an environment variable may override. A
workflow runs both tools from the repository root.
