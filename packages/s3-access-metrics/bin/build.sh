#!/bin/sh

docker run \
  --rm \
  --mount type=bind,source="$(pwd)",target=/source \
  node:8.10-alpine \
  /source/bin/docker-build.sh
