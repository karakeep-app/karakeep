import winston from "winston";

import serverConfig from "./config";

const logger = winston.createLogger({
  level: serverConfig.logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    ...(serverConfig.logNoColor ? [] : [winston.format.colorize()]),
    winston.format.printf(
      (info) => `${info.timestamp} ${info.level}: ${info.message}`,
    ),
  ),
  transports: [new winston.transports.Console()],
});

export function throttledLogger(periodMs: number) {
  let lastLogTime = 0;

  return (level: string, message: string) => {
    const now = Date.now();
    if (now - lastLogTime >= periodMs) {
      lastLogTime = now;
      logger.log(level, message);
    }
  };
}

export default logger;
