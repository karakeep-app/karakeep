import { execFileSync } from "child_process";
import * as path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

// The directory holding the e2e docker-compose.yml.
const composeDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

// Prints "<user namespace> <process type>" for each Chrome process, with
// "browser" for the one that has no --type. Matching on the start of the
// command line keeps this script (whose own command line mentions --type)
// out of the results. A process that exits between the two reads is
// skipped rather than printed with an empty namespace.
const inspectScript = `
for d in /proc/[0-9]*; do
  c=$(tr "\\0" " " < "$d/cmdline" 2>/dev/null)
  case "$c" in
    /opt/google/*|/usr/lib/chromium/*) ;;
    *) continue ;;
  esac
  n=$(readlink "$d/ns/user" 2>/dev/null) || continue
  t=$(echo "$c" | grep -oE -- "--type=[a-z-]+" | head -n 1)
  echo "$n \${t#--type=}"
done
`;

interface ChromeProcess {
  userns: string;
  type: string;
}

function inspectChromeProcesses(): ChromeProcess[] {
  const output = execFileSync(
    "docker",
    ["compose", "exec", "-T", "chrome", "sh", "-c", inspectScript],
    { cwd: composeDir, encoding: "utf8" },
  );
  return output
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const [userns, type] = line.split(" ");
      return { userns, type: type || "browser" };
    });
}

describe("Chrome sandbox", () => {
  it("runs renderers in their own user namespace under the seccomp profile", () => {
    const processes = inspectChromeProcesses();
    const browser = processes.filter((p) => p.type === "browser");
    const renderers = processes.filter((p) => p.type === "renderer");

    expect(browser.length).toBeGreaterThan(0);
    expect(renderers.length).toBeGreaterThan(0);
    // Only compare namespaces that were actually read.
    for (const p of processes) {
      expect(p.userns, p.type).toMatch(/^user:\[\d+\]$/);
    }
    // With --no-sandbox, every renderer shares the browser's namespace.
    const browserNamespaces = new Set(browser.map((p) => p.userns));
    for (const r of renderers) {
      expect(browserNamespaces.has(r.userns), r.userns).toBe(false);
    }
  });
});
