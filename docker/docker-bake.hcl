# Builds all the images for a single architecture in one BuildKit session so
# that the stages they share (deps install, app builds, monolith, ...) are only
# built once.
#
# Usage: ARCH=amd64 docker buildx bake -f docker/docker-bake.hcl --push

# The architecture to build for (amd64 or arm64). Tags and caches are suffixed
# with it; the manifest job in CI stitches the architectures together.
variable "ARCH" {
  default = "amd64"
}

# The release name. When empty, the images are tagged as `latest`, otherwise
# they're tagged with the release name and `release`.
variable "RELEASE" {
  default = ""
}

variable "SERVER_VERSION" {
  default = "nightly"
}

variable "CACHE_REPO" {
  default = "ghcr.io/karakeep-app/karakeep-build-cache"
}

function "tags" {
  params = [repos]
  result = flatten([
    for repo in repos : RELEASE == ""
    ? ["${repo}:latest-${ARCH}"]
    : ["${repo}:${RELEASE}-${ARCH}", "${repo}:release-${ARCH}"]
  ])
}

# Each image exports its full (mode=max) build graph to its own cache ref.
# packages/e2e_tests/docker-compose.yml imports the aio-amd64 cache, so keep it
# in sync when renaming the refs.
function "cache_from" {
  params = [name]
  result = ["type=registry,ref=${CACHE_REPO}:${name}-${ARCH}"]
}

function "cache_to" {
  params = [name]
  result = ["type=registry,mode=max,ref=${CACHE_REPO}:${name}-${ARCH}"]
}

group "default" {
  targets = ["web", "workers", "cli", "mcp", "aio"]
}

target "_common" {
  context    = "."
  dockerfile = "docker/Dockerfile"
  platforms  = ["linux/${ARCH}"]
  args = {
    SERVER_VERSION = SERVER_VERSION
  }
}

target "web" {
  inherits   = ["_common"]
  target     = "web"
  tags       = tags(["ghcr.io/hoarder-app/hoarder-web", "ghcr.io/karakeep-app/karakeep-web"])
  cache-from = cache_from("web")
  cache-to   = cache_to("web")
}

target "workers" {
  inherits   = ["_common"]
  target     = "workers"
  tags       = tags(["ghcr.io/hoarder-app/hoarder-workers", "ghcr.io/karakeep-app/karakeep-workers"])
  cache-from = cache_from("workers")
  cache-to   = cache_to("workers")
}

target "cli" {
  inherits   = ["_common"]
  target     = "cli"
  tags       = tags(["ghcr.io/hoarder-app/hoarder-cli", "ghcr.io/karakeep-app/karakeep-cli"])
  cache-from = cache_from("cli")
  cache-to   = cache_to("cli")
}

target "mcp" {
  inherits   = ["_common"]
  target     = "mcp"
  tags       = tags(["ghcr.io/karakeep-app/karakeep-mcp"])
  cache-from = cache_from("mcp")
  cache-to   = cache_to("mcp")
}

target "aio" {
  inherits   = ["_common"]
  target     = "aio"
  tags       = tags(["ghcr.io/hoarder-app/hoarder", "ghcr.io/karakeep-app/karakeep"])
  cache-from = cache_from("aio")
  cache-to   = cache_to("aio")
}
