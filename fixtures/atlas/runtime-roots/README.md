# runtime-roots

Writes whose root is decided when the code runs, each the shape one fleet
repository uses: a backup under a directory handed in as a parameter (with a
canon/ subdirectory that shares its name with this repository's placeholder
canon/, which holds only a .gitkeep), a path under the git root of the
caller's working directory, a save path destructured from an argument object,
an artifact directory an environment variable sets or the home directory
defaults, and a log path a class takes from its constructor, defaulting to one
of those. Each is counted outside this repository. records.js joins a
parameter with records/, and lands there: the one call to it passes this
repository's root, built from the calling file's own location.
