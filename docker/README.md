# Atlas container

```sh
# The CLI on the repository in this directory (exit codes pass through)
docker run --rm -v "$PWD:/repo" --user "$(id -u):$(id -g)" ghcr.io/dogfood-lab/atlas map
docker run --rm -v "$PWD:/repo" --user "$(id -u):$(id -g)" ghcr.io/dogfood-lab/atlas check

# The fleet service, with compose
mkdir -p atlas-data repos
cp fleet.example.yml atlas-data/fleet.yml   # then edit the list
docker compose -f compose.example.yml up -d
# http://127.0.0.1:8080/                      the fleet list
# http://127.0.0.1:8080/?repo=owner/name      one repository's page
# http://127.0.0.1:8080/atlas/owner/name/README.md
# http://127.0.0.1:8080/llms.txt              the index for agents, one line per repository

# The fleet service, without compose
docker run -d --name atlas -p 127.0.0.1:8080:8080 \
  -v "$PWD/atlas-data:/data" -v "$PWD/repos:/repos:ro" ghcr.io/dogfood-lab/atlas

# Build the image locally, from the repository root (installs this tree's version from npm)
docker build -f docker/Dockerfile -t atlas:local .
```
