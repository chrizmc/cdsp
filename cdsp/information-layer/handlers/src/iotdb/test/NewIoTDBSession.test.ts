import { NewIoTDBSession } from "../src/NewIoTDBSession";
import { Session } from "@iotdb/client";

jest.mock("@iotdb/client", () => {
  const mockSessionInstance = {
    open: jest.fn(),
    close: jest.fn(),
    executeQueryStatement: jest.fn(),
    insertTablet: jest.fn(),
  };

  class MockTreeTablet {
    deviceId: string;
    measurements: string[];
    dataTypes: number[];
    timestamps: number[] = [];
    values: unknown[][] = [];

    constructor(deviceId: string, measurements: string[], dataTypes: number[]) {
      this.deviceId = deviceId;
      this.measurements = measurements;
      this.dataTypes = dataTypes;
    }

    addRow(timestamp: number, values: unknown[]): void {
      this.timestamps.push(timestamp);
      this.values.push(values);
    }
  }

  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Session: jest.fn(() => mockSessionInstance),
    // eslint-disable-next-line @typescript-eslint/naming-convention
    TreeTablet: MockTreeTablet,
  };
});

jest.mock("../config/database-params", () => ({
  databaseConfig: {
    iotdbHost: "localhost",
    iotdbPort: 6667,
    iotdbUser: "root",
    iotdbPassword: "root",
  },
  databaseParams: {
    VSS: {
      databaseName: "root.vehicle",
      dataPointId: "Vehicle_VehicleIdentification_VIN",
    },
  },
}));

type MockRow = {
  getTimestamp: jest.Mock<number, []>;
  getValue: jest.Mock<unknown, [string]>;
};

type MockDataSet = {
  getColumnNames: jest.Mock<string[], []>;
  hasNext: jest.Mock<Promise<boolean>, []>;
  next: jest.Mock<MockRow, []>;
  close: jest.Mock<Promise<void>, []>;
};

const createMockRow = (
  timestamp: number,
  values: Record<string, unknown>,
): MockRow => ({
  getTimestamp: jest.fn(() => timestamp),
  getValue: jest.fn((colName: string) => values[colName]),
});

const createMockDataSet = (rows: MockRow[], columns: string[]): MockDataSet => {
  let index = 0;
  return {
    getColumnNames: jest.fn(() => columns),
    hasNext: jest.fn(async () => index < rows.length),
    next: jest.fn(() => rows[index++]),
    close: jest.fn(async () => {}),
  };
};

describe("NewIoTDBSession", () => {
  let newSession: NewIoTDBSession;
  let mockSession: {
    open: jest.Mock;
    close: jest.Mock;
    executeQueryStatement: jest.Mock;
    insertTablet: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    newSession = new NewIoTDBSession();
    mockSession = (Session as unknown as jest.Mock).mock.results[0].value;
    mockSession.insertTablet = jest.fn();
  });

  describe("lifecycle", () => {
    test("open/close session manage state", async () => {
      expect(newSession.isOpen()).toBe(false);

      await newSession.open();
      expect(mockSession.open).toHaveBeenCalled();
      expect(newSession.isOpen()).toBe(true);

      await newSession.close();
      expect(mockSession.close).toHaveBeenCalled();
      expect(newSession.isOpen()).toBe(false);
    });
  });

  describe("getDataPoints", () => {
    test("returns datapoints and merged metadata on happy path", async () => {
      const columns = [
        "root.vehicle.Vehicle_Speed",
        "root.vehicle.Vehicle_Speed_Metadata",
      ];
      /* eslint-disable @typescript-eslint/naming-convention */
      const row = createMockRow(1717414500123, {
        "root.vehicle.Vehicle_Speed": 80,
        "root.vehicle.Vehicle_Speed_Metadata": '{"unit":"km/h"}',
      });
      /* eslint-enable @typescript-eslint/naming-convention */
      const dataSet = createMockDataSet([row], columns);

      mockSession.executeQueryStatement.mockResolvedValue(dataSet);

      const result = await newSession.getDataPoints(
        ["Vehicle_Speed"],
        "VIN123",
      );

      if (!result.success) {
        throw new Error(`Expected success, got error: ${result.error}`);
      }

      expect(result.dataPoints).toEqual([{ name: "Vehicle.Speed", value: 80 }]);
      expect(result.metadata).toHaveLength(1);
      expect(result.metadata[0].name).toBe("Vehicle.Speed");
      expect(result.metadata[0].value).toMatchObject({
        unit: "km/h",
        timestamps: {
          received: {
            seconds: Math.floor(1717414500123 / 1000),
            nanos: (1717414500123 % 1000) * 1e6,
          },
        },
      });
      expect(dataSet.close).toHaveBeenCalled();
    });

    test("creates default metadata when metadata is null", async () => {
      const columns = [
        "root.vehicle.Vehicle_Speed",
        "root.vehicle.Vehicle_Speed_Metadata",
      ];
      /* eslint-disable @typescript-eslint/naming-convention */
      const row = createMockRow(1717414500123, {
        "root.vehicle.Vehicle_Speed": 42,
        "root.vehicle.Vehicle_Speed_Metadata": null,
      });
      /* eslint-enable @typescript-eslint/naming-convention */
      const dataSet = createMockDataSet([row], columns);

      mockSession.executeQueryStatement.mockResolvedValue(dataSet);

      const result = await newSession.getDataPoints(
        ["Vehicle_Speed"],
        "VIN123",
      );

      if (!result.success) {
        throw new Error(`Expected success, got error: ${result.error}`);
      }

      expect(result.dataPoints).toEqual([{ name: "Vehicle.Speed", value: 42 }]);
      expect(result.metadata).toHaveLength(1);
      expect(result.metadata[0].name).toBe("Vehicle.Speed");
      expect(result.metadata[0].value).toMatchObject({
        timestamps: {
          received: {
            seconds: Math.floor(1717414500123 / 1000),
            nanos: (1717414500123 % 1000) * 1e6,
          },
        },
      });
    });

    test("ignores null datapoint values", async () => {
      const columns = [
        "root.vehicle.Vehicle_Speed",
        "root.vehicle.Vehicle_Speed_Metadata",
      ];
      /* eslint-disable @typescript-eslint/naming-convention */
      const row = createMockRow(1717414500123, {
        "root.vehicle.Vehicle_Speed": null,
        "root.vehicle.Vehicle_Speed_Metadata": null,
      });
      /* eslint-enable @typescript-eslint/naming-convention */
      const dataSet = createMockDataSet([row], columns);

      mockSession.executeQueryStatement.mockResolvedValue(dataSet);

      const result = await newSession.getDataPoints(
        ["Vehicle_Speed"],
        "VIN123",
      );

      if (!result.success) {
        throw new Error(`Expected success, got error: ${result.error}`);
      }

      expect(result.dataPoints).toEqual([]);
      expect(result.metadata).toEqual([]);
    });

    test("handles malformed metadata JSON without throwing", async () => {
      const columns = [
        "root.vehicle.Vehicle_Speed",
        "root.vehicle.Vehicle_Speed_Metadata",
      ];
      /* eslint-disable @typescript-eslint/naming-convention */
      const row = createMockRow(1717414500123, {
        "root.vehicle.Vehicle_Speed": 99,
        "root.vehicle.Vehicle_Speed_Metadata": "{bad-json",
      });
      /* eslint-enable @typescript-eslint/naming-convention */
      const dataSet = createMockDataSet([row], columns);

      mockSession.executeQueryStatement.mockResolvedValue(dataSet);

      const result = await newSession.getDataPoints(
        ["Vehicle_Speed"],
        "VIN123",
      );

      if (!result.success) {
        throw new Error(`Expected success, got error: ${result.error}`);
      }

      expect(result.dataPoints).toEqual([{ name: "Vehicle.Speed", value: 99 }]);
      expect(result.metadata).toHaveLength(1);
      expect(result.metadata[0].name).toBe("Vehicle.Speed");
      expect(result.metadata[0].value).toMatchObject({
        timestamps: {
          received: {
            seconds: Math.floor(1717414500123 / 1000),
            nanos: (1717414500123 % 1000) * 1e6,
          },
        },
      });
    });

    test("returns failure when query execution throws", async () => {
      mockSession.executeQueryStatement.mockRejectedValue(
        new Error("query failed"),
      );

      const result = await newSession.getDataPoints(
        ["Vehicle_Speed"],
        "VIN123",
      );

      if (result.success) {
        throw new Error(`Expected failure, got success`);
      }

      expect(result.success).toBe(false);
      expect(result.error).toContain("query failed");
    });
  });

  describe("setDataPoints", () => {
    test("success and insertTablet called on valid payload", async () => {
      // Arrange
      await newSession.open();

      const insertTabletMock = jest.fn().mockResolvedValue(undefined);
      mockSession.insertTablet = insertTabletMock;

      // Act
      const result = await newSession.setDataPoints(
        "root.vehicle",
        ["Vehicle.Speed", "Vehicle_VehicleIdentification_VIN"],
        ["int16", "string"],
        [88, "VIN123"],
      );

      // Assert
      expect(result.success).toBe(true);
      expect(insertTabletMock).toHaveBeenCalledTimes(1);
    });

    test("fails on mismatched measurements/dataTypes/values lengths", async () => {
      // Arrange
      await newSession.open();

      const insertTabletMock = jest.fn().mockResolvedValue(undefined);
      mockSession.insertTablet = insertTabletMock;

      // Act
      const result = await newSession.setDataPoints(
        "root.vehicle",
        ["Vehicle.Speed", "Vehicle_VehicleIdentification_VIN"], // 2
        ["int16"], // 1
        [88, "VIN123"], // 2
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("same length");
      expect(insertTabletMock).not.toHaveBeenCalled();
    });

    test("opens session lazily when closed", async () => {
      // Arrange (session starts closed by default)
      const openSpy = jest.spyOn(newSession, "open");
      const insertTabletMock = jest.fn().mockResolvedValue(undefined);
      mockSession.insertTablet = insertTabletMock;

      // Act
      const result = await newSession.setDataPoints(
        "root.vehicle",
        ["Vehicle.Speed"],
        ["int16"],
        [77],
      );

      // Assert
      expect(openSpy).toHaveBeenCalledTimes(1);
      expect(insertTabletMock).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
    });

    test("returns failure when insertTablet throws", async () => {
      // Arrange
      await newSession.open();

      const insertTabletMock = jest
        .fn()
        .mockRejectedValue(new Error("insert failed"));
      mockSession.insertTablet = insertTabletMock;

      // Act
      const result = await newSession.setDataPoints(
        "root.vehicle",
        ["Vehicle.Speed"],
        ["int16"],
        [100],
      );

      // Assert
      expect(insertTabletMock).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(false);
      expect(result.error).toContain("insert failed");
    });

    test("falls back to STRING for unsupported data type", async () => {
      // Arrange
      await newSession.open();

      const insertTabletMock = jest.fn().mockResolvedValue(undefined);
      mockSession.insertTablet = insertTabletMock;

      // Act
      const result = await newSession.setDataPoints(
        "root.vehicle",
        ["Vehicle.Speed"],
        ["not_a_real_type"],
        [100],
      );

      // Assert
      expect(result.success).toBe(true);
      expect(insertTabletMock).toHaveBeenCalledTimes(1);
    });
  });
});
