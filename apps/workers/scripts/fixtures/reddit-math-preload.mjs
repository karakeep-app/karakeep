import { register } from "node:module";

// Only the test subprocess installs this loader. It runs the actual Reddit
// plugin with a deterministic JSON response and no external network requests.
register("./reddit-math-loader.mjs", import.meta.url);
