import { IoTDBHandler } from "../src/IoTDBHandler";
import { Session } from "../src/Session";
import { SessionDataSet } from "../utils/SessionDataSet";
import { WebSocketWithId } from "../../../../utils/database-params";
import {
  NewMessageType,
  SetMessageType,
  STATUS_SUCCESS,
  GetMessageType,
  SubscribeMessageType,
  UnsubscribeMessageType,
  STATUS_ERRORS,
} from "../../../../router/utils/NewMessage";
import { SupportedMessageDataTypes } from "../utils/iotdb-constants";
import * as configModule from "../../../config/config";

jest.mock("../src/Session");
jest.mock("../src/SubscriptionSimulator", () => ({
  getSubscriptionSimulator: jest.fn(() => ({
    subscribe: jest.fn().mockResolvedValue(undefined),
    unsubscribe: jest.fn(),
    unsubscribeClient: jest.fn(),
  })),
}));
jest.mock("../src/NewIoTDBSession");
jest.mock("../utils/database-helper", () => ({
  transformSessionDataSet: jest.fn(() => [
    [{ name: "datapoint", value: 1 }],
    [{ name: "metadata", value: 2 }],
  ]),
}));
jest.mock("../config/database-params", () => ({
  databaseConfig: {},
  databaseParams: {
    VSS: {
      databaseName: "test_db",
      dataPointId: "Vehicle_VehicleIdentification_VIN",
    },
  },
}));

jest.mock("../../../config/config", () => {
  const actual = jest.requireActual("../../../config/config");
  return {
    ...actual,
    getGetOperationPath: jest.fn(() => "new"),
    getSetOperationPath: jest.fn(() => "new"),
    getSubscribeOperationPath: jest.fn(() => "new"),
    getUnsubscribeOperationPath: jest.fn(() => "new"),
  };
});

describe("IoTDBHandler", () => {
  let handler: IoTDBHandler;
  let mockSession: jest.Mocked<Session>;
  let mockWebSocket: jest.Mocked<WebSocketWithId>;
  let mockSendMessage: jest.Mock;

  const buildGetMessage = (): GetMessageType =>
    ({
      type: NewMessageType.Get,
      instance: "TEST_VIN",
      path: "Vehicle",
      requestId: "req-get-1",
      root: "absolute",
      format: "flat",
    }) as GetMessageType;

  const buildSetMessage = (): SetMessageType =>
    ({
      type: NewMessageType.Set,
      instance: "TEST_VIN",
      path: "Vehicle",
      requestId: "req-set-id",
      data: { Speed: 60 },
      metadata: { Speed: { unit: "km/h" } },
    }) as unknown as SetMessageType;

  const buildSubscribeMessage = (): SubscribeMessageType =>
    ({
      type: NewMessageType.Subscribe,
      instance: "TEST_VIN",
      path: "Vehicle",
      requestId: "req-sub-1",
    }) as unknown as SubscribeMessageType;

  const buildUnsubscribeMessage = (): UnsubscribeMessageType =>
    ({
      type: NewMessageType.Unsubscribe,
      instance: "TEST_VIN",
      path: "Vehicle",
      requestId: "req-unsub-1",
    }) as unknown as UnsubscribeMessageType;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSession = new Session() as jest.Mocked<Session>;
    mockSession.authenticateAndConnect = jest.fn();
    mockSession.executeQueryStatement = jest.fn();
    mockSession.getSessionId = jest.fn().mockReturnValue("mockSessionId");
    mockSession.closeSession = jest.fn().mockResolvedValue(undefined);

    mockSendMessage = jest.fn();
    handler = new IoTDBHandler(mockSendMessage);

    (handler as any).session = mockSession;
    mockWebSocket = { id: "test-socket" } as jest.Mocked<WebSocketWithId>;
  });

  describe("lifecycle", () => {
    test("should authenticate and connect to IoTDB", async () => {
      // Act
      await handler.authenticateAndConnect();

      // Assert
      expect(mockSession.authenticateAndConnect).toHaveBeenCalled();
    });

    test("unsubscribe_client should cleanup simulator and close both sessions", async () => {
      // Arrange
      const unsubscribeClientSpy = jest.spyOn(
        (handler as any).subscriptionSimulator,
        "unsubscribeClient",
      );
      const closeLegacySpy = jest
        .spyOn((handler as any).session, "closeSession")
        .mockResolvedValue(undefined);
      const closeNewSpy = jest
        .spyOn((handler as any).newSession, "close")
        .mockResolvedValue(undefined);

      // Act
      await (handler as any).unsubscribe_client(mockWebSocket);

      // Assert
      expect(unsubscribeClientSpy).toHaveBeenCalledWith(mockWebSocket);
      expect(closeLegacySpy).toHaveBeenCalledTimes(1);
      expect(closeNewSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("get flow", () => {
    test("should query data points and metadata from IoTDB", async () => {
      // Arrange
      const mockDataPoints = ["Temperature", "Speed"];
      const vin = "TEST_VIN";

      mockSession.executeQueryStatement.mockResolvedValue(
        new SessionDataSet([], [], {}, 0, {}, 0, {}, {}, false),
      );

      // Act
      const result = await handler.getDataPointsFromDB(mockDataPoints, vin);

      // Assert
      const expectedCalls = [
        expect.stringContaining("SELECT Temperature,Temperature_Metadata"),
        expect.stringContaining("SELECT Speed,Speed_Metadata"),
      ];

      expectedCalls.forEach((expected, index) => {
        expect(mockSession.executeQueryStatement.mock.calls[index][0]).toEqual(
          expected,
        );
      });
      expect(result.success).toBe(true);
    });

    test("should route get to new adapter when get path is new", async () => {
      // Arrange
      jest
        .spyOn(configModule, "getGetOperationPath")
        .mockReturnValue("new" as any);

      const getNewSpy = jest
        .spyOn(handler as any, "getNewClient")
        .mockResolvedValue(undefined);

      // Act
      await (handler as any).get(buildGetMessage(), mockWebSocket);

      // Assert
      expect(getNewSpy).toHaveBeenCalledTimes(1);
    });

    test("getNewClient should send datapoints-not-found when no datapoints are known", async () => {
      // Arrange
      jest
        .spyOn(handler as any, "getKnownDatapointsByPrefix")
        .mockReturnValue([]);

      const notFoundSpy = jest.spyOn(
        handler as any,
        "sendRequestedDataPointsNotFoundErrorMsg",
      );

      const msg = buildGetMessage();

      // Act
      await (handler as any).getNewClient(msg, mockWebSocket);

      // Assert
      expect(notFoundSpy).toHaveBeenCalledWith(
        mockWebSocket,
        msg.path,
        msg.requestId,
      );
    });

    test("getNewClient should send failure response when new session open fails", async () => {
      // Arrange
      const msg = buildGetMessage();

      jest
        .spyOn(handler as any, "getKnownDatapointsByPrefix")
        .mockReturnValue(["Vehicle.Speed"]);

      (handler as any).newSession = {
        isOpen: jest.fn().mockReturnValue(false),
        open: jest.fn().mockRejectedValue(new Error("open failed")),
        getDataPoints: jest.fn(),
        close: jest.fn(),
      };

      const sendGetSpy = jest.spyOn(handler as any, "sendGetResponseToClient");

      // Act
      await (handler as any).getNewClient(msg, mockWebSocket);

      // Assert
      expect(sendGetSpy).toHaveBeenCalledWith(
        { success: false, error: "New session unavailable" },
        msg.instance,
        [],
        mockWebSocket,
        msg.requestId,
        msg.path,
        msg.root,
        msg.format,
      );
    });

    test("getNewClient should forward successful query result via sendGetResponseToClient", async () => {
      // Arrange
      const msg = buildGetMessage();
      const knownDatapoints = ["Vehicle.Speed"];
      const queryResult = {
        success: true,
        dataPoints: [{ name: "Vehicle.Speed", value: 88 }],
        metadata: [{ name: "timestamp", value: 123456789 }],
      };

      jest
        .spyOn(handler as any, "getKnownDatapointsByPrefix")
        .mockReturnValue(knownDatapoints);

      (handler as any).newSession = {
        isOpen: jest.fn().mockReturnValue(true),
        open: jest.fn(),
        getDataPoints: jest.fn().mockResolvedValue(queryResult),
        close: jest.fn(),
      };

      const sendGetSpy = jest.spyOn(handler as any, "sendGetResponseToClient");

      // Act
      await (handler as any).getNewClient(msg, mockWebSocket);

      // Assert
      expect((handler as any).newSession.getDataPoints).toHaveBeenCalledWith(
        knownDatapoints,
        msg.instance,
      );

      expect(sendGetSpy).toHaveBeenCalledWith(
        queryResult,
        msg.instance,
        knownDatapoints,
        mockWebSocket,
        msg.requestId,
        msg.path,
        msg.root,
        msg.format,
      );
    });

    test("getNewClient should forward error query result via sendGetResponseToClient", async () => {
      // Arrange
      const msg = buildGetMessage();
      const knownDatapoints = ["Vehicle.Speed"];
      const queryResult = { success: false, error: "db error" };

      jest
        .spyOn(handler as any, "getKnownDatapointsByPrefix")
        .mockReturnValue(knownDatapoints);

      (handler as any).newSession = {
        isOpen: jest.fn().mockReturnValue(true),
        open: jest.fn(),
        getDataPoints: jest.fn().mockResolvedValue(queryResult),
        close: jest.fn(),
      };

      const sendGetSpy = jest.spyOn(handler as any, "sendGetResponseToClient");

      // Act
      await (handler as any).getNewClient(msg, mockWebSocket);

      // Assert
      expect(sendGetSpy).toHaveBeenCalledWith(
        queryResult,
        msg.instance,
        knownDatapoints,
        mockWebSocket,
        msg.requestId,
        msg.path,
        msg.root,
        msg.format,
      );
    });
  });

  describe("set flow", () => {
    test("should route set to new adapter when set path is new", async () => {
      // Arrange
      jest
        .spyOn(configModule, "getSetOperationPath")
        .mockReturnValue("new" as any);

      const setNewSpy = jest
        .spyOn(handler as any, "setNewClient")
        .mockResolvedValue(undefined);

      // Act
      await (handler as any).set(buildSetMessage(), mockWebSocket);

      // Assert
      expect(setNewSpy).toHaveBeenCalledTimes(1);
    });

    test("setNewClient should send STATUS_SUCCESS.OK on successful write", async () => {
      // Arrange
      jest.spyOn(handler as any, "areNodesValid").mockReturnValue(true);

      jest
        .spyOn(handler as any, "extractNodesFromMessageWithVinAsNode")
        .mockReturnValue({
          Vehicle_Speed: 60,
          Vehicle_VehicleIdentification_VIN: "TEST_VIN",
        });

      jest.spyOn(handler as any, "extractNodesFromMetadata").mockReturnValue({
        Vehicle_Speed_Metadata: JSON.stringify({ unit: "km/h" }),
      });

      jest
        .spyOn(handler as any, "getDataType")
        .mockImplementation((key: unknown) => {
          if (String(key).endsWith("_Metadata")) {
            return SupportedMessageDataTypes.string;
          } else if (String(key).includes("VIN")) {
            return SupportedMessageDataTypes.string;
          } else {
            return SupportedMessageDataTypes.int16;
          }
        });

      (handler as any).newSession = {
        isOpen: jest.fn().mockReturnValue(true),
        open: jest.fn(),
        close: jest.fn(),
        setDataPoints: jest
          .fn()
          .mockResolvedValue({ success: true, status: { code: 200 } }),
      };

      // Act
      await (handler as any).setNewClient(buildSetMessage(), mockWebSocket);

      // Assert
      expect((handler as any).newSession.setDataPoints).toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalledWith(
        mockWebSocket,
        expect.objectContaining({ code: STATUS_SUCCESS.OK }),
      );
    });

    test("setNewClient should send SERVICE_UNAVAILABLE on write failure", async () => {
      // Arrange
      const msg = {
        ...buildSetMessage(),
        requestId: "req-set-fail",
        metadata: {},
      };

      jest.spyOn(handler as any, "areNodesValid").mockReturnValue(true);

      jest
        .spyOn(handler as any, "extractNodesFromMessageWithVinAsNode")
        .mockReturnValue({
          Vehicle_Speed: 60,
          Vehicle_VehicleIdentification_VIN: "TEST_VIN",
        });

      jest
        .spyOn(handler as any, "extractNodesFromMetadata")
        .mockReturnValue({});

      jest
        .spyOn(handler as any, "getDataType")
        .mockImplementation((key: unknown) => {
          if (String(key).includes("VIN")) {
            return SupportedMessageDataTypes.string;
          } else {
            return SupportedMessageDataTypes.int16;
          }
        });

      (handler as any).newSession = {
        isOpen: jest.fn().mockReturnValue(true),
        open: jest.fn(),
        close: jest.fn(),
        setDataPoints: jest
          .fn()
          .mockResolvedValue({ success: false, error: "write failed" }),
      };

      // Act
      await (handler as any).setNewClient(msg, mockWebSocket);

      // Assert
      expect((handler as any).newSession.setDataPoints).toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalledWith(
        mockWebSocket,
        expect.objectContaining({ code: STATUS_ERRORS.SERVICE_UNAVAILABLE }),
      );
    });
  });

  describe("subscribe/unsubscribe routing", () => {
    test("should route subscribe to legacy adapter when subscribe path is legacy", async () => {
      // Arrange
      jest
        .spyOn(configModule, "getSubscribeOperationPath")
        .mockReturnValue("legacy" as any);

      const subscribeLegacySpy = jest
        .spyOn(handler as any, "subscribeLegacy")
        .mockImplementation(() => {});

      // Act
      await (handler as any).subscribe(buildSubscribeMessage(), mockWebSocket);

      // Assert
      expect(subscribeLegacySpy).toHaveBeenCalledTimes(1);
    });

    test("should route subscribe to new adapter when subscribe path is new", async () => {
      // Arrange
      jest
        .spyOn(configModule, "getSubscribeOperationPath")
        .mockReturnValue("new" as any);

      const subscribeNewSpy = jest
        .spyOn(handler as any, "subscribeNewClient")
        .mockResolvedValue(undefined);

      // Act
      await (handler as any).subscribe(buildSubscribeMessage(), mockWebSocket);

      // Assert
      expect(subscribeNewSpy).toHaveBeenCalledTimes(1);
    });

    test("should route unsubscribe to legacy adapter when unsubscribe path is legacy", async () => {
      // Arrange
      jest
        .spyOn(configModule, "getUnsubscribeOperationPath")
        .mockReturnValue("legacy" as any);

      const unsubscribeLegacySpy = jest
        .spyOn(handler as any, "unsubscribeLegacy")
        .mockImplementation(() => {});

      // Act
      await (handler as any).unsubscribe(
        buildUnsubscribeMessage(),
        mockWebSocket,
      );

      // Assert
      expect(unsubscribeLegacySpy).toHaveBeenCalledTimes(1);
    });

    test("should route unsubscribe to new adapter when unsubscribe path is new", async () => {
      // Arrange
      jest
        .spyOn(configModule, "getUnsubscribeOperationPath")
        .mockReturnValue("new" as any);

      const unsubscribeNewSpy = jest
        .spyOn(handler as any, "unsubscribeNewClient")
        .mockResolvedValue(undefined);

      // Act
      await (handler as any).unsubscribe(
        buildUnsubscribeMessage(),
        mockWebSocket,
      );

      // Assert
      expect(unsubscribeNewSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("subscribe/unsubscribe new client behavior", () => {
    test("subscribeNewClient should delegate to newSession when datapoints are known", async () => {
      // Arrange
      const msg = buildSubscribeMessage();
      const knownDatapoints = ["Vehicle_Speed"];

      jest
        .spyOn(handler as any, "getKnownDatapointsByPrefix")
        .mockReturnValue(knownDatapoints);

      const subscribeSpy = jest
        .spyOn((handler as any).newSession, "subscribeDataPoints")
        .mockResolvedValue(undefined);

      // Act
      await (handler as any).subscribeNewClient(msg, mockWebSocket);

      // Assert
      expect(subscribeSpy).toHaveBeenCalledWith(
        msg,
        mockWebSocket,
        knownDatapoints,
        expect.any(Function),
      );
    });

    test("subscribeNewClient should send datapoints-not-found when no datapoints are known", async () => {
      // Arrange
      const msg = buildSubscribeMessage();

      jest
        .spyOn(handler as any, "getKnownDatapointsByPrefix")
        .mockReturnValue([]);

      const notFoundSpy = jest.spyOn(
        handler as any,
        "sendRequestedDataPointsNotFoundErrorMsg",
      );

      // Act
      await (handler as any).subscribeNewClient(msg, mockWebSocket);

      // Assert
      expect(notFoundSpy).toHaveBeenCalledWith(
        mockWebSocket,
        msg.path,
        msg.requestId,
      );
    });

    test("unsubscribeNewClient should delegate to newSession when datapoints are known", async () => {
      // Arrange
      const msg = buildUnsubscribeMessage();
      const knownDatapoints = ["Vehicle_Speed"];

      jest
        .spyOn(handler as any, "getKnownDatapointsByPrefix")
        .mockReturnValue(knownDatapoints);

      const unsubscribeSpy = jest
        .spyOn((handler as any).newSession, "unsubscribeDataPoints")
        .mockResolvedValue(undefined);

      // Act
      await (handler as any).unsubscribeNewClient(msg, mockWebSocket);

      // Assert
      expect(unsubscribeSpy).toHaveBeenCalledWith(
        msg,
        mockWebSocket,
        knownDatapoints,
        expect.any(Function),
      );
    });

    test("unsubscribeNewClient should be idempotent when called repeatedly", async () => {
      // Arrange
      const msg = buildUnsubscribeMessage();
      const knownDatapoints = ["Vehicle_Speed"];

      jest
        .spyOn(handler as any, "getKnownDatapointsByPrefix")
        .mockReturnValue(knownDatapoints);

      const unsubscribeSpy = jest
        .spyOn((handler as any).newSession, "unsubscribeDataPoints")
        .mockResolvedValue(undefined);

      // Act
      await (handler as any).unsubscribeNewClient(msg, mockWebSocket);
      await (handler as any).unsubscribeNewClient(msg, mockWebSocket);

      // Assert
      expect(unsubscribeSpy).toHaveBeenCalledTimes(2);
      expect(unsubscribeSpy).toHaveBeenNthCalledWith(
        1,
        msg,
        mockWebSocket,
        knownDatapoints,
        expect.any(Function),
      );
      expect(unsubscribeSpy).toHaveBeenNthCalledWith(
        2,
        msg,
        mockWebSocket,
        knownDatapoints,
        expect.any(Function),
      );
    });

    test("unsubscribeNewClient should send datapoints-not-found when no datapoints are known", async () => {
      // Arrange
      const msg = buildUnsubscribeMessage();

      jest
        .spyOn(handler as any, "getKnownDatapointsByPrefix")
        .mockReturnValue([]);

      const notFoundSpy = jest.spyOn(
        handler as any,
        "sendRequestedDataPointsNotFoundErrorMsg",
      );

      // Act
      await (handler as any).unsubscribeNewClient(msg, mockWebSocket);

      // Assert
      expect(notFoundSpy).toHaveBeenCalledWith(
        mockWebSocket,
        msg.path,
        msg.requestId,
      );
    });
  });

  describe("helper methods", () => {
    test("should correctly format metadata", () => {
      // Arrange
      const mockMessage: SetMessageType = {
        instance: "",
        type: NewMessageType.Set,
        path: "Vehicle.Speed",
        requestId: "123",
        data: {},
        metadata: { some: "123456", other: "abc" },
      };

      // Act
      const result = (handler as any).extractNodesFromMetadata(mockMessage);

      // Assert
      expect(result).toEqual({
        "Vehicle.Speed_some_Metadata": JSON.stringify("123456"),
        "Vehicle.Speed_other_Metadata": JSON.stringify("abc"),
      });
    });
  });
});
