const fixtureModule = "karakeep-test:reddit-network";

export function resolve(specifier, context, nextResolve) {
  if (specifier === "network")
    return { url: fixtureModule, shortCircuit: true };
  return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
  if (url !== fixtureModule) return nextLoad(url, context);
  return {
    format: "module",
    shortCircuit: true,
    source: `
      export const getRandomProxy = () => { throw new Error("No proxy expected in this fixture"); };
      export async function fetchWithProxy(url) {
        if (url !== "https://www.reddit.com/r/math/comments/fixture.json") throw new Error("Unexpected fixture request");
        return { ok: true, status: 200, json: async () => [{ data: { children: [{ data: {
          title: "Direct math fixture",
          selftext_html: '<p>Plugin-only-content <d-math>x^2</d-math></p><d-math block>\\\\frac{x}{2}</d-math><img src="x" onerror="alert(1)"><script>alert(2)</script>'
        } }] } }] };
      }
    `,
  };
}
