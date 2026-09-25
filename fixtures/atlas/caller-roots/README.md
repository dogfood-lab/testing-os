# caller-roots

An Atlas fixture. Every write here goes somewhere the caller decides: the
home directory through a helper in another file (JavaScript and Python), a
path handed in on the command line (with and without a default that shares
its name with the tracked data/keep.json), an environment variable, the
working directory through Path.cwd(), a parameter that defaults to "."
(the caller's, as any parameter's default is), and a relative Path whose root an environment variable may override. A
workflow runs both tools from the repository root.
