import { db } from "./drizzle";

type TestTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
console.log("Transaction type test");
