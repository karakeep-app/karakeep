import { Hono } from "hono";

import assets from "./public/assets";

const app = new Hono().route("/assets", assets);

export default app;
