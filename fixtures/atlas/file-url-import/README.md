# file-url-import

An Atlas fixture for a module loaded by a file: URL, the shape sovereign's
determinism test has: `pathToFileURL(resolve(HERE,
'../tools/diagnosis/sim.mjs')).href` held in a const, then `await
import(simUrl)`. The path is an import of that file, never a read of it.
