# cache-dirs

An Atlas fixture for a cache directory a helper builds from the platform's
per-user variables, the shape npm-launcher has: $XDG_CACHE_HOME, and
%LOCALAPPDATA% on Windows, else ~/.cache. What the command writes there is
in the home directory, never a path its caller passes.
