// Controlled HTTP responses for the crawler's concurrent-save regression tests.
import http from "node:http";

const states = new Map();
const goodHtml = `<!doctype html><html><head><title>Good title</title></head><body><article><h1>Good article</h1><p>${"Reliable saved content. ".repeat(80)}</p></article></body></html>`;

function send(res, status, type, body) {
  if (res.writableEnded) return;
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

function hold(res, state, key, release) {
  state[key] = true;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timeout);
    release();
  };
  const timeout = setTimeout(finish, 50_000);
  state[`release_${key}`] = finish;
  res.on("close", () => clearTimeout(timeout));
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://fixture");
    if (url.pathname === "/health") return send(res, 200, "text/plain", "ok");
    const control =
      /^\/control\/([^/]+)(?:\/(init|release_banner|release_good_banner|release_good|release_probe|release_missing))?$/.exec(
        url.pathname,
      );
    if (control) {
      const [, id, action] = control;
      if (action === "init") {
        states.set(id, {
          mode: url.searchParams.get("mode"),
          status: Number(url.searchParams.get("status")),
          browserRequests: 0,
          probeRequests: 0,
        });
        return send(res, 200, "text/plain", "ok");
      }
      const state = states.get(id);
      if (!state) return send(res, 404, "text/plain", "unknown fixture");
      if (action === "release_banner") state.release_bannerWaiting?.();
      if (action === "release_good_banner") state.release_goodBannerWaiting?.();
      if (action === "release_good") state.release_goodWaiting?.();
      if (action === "release_probe") state.release_probeWaiting?.();
      if (action === "release_missing") state.release_missingWaiting?.();
      return send(res, 200, "application/json", JSON.stringify(state));
    }
    const target = /^\/crawl-race\/([^/]+)\/(page|banner|good-banner)$/.exec(
      url.pathname,
    );
    const state = target && states.get(target[1]);
    if (!state) return send(res, 404, "text/plain", "unknown fixture");
    if (target[2] === "banner") {
      return hold(res, state, "bannerWaiting", () =>
        send(res, 404, "text/plain", "missing"),
      );
    }
    if (target[2] === "good-banner") {
      return hold(res, state, "goodBannerWaiting", () =>
        send(res, 404, "text/plain", "missing"),
      );
    }
    if (!/Chrome\//.test(req.headers["user-agent"] || "")) {
      if (state.mode === "probe-late" && ++state.probeRequests === 1) {
        res.writeHead(200, {
          "Content-Type": "text/html",
          "Cache-Control": "no-store",
        });
        res.flushHeaders();
        return hold(res, state, "probeWaiting", () => {
          state.probeDelivered = true;
          res.end(
            '<html><head><title>Late probe</title><meta property="og:image" content="http://nginx/late-probe-image.png"></head><body>Probe</body></html>',
          );
        });
      }
      return send(res, 200, "text/html", goodHtml);
    }
    state.browserRequests++;
    if (state.mode === "metadata-edit") {
      const image = `<meta property="og:image" content="http://nginx/crawl-race/${target[1]}/banner">`;
      const description =
        '<meta name="description" content="Original description">';
      return send(
        res,
        200,
        "text/html",
        goodHtml.replace("</head>", `${image}${description}</head>`),
      );
    }
    if (state.browserRequests === 1) {
      const image =
        state.mode === "late" || state.mode === "overlap"
          ? `<meta property="og:image" content="http://nginx/crawl-race/${target[1]}/banner">`
          : "";
      const missingHtml = `<!doctype html><html><head><title>Missing error title</title>${image}</head><body><article><h1>Missing error</h1><p>${"Error page content. ".repeat(80)}</p></article></body></html>`;
      if (state.mode === "probe-late") {
        return hold(res, state, "missingWaiting", () =>
          send(res, state.status, "text/html", missingHtml),
        );
      }
      return send(res, state.status, "text/html", missingHtml);
    }
    if (state.mode === "overlap") {
      const image = `<meta property="og:image" content="http://nginx/crawl-race/${target[1]}/good-banner">`;
      return send(
        res,
        200,
        "text/html",
        goodHtml.replace("</head>", `${image}</head>`),
      );
    }
    if (state.mode === "reverse" && state.browserRequests === 2) {
      return hold(res, state, "goodWaiting", () =>
        send(res, 200, "text/html", goodHtml),
      );
    }
    return send(res, 200, "text/html", goodHtml);
  })
  .listen(9199, "0.0.0.0");
