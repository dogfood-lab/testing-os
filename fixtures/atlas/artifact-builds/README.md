# artifact-builds

An Atlas fixture. Four workflows build an artifact of this repository: a
container image with docker build and with docker/build-push-action (the
Dockerfile copies package.json, src/ and an entrypoint script, runs the build
script, and starts the entrypoint), a wheel with python -m build (hatch packs
camp/), and a binary with pyinstaller from the entry the workflow's env names.
