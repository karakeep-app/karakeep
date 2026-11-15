import { execFileSync } from "child_process";
import * as path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

// The directory holding the e2e docker-compose.yml.
const composeDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

// Prints "<name> <uid> <CapEff> <CapBnd> <NoNewPrivs>" for the web server and
// the workers. Matching on the start of the command line keeps this script
// (whose own command line mentions both names) out of the results.
const inspectScript = `
for d in /proc/[0-9]*; do
  c=$(tr "\\0" " " < "$d/cmdline" 2>/dev/null)
  case "$c" in
    "node dist/index.js"*) name=workers ;;
    next-server*) name=web ;;
    *) continue ;;
  esac
  echo "$name $(awk '/^Uid:/ { u = $2 } /^CapEff:/ { e = $2 } /^CapBnd:/ { b = $2 } /^NoNewPrivs:/ { n = $2 } END { print u, e, b, n }' "$d/status")"
done
`;

interface ProcessPrivileges {
  name: string;
  uid: string;
  capEff: string;
  capBnd: string;
  noNewPrivs: string;
}

function inspectAppProcesses(): ProcessPrivileges[] {
  const output = execFileSync(
    "docker",
    ["compose", "exec", "-T", "web", "sh", "-c", inspectScript],
    { cwd: composeDir, encoding: "utf8" },
  );
  return output
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const [name, uid, capEff, capBnd, noNewPrivs] = line.split(" ");
      return { name, uid, capEff, capBnd, noNewPrivs };
    });
}

describe("Docker image privileges", () => {
  it("runs the web server and workers with only the capabilities they need", () => {
    const processes = inspectAppProcesses();

    expect(processes.map((p) => p.name).sort()).toEqual(["web", "workers"]);
    // CHOWN (bit 0), DAC_OVERRIDE (bit 1) and FOWNER (bit 3), see
    // docker/root/etc/s6-overlay/scripts/drop-privileges.
    const expectedCaps = "000000000000000b";
    for (const p of processes) {
      expect(p, p.name).toEqual({
        name: p.name,
        uid: "0",
        capEff: expectedCaps,
        capBnd: expectedCaps,
        noNewPrivs: "1",
      });
    }
  });
});
