# stage-read

An Atlas fixture for a workflow that runs the script writing a data file,
reads the file to check it, and stages it for a commit, the shape
registry-stats' daily refresh has. The script writes the file; the
workflow's own steps only read and stage it, so the workflow is no writer.
