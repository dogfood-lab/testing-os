# unread-claims

Two files the parser cannot read, the way glyphstudio and ollama-intern-mcp
hold them: a JSX label with a bare `&` in its text, and a generator with a NUL
character inside a string. The page must name each construct, and every claim
that nothing does something must say it covers only the files it could read.
The map now reads a bare `&` in JSX text by rewriting it, so the label's file
ends in a line of syntax nothing reads, which keeps it unread and named by the
`&` its parse first stops on. It reads a NUL byte as a space as well, so the
generator ends in the same line, and is named as other syntax.
