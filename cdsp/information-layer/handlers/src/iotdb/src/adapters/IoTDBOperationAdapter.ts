import {
  GetMessageType,
  SetMessageType,
  SubscribeMessageType,
  UnsubscribeMessageType,
} from "../../../../../router/utils/NewMessage";
import { WebSocketWithId } from "../../../../../utils/database-params";

export interface IoTDBOperationAdapter {
  get(message: GetMessageType, ws: WebSocketWithId): Promise<void>;
  set(message: SetMessageType, ws: WebSocketWithId): Promise<void>;
  subscribe(message: SubscribeMessageType, ws: WebSocketWithId): Promise<void>;
  unsubscribe(
    message: UnsubscribeMessageType,
    ws: WebSocketWithId,
  ): Promise<void>;
}
