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

  async set(message: SetMessageType, ws: WebSocketWithId): Promise<void> {
    logMessage("path=new, op=set", LogMessageType.DEBUG);
    return this.handler.setNewClient(message, ws);
  }

  async subscribe(
    message: SubscribeMessageType,
    ws: WebSocketWithId,
  ): Promise<void> {
    logMessage("path=new, op=subscribe", LogMessageType.DEBUG);
    return this.handler.subscribeNewClient(message, ws);
  }

  async unsubscribe(
    message: UnsubscribeMessageType,
    ws: WebSocketWithId,
  ): Promise<void> {
    logMessage("path=new, op=unsubscribe", LogMessageType.DEBUG);
    return this.handler.unsubscribeNewClient(message, ws);
  }
}
