# import-names

An Atlas fixture for what an import of a package binds (docs/atlas-buildup.spec.md, slice AQ):
src/main.ts imports packages in every form the extractor reads, and src/plain.cjs destructures a
require. importNames records, for each, the names taken from the module and which are only types.
