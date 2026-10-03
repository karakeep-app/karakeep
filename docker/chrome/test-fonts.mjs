import assert from "node:assert/strict";
import { once } from "node:events";

const response = await fetch("http://localhost:9222/json/new?about:blank", {
  method: "PUT",
});
assert.ok(response.ok, `Cannot create Chrome page: ${response.status}`);
const target = await response.json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await once(socket, "open");

let nextId = 0;
const pending = new Map();
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

const samples = [
  ["zh-Hans", "中文测试"],
  ["zh-Hant", "繁體中文"],
  ["ja", "日本語かなカナ"],
  ["ko", "한글테스트"],
];

try {
  await send("DOM.enable");
  await send("CSS.enable");
  const html = samples
    .map(
      ([lang, text]) =>
        `<p id="${lang}" lang="${lang}" style="font-family: sans-serif; font-size: 32px">${text}</p>`,
    )
    .join("");
  await send("Runtime.evaluate", {
    expression: `document.body.innerHTML = ${JSON.stringify(html)}`,
  });
  await send("Runtime.evaluate", {
    expression: "document.fonts.ready",
    awaitPromise: true,
  });
  const { root } = await send("DOM.getDocument");
  for (const [lang, text] of samples) {
    const { nodeId } = await send("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: `#${lang}`,
    });
    const { fonts } = await send("CSS.getPlatformFontsForNode", { nodeId });
    const cjkGlyphs = fonts
      .filter((font) => font.familyName.startsWith("Noto Sans CJK"))
      .reduce((count, font) => count + font.glyphCount, 0);
    assert.equal(
      cjkGlyphs,
      [...text].length,
      `${lang}: ${JSON.stringify(fonts)}`,
    );
    console.log(`${lang}: ${cjkGlyphs} glyphs rendered with Noto CJK`);
  }
} finally {
  socket.close();
  await fetch(`http://localhost:9222/json/close/${target.id}`);
}
