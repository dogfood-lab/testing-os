# container-starts

What an image starts is the run a container build makes. packages/node/Dockerfile
builds in one stage and starts the build output from another, the way attestia's
GHCR image does: `CMD ["node", "packages/node/dist/main.js"]` is
packages/node/src/main.ts, traced through the stage copies and the package's
tsconfig. worker/Dockerfile is the default Dockerfile of the worker context and
starts its script with a shell-form ENTRYPOINT from its own WORKDIR.

cli/Dockerfile copies pyproject.toml into a Python image and starts `camp`,
which package.json also installs as an npm bin; inside that image `camp` is the
console script pyproject.toml declares, since the package.json was never copied.
