import { InspectOptions } from "util";
import chalk from "chalk";

import { getGlobalOptions } from "./globals";

/**
 * Prints an object either in a nicely formatted way or as JSON (depending on the command flag --json)
 *
 * @param output
 */
export function printObject(
  output: object,
  extraOptions?: InspectOptions,
): void {
  if (getGlobalOptions().json) {
    console.log(JSON.stringify(output, undefined, 4));
  } else {
    console.dir(output, extraOptions);
  }
}

/**
 * Used to output a status (success/error) and a message either as string or as JSON (depending on the command flag --json)
 *
 * @param success if the message is a successful message or an error
 * @param output the message to output
 */
export function printStatusMessage(success: boolean, message: unknown): void {
  const status = success ? "Success" : "Error";
  const colorFunction = success ? chalk.green : chalk.red;
  console.error(colorFunction(`${status}: ${message}`));
}

/**
 * @param message The message that will be printed as a successful message
 * @returns a function that can be used in a Promise on success
 */
export function printSuccess(message: string) {
  return () => {
    printStatusMessage(true, message);
  };
}

/**
 * @param message The message that will be printed as an error message
 * @returns a function that can be used in a Promise on rejection
 */
export function printError(message: string) {
  return (error: object) => {
    printErrorMessageWithReason(message, error);
  };
}

/**
 * @param message The message that will be printed as an error message
 * @param error an error object with the reason for the error
 */
export function printErrorMessageWithReason(message: string, error: object) {
  const errorMessage = "message" in error ? error.message : error;
  printStatusMessage(false, `${message}. Reason: ${errorMessage}`);
}
