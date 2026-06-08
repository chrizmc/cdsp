import {
  GetMessageType,
  SetMessageType,
  SubscribeMessageType,
  UnsubscribeMessageType,
} from "../../../../../router/utils/NewMessage";
import { WebSocketWithId } from "../../../../../utils/database-params";
import { logMessage, LogMessageType } from "../../../../../utils/logger";
import { IoTDBOperationAdapter } from "./IoTDBOperationAdapter";
import { IoTDBHandlerPort } from "./IoTDBHandlerPort";

export class NewIoTDBAdapter implements IoTDBOperationAdapter {
  constructor(private readonly handler: IoTDBHandlerPort) {}

  async get(message: GetMessageType, ws: WebSocketWithId): Promise<void> {
    logMessage("path=new, op=get", LogMessageType.DEBUG);
    return this.handler.getNewClient(message, ws);
  }

  async set(_message: SetMessageType, _ws: WebSocketWithId): Promise<void> {
    logMessage("path=new, op=set", LogMessageType.DEBUG);
    return this.handler.setNewClient(_message, _ws);
  }

  async subscribe(
    _message: SubscribeMessageType,
    _ws: WebSocketWithId,
  ): Promise<void> {
    logMessage(
      "NewIoTDBAdapter.subscribe() called - not implemented yet",
      LogMessageType.WARNING,
    );
  }

  async unsubscribe(
    _message: UnsubscribeMessageType,
    _ws: WebSocketWithId,
  ): Promise<void> {
    logMessage(
      "NewIoTDBAdapter.unsubscribe() called - not implemented yet",
      LogMessageType.WARNING,
    );
  }
}
