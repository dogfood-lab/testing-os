#!/bin/sh
# One image, two entrypoints. An Atlas verb runs the CLI on the repository
# mounted at /repo; atlas-fleet, the default, runs the service; anything else
# runs as given. exec keeps the exit code and the signals.
set -e
case "${1:-atlas-fleet}" in
  init|map|check|explain|diff) exec atlas "$@" ;;
  atlas-fleet) if [ "$#" -gt 0 ]; then shift; fi; exec atlas-fleet "$@" ;;
  *) exec "$@" ;;
esac
