import createClient from "openapi-fetch";

import type { components, paths } from "./karakeep-api.d.ts";

/**
 * @deprecated Use createKarakeepClient instead.
 */
export const createHoarderClient = createClient<paths>;

export const createKarakeepClient = createClient<paths>;

export type KarakeepAPISchemas = components["schemas"];
