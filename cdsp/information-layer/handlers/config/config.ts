import path from "path";
import dotenv from "dotenv";
import { logMessage, logWithColor, COLORS } from "../../utils/logger";

// Load environment variables from the .env file
dotenv.config();

/**
 * This file contains the description of the supported data points.
 * It supports JSON, YAML or YML format.
 */
const ENDPOINTS_FILE: string = "vss_data_points.yaml";

// Define the type of the handler, which will be a lowercase string
export const getHandlerType = (): string => {
  const handlerType = process.env.HANDLER_TYPE;

  if (!handlerType) {
    throw new Error("HANDLER_TYPE must be specified as an ENV variable");
  }

  return handlerType.toLowerCase(); // Ensure it's returned as lowercase
};

// Define the type for migration paths, which can be either "legacy" or "new"
export type MigrationPath = "legacy" | "new";

/**
 * Retrieves the migration path for a given operation based on the specified environment variable.
 *
 * @param operation - The name of the operation (e.g., "get", "set", "subscribe", "unsubscribe") for logging purposes.
 * @param envVar - The name of the environment variable that specifies the migration path for the operation.
 * @returns The migration path, which can be either "legacy" or "new". Defaults to "legacy" if not set or invalid.
 */
const parseMigrationPath = (
  operation: string,
  envVar: string,
): MigrationPath => {
  const raw = process.env[envVar];

  if (!raw) {
    return "legacy"; // Default to "legacy" if not set
  }

  const normalized = raw.toLowerCase();

  if (normalized === "legacy" || normalized === "new") {
    return normalized as MigrationPath;
  }

  // If the value is invalid, log a warning and default to "legacy"
  logWithColor(
    `[migration] Invalid value for ${envVar}='${raw}' in ${operation}. Defaulting to "legacy". Valid values are "legacy" or "new".`,
    COLORS.YELLOW,
  );
  return "legacy";
};

/**
 * Retrieves the migration path for the "get" operation.
 * @returns The migration path, which can be either "legacy" or "new". Defaults to "legacy" if not set or invalid.
 */
export const getGetOperationPath = (): MigrationPath => {
  return parseMigrationPath("get", "IOTDB_MIGRATION_GET_PATH");
};

/**
 * Retrieves the migration path for the "set" operation.
 * @returns The migration path, which can be either "legacy" or "new". Defaults to "legacy" if not set or invalid.
 */
export const getSetOperationPath = (): MigrationPath => {
  return parseMigrationPath("set", "IOTDB_MIGRATION_SET_PATH");
};

/**
 * Retrieves the migration path for the "subscribe" operation.
 * @returns The migration path, which can be either "legacy" or "new". Defaults to "legacy" if not set or invalid.
 */
export const getSubscribeOperationPath = (): MigrationPath => {
  return parseMigrationPath("subscribe", "IOTDB_MIGRATION_SUBSCRIBE_PATH");
};

/**
 * Retrieves the migration path for the "unsubscribe" operation.
 * @returns The migration path, which can be either "legacy" or "new". Defaults to "legacy" if not set or invalid.
 */
export const getUnsubscribeOperationPath = (): MigrationPath => {
  return parseMigrationPath("unsubscribe", "IOTDB_MIGRATION_UNSUBSCRIBE_PATH");
};

// Log the summary of migration paths for all operations
export const logMigrationPathsSummary = (): void => {
  const getPath = getGetOperationPath();
  const setPath = getSetOperationPath();
  const subscribePath = getSubscribeOperationPath();
  const unsubscribePath = getUnsubscribeOperationPath();
  logWithColor(
    `[migration] paths: get=${getPath}, set=${setPath}, subscribe=${subscribePath}, unsubscribe=${unsubscribePath}`,
    COLORS.BOLD,
  );
};

/**
 * Retrieves the value of an environment variable.
 *
 * @param envVar - The environment variable to retrieve.
 * @returns The value of the environment variable or null if not set.
 */
export const getEnvValue = (envVar: string): string | null => {
  if (!process.env[envVar]) {
    logMessage(`${envVar} environment variable is not set in .env file.`);
    return null;
  }
  return process.env[envVar]!;
};

/**
 * Retrieves the full path to the data points file.
 *
 * This function resolves the schema-files directory path of the current module
 * and joins it with the ENDPOINTS_FILE constant to form the full path.
 *
 * @returns The full path to the data points file.
 */
export const getDataPointsPath = (): string => {
  const rootPath = path.resolve(`${__dirname}/schema-files`);
  return path.join(rootPath, ENDPOINTS_FILE);
};
