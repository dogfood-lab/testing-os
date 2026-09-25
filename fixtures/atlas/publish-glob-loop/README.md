# publish-glob-loop

An Atlas fixture for a release that packs and publishes every package a
shell loop over packages/*/ covers, the shape motif has: each pass packs the
package in its directory and publishes the tarball, skipping a private one.
The release publishes the two public packages by name.
