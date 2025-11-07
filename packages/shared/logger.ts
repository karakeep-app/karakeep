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

export default logger;
