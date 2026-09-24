# grammar-shapes

An Atlas fixture for three constructs TypeScript accepts that the vendored
tree-sitter grammar does not: typeof import(...) as a type argument, the
shape vitest's importOriginal mocks take in xrpl-creator-capsule; an
import(...) type followed by [], as forkctl declares Dirent[]; and a bare &
in JSX text, on the line of a tag and on a line of its own. After those,
four more: typeof import(...) on a line of its own with a trailing comma
(src/trailing.test.ts), two comparisons in one object literal, which the
grammar reads as type arguments (mcp-arcade-cabinets' { left: dx < -3,
right: dx > 3 }, src/steer.ts), abstract as a variable name (ai-jam-sessions'
generate-public.ts, src/card.ts), a raw NUL byte in a comment and in a
string (src/raw-byte.ts), and world-forge's &#128274; padlock, a decimal
character reference past five digits in JSX text (src/lock.tsx). Each file also imports something, so a reading that
parses it records the import. Next to them, src/broken.ts holds syntax
nothing reads.
