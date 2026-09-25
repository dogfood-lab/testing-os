# test-spawn-joined

An Atlas fixture for a test that runs a script as a child process through
a joined path held in a const, the shape mcp-tool-registry has: the command
line is a template in a const, and the script's path is joined from the
test's own directory. The script is touched by a test through that spawn.
