# Atlas as a container: the CLI on a mounted repository, and the fleet
# service that maps a list of repositories on a schedule and serves their
# pages, keeping every map, history and state on the /data volume.
#
# Built from the repository root:
#   docker build -f docker/Dockerfile --build-arg ATLAS_VERSION=<x.y.z> -t atlas .
#
# The package is installed from npm at the release version, never copied from
# this tree, so the image runs what every other consumer runs. The only files
# taken from the tree are the page the service serves and this directory's
# entrypoint.

# node:22-alpine, pinned by digest so a rebuild of the same tag is the same base.
FROM node:22-alpine@sha256:b6f26b36c8ff49624cfdac716b8ea1138d606df02586a77d364bb5536a634f85

# The version to install. The default is the root package.json version,
# stamped here by scripts/sync-version.mjs; the release job passes the tag's.
ARG ATLAS_VERSION=1.22.0

# git reads every repository, mounted or cloned. A mounted checkout belongs to
# the host's user, not the container's, so git is told to trust it; the
# service only ever reads it.
RUN apk add --no-cache git \
 && git config --system --add safe.directory '*' \
 && git config --system advice.detachedHead false

# The release job starts this build right after the npm publish, and the
# registry can take a few minutes to serve a new version everywhere. Up to
# ten tries, thirty seconds apart, cover that; a version that never appears
# fails the build.
RUN test -n "$ATLAS_VERSION" || { echo "ATLAS_VERSION is required, e.g. --build-arg ATLAS_VERSION=x.y.z"; exit 1; }; \
    for attempt in 1 2 3 4 5 6 7 8 9 10; do \
      if npm install --global --omit=dev --ignore-scripts --no-audit --no-fund "@dogfood-lab/atlas@${ATLAS_VERSION}"; then \
        break; \
      fi; \
      if [ "$attempt" -eq 10 ]; then echo "@dogfood-lab/atlas@${ATLAS_VERSION} did not install after 10 tries"; exit 1; fi; \
      echo "@dogfood-lab/atlas@${ATLAS_VERSION} not installable yet (try ${attempt}); waiting 30s"; \
      sleep 30; \
    done; \
    npm cache clean --force; \
    test "$(node -p "require('/usr/local/lib/node_modules/@dogfood-lab/atlas/package.json').version")" = "$ATLAS_VERSION"

# The page the service serves at / and /?repo=owner/name.
COPY site/public/atlas/index.html site/public/atlas/render.js site/public/atlas/hero.webp /srv/atlas/
COPY docker/entrypoint.sh /usr/local/bin/atlas-entrypoint

# A checkout made with CRLF line endings would hand sh a script it cannot run.
RUN sed -i 's/\r$//' /usr/local/bin/atlas-entrypoint \
 && chmod 0755 /usr/local/bin/atlas-entrypoint \
 && mkdir -p /data /repo \
 && chown node:node /data /repo

USER node
ENV ATLAS_DATA=/data ATLAS_ASSETS=/srv/atlas

# The source label links the GHCR package to this repository, which is what
# lets the release job's workflow token push to it.
LABEL org.opencontainers.image.source="https://github.com/dogfood-lab/testing-os" \
      org.opencontainers.image.description="Atlas: map repositories onto named boundaries, and serve a private fleet of their pages" \
      org.opencontainers.image.licenses="MIT"

# The persistent memory: fleet.yml, every render, its history and the state
# that decides what is unchanged. Without it each start is the first map.
VOLUME /data
WORKDIR /repo
EXPOSE 8080

# `docker run … atlas map` (or just `map`) runs the CLI in /repo and passes
# its exit code through; with no command the fleet service starts.
ENTRYPOINT ["/usr/local/bin/atlas-entrypoint"]
CMD ["atlas-fleet"]
