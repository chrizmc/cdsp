import {
  GetMessageType,
  SetMessageType,
  SubscribeMessageType,
  UnsubscribeMessageType,
} from "../../../../../router/utils/NewMessage";
import { WebSocketWithId } from "../../../../../utils/database-params";
import { logMessage, LogMessageType } from "../../../../../utils/logger";
import { IoTDBOperationAdapter } from "./IoTDBOperationAdapter";

export class NewIoTDBAdapter implements IoTDBOperationAdapter {
  async get(_message: GetMessageType, _ws: WebSocketWithId): Promise<void> {
    logMessage(
      "NewIoTDBAdapter.get() called - not implemented yet",
      LogMessageType.WARNING,
    );
  }

  async set(_message: SetMessageType, _ws: WebSocketWithId): Promise<void> {
    logMessage(
      "NewIoTDBAdapter.set() called - not implemented yet",
      LogMessageType.WARNING,
    );
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
