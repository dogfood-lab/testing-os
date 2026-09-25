# gated-image

An Atlas fixture for an image a release builds only on a release event,
the shape comfy-headless's Publish has: the docker build step is held to
`github.event_name == 'release'`, and its Dockerfile copies the manifest
and the package into the image. What it copies is packed on that event,
and counted nowhere as a check.
