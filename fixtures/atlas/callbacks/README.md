# callbacks

A server entry the way ollama-intern-mcp's is shaped: it returns early when
asked for its version, then loads its config, makes the server and registers
tool handlers and a close handler as callbacks. The handlers run when a
request arrives, not as steps of main, and the early return is the other
way main can go, not its first step.
