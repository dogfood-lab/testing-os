# test-writes

A test that rewrites committed example files every time it runs, the way
glyphstudio's materialize.test.ts does, through a helper it hands each path
built from its own location; and a script that saves a Pillow image into a
committed directory, the way sprite-foundry-packs' gen_previews.py does.
Both write tracked files, so CI, which runs both, writes them, and the page
lists them as generated, the first by a test.
