#!/usr/bin/env bash
PROJECT_DIR="$(pwd)"
echo "Building plugin in $PROJECT_DIR"

# The host's glibc is too old to run the decky CLI binary directly, so it
# runs inside an ubuntu:24.04 container instead. The project dir and /tmp
# are bind-mounted at identical paths so decky's own docker invocations
# (backend build, temp staging dir) resolve correctly against the host
# Docker daemon (reached via the mounted socket).
docker run --rm \
  -v "$PROJECT_DIR:$PROJECT_DIR" \
  -v /tmp:/tmp \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -w "$PROJECT_DIR" ubuntu:24.04 \
  bash -c "apt-get update -qq && apt-get install -y -qq libssl3 ca-certificates docker.io >/dev/null && ./cli/decky plugin build $PROJECT_DIR"
