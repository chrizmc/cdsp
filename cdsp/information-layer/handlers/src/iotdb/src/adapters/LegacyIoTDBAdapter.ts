import {
  GetMessageType,
  SetMessageType,
  SubscribeMessageType,
  UnsubscribeMessageType,
} from "../../../../../router/utils/NewMessage";
import { WebSocketWithId } from "../../../../../utils/database-params";
import { IoTDBOperationAdapter } from "./IoTDBOperationAdapter";

export interface LegacyIoTDBPort {
  getLegacy(message: GetMessageType, ws: WebSocketWithId): Promise<void>;
  setLegacy(message: SetMessageType, ws: WebSocketWithId): Promise<void>;
  subscribeLegacy(message: SubscribeMessageType, ws: WebSocketWithId): void;
  unsubscribeLegacy(message: UnsubscribeMessageType, ws: WebSocketWithId): void;
}

export class LegacyIoTDBAdapter implements IoTDBOperationAdapter {
  constructor(private readonly legacy: LegacyIoTDBPort) {}

  async get(message: GetMessageType, ws: WebSocketWithId): Promise<void> {
    return this.legacy.getLegacy(message, ws);
  }

  async set(message: SetMessageType, ws: WebSocketWithId): Promise<void> {
    return this.legacy.setLegacy(message, ws);
  }

  async subscribe(
    message: SubscribeMessageType,
    ws: WebSocketWithId,
  ): Promise<void> {
    this.legacy.subscribeLegacy(message, ws);
  }

  async unsubscribe(
    message: UnsubscribeMessageType,
    ws: WebSocketWithId,
  ): Promise<void> {
    this.legacy.unsubscribeLegacy(message, ws);
  }
}
