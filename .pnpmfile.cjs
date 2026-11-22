// tRPC declares TypeScript as a peer dependency, though it only needs it for
// its types. pnpm resolves that peer into the lockfile, so `pnpm deploy --prod`
// ships TypeScript (and TypeScript 7's native Go compiler, which vulnerability
// scanners flag) in the workers' Docker image. Dropping the peer keeps it out.
// Every workspace package that runs `tsc` must declare typescript as its own
// devDependency rather than rely on it arriving through this peer.
function readPackage(pkg) {
  if (pkg.name?.startsWith("@trpc/") && pkg.peerDependencies?.typescript) {
    delete pkg.peerDependencies.typescript;
    delete pkg.peerDependenciesMeta?.typescript;
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
