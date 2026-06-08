import {
  GetMessageType,
  SetMessageType,
  SubscribeMessageType,
  UnsubscribeMessageType,
} from "../../../../../router/utils/NewMessage";
import { WebSocketWithId } from "../../../../../utils/database-params";
import { IoTDBOperationAdapter } from "./IoTDBOperationAdapter";
import { IoTDBHandlerPort } from "./IoTDBHandlerPort";

export class LegacyIoTDBAdapter implements IoTDBOperationAdapter {
  constructor(private readonly handler: IoTDBHandlerPort) {}

  async get(message: GetMessageType, ws: WebSocketWithId): Promise<void> {
    return this.handler.getLegacy(message, ws);
  }

  async set(message: SetMessageType, ws: WebSocketWithId): Promise<void> {
    return this.handler.setLegacy(message, ws);
  }

  async subscribe(
    message: SubscribeMessageType,
    ws: WebSocketWithId,
  ): Promise<void> {
    this.handler.subscribeLegacy(message, ws);
  }

  async unsubscribe(
    message: UnsubscribeMessageType,
    ws: WebSocketWithId,
  ): Promise<void> {
    this.handler.unsubscribeLegacy(message, ws);
  }
}
