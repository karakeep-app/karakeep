import logger from "@karakeep/shared/logger";

export const exitAbortController = new AbortController();

export const shutdownPromise = new Promise((resolve) => {
  process.on("SIGTERM", () => {
    logger.info("Received SIGTERM, shutting down ...");
    exitAbortController.abort();
    resolve("");
  });
});
