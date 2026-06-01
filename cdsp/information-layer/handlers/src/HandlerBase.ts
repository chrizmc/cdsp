import {
  DataContentMessage,
  ensureMessageType,
  ErrorMessage,
  STATUS_ERRORS,
  GetMessageType,
  NewMessage,
  NewMessageType,
  SetMessageType,
  StatusMessage,
  SubscribeMessageType,
  UnsubscribeMessageType,
} from "../../router/utils/NewMessage";
import { DataPointSchema, WebSocketWithId } from "../../utils/database-params";
import { getDataPointsPath } from "../config/config";
import { logMessage, LogMessageType } from "../../utils/logger";
import {
  replaceDotsWithUnderscore,
  replaceUnderscoresWithDots,
  toResponseFormat,
} from "../utils/transformations";
import { databaseParams } from "./iotdb/config/database-params";
import { loadDataPointSchema } from "./utils/schema/DataPointSchemaLoader";
import { extractLeafNodesFromRequest } from "./utils/validation/NodeValidation";
import {
  createStatusMessage,
  createErrorMessage,
  createDataContentMessage,
} from "./utils/response/ResponseBuilder";

export abstract class HandlerBase {
  /**
   * Function to use for sending messages to the client, so that formatting and mapping is applied to all messages.
   * @private
   */
  private readonly sendMessage: (
    ws: WebSocketWithId,
    message: StatusMessage | DataContentMessage | ErrorMessage,
  ) => void;

  protected constructor(
    sendMessageFn: (
      ws: WebSocketWithId,
      message: StatusMessage | DataContentMessage | ErrorMessage,
    ) => void,
  ) {
    this.sendMessage = sendMessageFn;
  }

  /**
   *  Returns a list of all known data point names that begin with the specified prefix.
   */
  abstract getKnownDatapointsByPrefix(prefix: string): string[];

  /**
   * Returns the dataPoints from DB based on the provided list of dataPoints and VIN.
   * @param dataPoints to extract from DB
   * @param vin VIN
   */
  abstract getDataPointsFromDB(
    dataPoints: string[],
    vin: string,
  ): Promise<QueryResult>;

  async authenticateAndConnect(): Promise<void> {
    logMessage(
      "authenticateAndConnect() is not implemented",
      LogMessageType.WARNING,
    );
  }

  async getLegacy(message: GetMessageType, ws: WebSocketWithId): Promise<void> {
    const requestedDataPoints = this.getKnownDatapointsByPrefix(message.path);

    if (requestedDataPoints.length === 0) {
      this.sendRequestedDataPointsNotFoundErrorMsg(
        ws,
        message.path,
        message.requestId,
      );
      return;
    }

    const queryResult = await this.getDataPointsFromDB(
      requestedDataPoints,
      message.instance,
    );

    this.sendGetResponseToClient(
      queryResult,
      message.instance,
      requestedDataPoints,
      ws,
      message.requestId,
      message.path,
      message.root,
      message.format,
    );
  }

  protected async get(
    _message: GetMessageType,
    _ws: WebSocketWithId,
  ): Promise<void> {
    logMessage("get() is not implemented", LogMessageType.WARNING);
  }

  protected sendRequestedDataPointsNotFoundErrorMsg(
    ws: WebSocketWithId,
    path: string,
    requestId: string,
  ) {
    this.sendMessageToClient(
      ws,
      this.createErrorMessage(
        STATUS_ERRORS.BAD_REQUEST,
        `Not found`,
        `There are no known datapoints with prefix ${replaceUnderscoresWithDots(path)}`,
        requestId,
      ),
    );
  }

  protected sendAlreadySubscribedErrorMsg(
    ws: WebSocketWithId,
    instance: string,
    newDataPoints: string[],
    requestId: string,
  ) {
    const statusMessage = this.createErrorMessage(
      STATUS_ERRORS.BAD_REQUEST,
      `Subscription failed`,
      `Already subscribed to instance '${instance}' ` +
        `and datapoints [${toResponseFormat(newDataPoints)}]`,
      requestId,
    );
    this.sendMessageToClient(ws, statusMessage);
  }

  protected set(_message: SetMessageType, _ws: WebSocketWithId): Promise<void> {
    logMessage("set() is not implemented", LogMessageType.WARNING);
    return Promise.resolve();
  }

  protected subscribe(
    _message: SubscribeMessageType,
    _ws: WebSocketWithId,
  ): Promise<void> {
    logMessage("subscribe() is not implemented", LogMessageType.WARNING);
    return Promise.resolve();
  }

  protected unsubscribe(
    _message: UnsubscribeMessageType,
    _ws: WebSocketWithId,
  ): Promise<void> {
    logMessage("unsubscribe() is not implemented", LogMessageType.WARNING);
    return Promise.resolve();
  }

  unsubscribe_client(_ws: WebSocketWithId): void {
    logMessage(
      "unsubscribe_client() is not implemented",
      LogMessageType.WARNING,
    );
  }

  handleMessage(message: NewMessage, ws: WebSocketWithId): void {
    try {
      switch (message.type) {
        case "get": {
          const aGetMessage = ensureMessageType<GetMessageType>(
            message,
            NewMessageType.Get,
          );
          void this.get(aGetMessage, ws);
          break;
        }
        case "set": {
          const aSetMessage = ensureMessageType<SetMessageType>(
            message,
            NewMessageType.Set,
          );
          void this.set(aSetMessage, ws);
          break;
        }
        case "subscribe": {
          const aSubscribeMessage = ensureMessageType<SubscribeMessageType>(
            message,
            NewMessageType.Subscribe,
          );
          void this.subscribe(aSubscribeMessage, ws);
          break;
        }
        case "unsubscribe": {
          const anUnsubscribeMessage =
            ensureMessageType<UnsubscribeMessageType>(
              message,
              NewMessageType.Unsubscribe,
            );
          void this.unsubscribe(anUnsubscribeMessage, ws);
          break;
        }
        default:
          throw new Error("Unknown message type.");
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      this.sendMessage(
        ws,
        this.createErrorMessage(
          STATUS_ERRORS.INTERNAL_SERVER_ERROR,
          "Internal server error",
          errMsg,
          message.requestId,
        ),
      );
    }
  }

  /**
   * Takes the queryResults and sends a response to the client. 3 different responses are possible:
   * 1. Valid response with all available datapoints in the DB (number of datapoints can be less than requested)
   * 2. Client Error 404 if no requested datapoint could be found.
   * 3. Internal Server Error 500 if the DB access was not successful.
   */
  protected sendGetResponseToClient(
    queryResult: QueryResult,
    vin: string,
    requestedDataPoints: string[],
    ws: WebSocketWithId,
    requestId: string,
    path: string,
    root: "absolute" | "relative",
    format: "nested" | "flat",
  ): void {
    // There was an issue accessing the DB, notify the client and return
    if (!queryResult.success) {
      this.sendMessageToClient(
        ws,
        this.createErrorMessage(
          STATUS_ERRORS.INTERNAL_SERVER_ERROR,
          "Internal server error",
          queryResult.error,
          requestId,
        ),
      );
      return;
    }

    let responseMessage: DataContentMessage | ErrorMessage;
    if (queryResult.dataPoints.length > 0) {
      responseMessage = this.createDataContentMessage(
        vin,
        queryResult.dataPoints,
        root,
        format,
        path,
        queryResult.metadata,
        requestId,
      );
    } else {
      responseMessage = this.createErrorMessage(
        STATUS_ERRORS.NOT_FOUND,
        `Data not found`,
        `No values found for dataPoints [${replaceUnderscoresWithDots(requestedDataPoints.join(", "))}] for the instance: ${vin}`,
        requestId,
      );
    }

    this.sendMessageToClient(ws, responseMessage);
  }

  protected sendMessageToClient(
    ws: WebSocketWithId,
    message: StatusMessage | DataContentMessage | ErrorMessage,
  ): void {
    this.sendMessage(ws, message);
  }

  protected createStatusMessage(
    code: number,
    statusMessage: string,
    requestId: string,
  ): StatusMessage {
    return createStatusMessage(code, statusMessage, requestId);
  }

  protected createErrorMessage(
    code: number,
    message: string,
    reason: string,
    requestId: string,
  ): ErrorMessage {
    return createErrorMessage(code, message, reason, requestId);
  }

  protected createDataContentMessage(
    instance: string,
    dataPoints: Array<{ name: string; value: any }>,
    root: "absolute" | "relative",
    format: "nested" | "flat",
    path: string,
    metadata?: Array<{ name: string; value: any }>,
    requestId?: string,
  ): DataContentMessage {
    return createDataContentMessage(
      instance,
      dataPoints,
      root,
      format,
      path,
      metadata,
      requestId,
    );
  }

  protected extractNodesFromData(
    path: string,
    data: Record<string, any>,
  ): Record<string, any> {
    const result: Record<string, any> = {};

    function traverse(
      currentPath: string,
      currentData: Record<string, any>,
    ): void {
      for (const [key, value] of Object.entries(currentData)) {
        const fullPath = `${currentPath}.${key}`;
        if (typeof value === "object" && value !== null) {
          traverse(fullPath, value);
        } else {
          result[fullPath] = value;
        }
      }
    }

    traverse(path, data);
    return result;
  }

  protected getSupportedDataPoints(): object {
    const dataPointPath = getDataPointsPath();
    return loadDataPointSchema(dataPointPath);
  }

  /**
   * Validates nodes against a given schema.
   *
   * @param message - The message containing a path to be validated.
   * @param dataPointsSchema - The schema against which nodes are validated.
   * @returns An error message with details if validation fails, otherwise null.
   */
  protected validateNodesAgainstSchema(
    message: NewMessage,
    dataPointsSchema: DataPointSchema,
  ): string | null {
    if (message.type == NewMessageType.PermissionsEdit) {
      return null;
    }
    const data = message.type === NewMessageType.Set ? message.data : undefined;
    const requestNodes = extractLeafNodesFromRequest(message.path, data);

    const unknownFields = Array.from(requestNodes).filter((node) => {
      return !dataPointsSchema.hasOwnProperty(node);
    });

    if (unknownFields.length > 0) {
      return (
        "Could not find node: " +
        replaceUnderscoresWithDots(unknownFields.join(", "))
      );
    }
    return null;
  }

  protected extractNodesFromMessage(
    message: SetMessageType,
  ): Record<string, any> {
    const result: Record<string, any> = {};

    if (typeof message.data === "object" && message.data !== null) {
      const nodes = this.extractNodesFromData(message.path, message.data);
      for (const [key, value] of Object.entries(nodes)) {
        result[replaceDotsWithUnderscore(key)] = value;
      }
    } else {
      result[replaceDotsWithUnderscore(message.path)] = message.data;
    }

    return result;
  }

  protected extractNodesFromMessageWithVinAsNode(
    message: SetMessageType,
  ): Record<string, any> {
    const result = this.extractNodesFromMessage(message);
    const { dataPointId } = databaseParams["VSS"];
    result[dataPointId] = message.instance;
    return result;
  }
}

export type QueryResult =
  | {
      success: true;
      dataPoints: Array<{ name: string; value: any }>;
      metadata: Array<{ name: string; value: any }>;
    }
  | { success: false; error: string };
