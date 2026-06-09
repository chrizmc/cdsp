import {
  GetMessageType,
  SetMessageType,
  SubscribeMessageType,
  UnsubscribeMessageType,
} from "../../../../../router/utils/NewMessage";
import { WebSocketWithId } from "../../../../../utils/database-params";

export interface IoTDBHandlerPort {
  getLegacy(message: GetMessageType, ws: WebSocketWithId): Promise<void>;
  getNewClient(message: GetMessageType, ws: WebSocketWithId): Promise<void>;
  setLegacy(message: SetMessageType, ws: WebSocketWithId): Promise<void>;
  setNewClient(message: SetMessageType, ws: WebSocketWithId): Promise<void>;
  subscribeLegacy(message: SubscribeMessageType, ws: WebSocketWithId): void;
  subscribeNewClient(
    message: SubscribeMessageType,
    ws: WebSocketWithId,
  ): Promise<void>;
  unsubscribeLegacy(message: UnsubscribeMessageType, ws: WebSocketWithId): void;
  unsubscribeNewClient(
    message: UnsubscribeMessageType,
    ws: WebSocketWithId,
  ): Promise<void>;
}
