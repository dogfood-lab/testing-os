# workspace-root

An Atlas fixture for a command whose workspace root is found at run time,
the shape style-dataset-lab's `getWorkspaceRoot()` has: an environment
variable, a walk up from the working directory, the module's own root when
it holds `projects/`, and the working directory as the last resort. The
root falls back to where the command runs, so `projects/` is the user's
place: no workflow generates it, though CI runs the command once in the
repository and the repository keeps an example project.
