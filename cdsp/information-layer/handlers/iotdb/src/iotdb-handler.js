const Client = require("../gen-nodejs/IClientRPCService");
const {
  TSExecuteStatementReq,
  TSOpenSessionReq,
  TSProtocolVersion,
  TSCloseSessionReq,
  TSInsertRecordReq,
} = require("../gen-nodejs/client_types");
const thrift = require("thrift");
const Handler = require("../../handler");
const config = require("../config/config");
const SessionDataSet = require("../utils/SessionDataSet");
const { IoTDBDataInterpreter } = require("../utils/IoTDBDataInterpreter");
const endpointsType = require("../config/endpointsType");
const database = require("../config/databaseParams");

/**
 * Creates an object to insert data in IoTDB based on the provided message.
 *
 * @param {Object} message - The message containing data to be inserted.
 * @returns {Object} The data object to be inserted.
 */
function createObjectToInsert(message) {
  const { id, tree } = message;
  const data = { [database[tree].endpointId]: id };
  if (message.node) {
    data[
      IoTDBDataInterpreter.transformEndpointFromMessageNode(message.node.name)
    ] = message.node.value;
  } else if (message.nodes) {
    message.nodes.forEach((node) => {
      data[IoTDBDataInterpreter.transformEndpointFromMessageNode(node.name)] =
        node.value;
    });
  }
  return data;
}

class IoTDBHandler extends Handler {
  constructor() {
    super();
    this.client = null;
    this.sendMessageToClients = null;
    this.sessionId = null;
    this.protocolVersion = TSProtocolVersion.IOTDB_SERVICE_PROTOCOL_V3;
    this.statementId = null;
    this.zoneId = config.timeZoneId;
    this.fetchSize = config.fetchSize;
    this.isSessionClosed = true;
  }

  async authenticateAndConnect(sendMessageToClients) {
    try {
      this.sendMessageToClients = sendMessageToClients;

      const connection = thrift.createConnection(
        config.iotdbHost,
        config.iotdbPort,
        {
          transport: thrift.TFramedTransport,
          protocol: thrift.TBinaryProtocol,
        }
      );

      this.client = thrift.createClient(Client, connection);

      connection.on("error", (err) => {
        console.error("thrift connection error:", err);
      });

      console.log("Successfully connected to IoTDB using thrift.");
    } catch (error) {
      console.error("Failed to authenticate with IoTDB:", error);
    }
  }

  async read(message, ws) {
    try {
      await this.#openSessionIfNeeded();
      const responseNodes = await this.#queryLastFields(message, ws);
      if (responseNodes.length > 0) {
        const responseMessage = this.createOrUpdateMessage(
          message,
          responseNodes,
          "update"
        );
        console.log(responseMessage);
        this.sendMessageToClient(ws, responseMessage);
      } else {
        console.log("Object not found.");
        this.sendMessageToClient(
          ws,
          JSON.stringify({ error: "Object not found." })
        );
      }
    } catch (error) {
      console.error("Failed to read data from IoTDB: ", error);
      this.sendMessageToClient(
        ws,
        JSON.stringify({ error: "Error reading object" })
      );
    } finally {
      this.#closeSessionIfNeeded();
    }
  }

  async write(message, ws) {
    try {
      await this.#openSessionIfNeeded();
      const data = createObjectToInsert(message);
      const errorUndefinedTypes = [];
      let measurements = [];
      let dataTypes = [];
      let values = [];

      for (const [key, value] of Object.entries(data)) {
        if (endpointsType.hasOwnProperty(key)) {
          measurements.push(key);
          dataTypes.push(endpointsType[key]);
          values.push(value);
        } else {
          errorUndefinedTypes.push(`The endpoint "${key}" is not supported`);
          continue;
        }
      }

      if (errorUndefinedTypes.length) {
        errorUndefinedTypes.forEach((error) => console.error(error));
        throw new Error("One or more endpoints are not supported.");
      }

      const timestamp = new Date().getTime();
      const deviceId = database[message.tree].databaseName;
      const status = await this.#insertRecord(
        deviceId,
        timestamp,
        measurements,
        dataTypes,
        values
      );

      const response = `Insert one record to device ${deviceId}, status: `;
      console.log(response, status);

      let keyList = measurements.map((name) => ({
        name,
      }));

      const readMessage = this.createOrUpdateMessage(message, keyList, "read");
      console.log(readMessage);

      const responseNodes = await this.#queryLastFields(message, ws);

      if (responseNodes.length) {
        const responseMessage = this.createOrUpdateMessage(
          message,
          responseNodes,
          "update"
        );
        console.log(responseMessage);
        this.sendMessageToClients(responseMessage);
      } else {
        console.log("Object not found.");
        this.sendMessageToClient(
          ws,
          JSON.stringify({ error: "Object not found." })
        );
      }
    } catch (error) {
      console.error(`Failed writing data to IoTDB. ${error}`);
      this.sendMessageToClient(
        ws,
        JSON.stringify({ error: `Failed writing data. ${error}` })
      );
    } finally {
      this.#closeSessionIfNeeded();
    }
  }

  /**
   * Opens a session with the IoTDB server using the provided credentials and configuration.
   */
  async #openSession() {
    if (!this.isSessionClosed) {
      console.info("The session is already opened.");
      return;
    }

    const openSessionReq = new TSOpenSessionReq({
      username: config.iotdbUser,
      password: config.iotdbPassword,
      client_protocol: this.protocolVersion,
      zoneId: config.timeZoneId,
      configuration: { version: "V_0_13" },
    });

    try {
      const resp = await this.client.openSession(openSessionReq);

      if (this.protocolVersion != resp.serverProtocolVersion) {
        console.log(
          "Protocol differ, Client version is " +
            this.protocolVersion +
            ", but Server version is " +
            resp.serverProtocolVersion
        );
        // version is less than 0.10
        if (resp.serverProtocolVersion == 0) {
          throw new Error("Protocol not supported.");
        }
      }

      this.sessionId = resp.sessionId;
      this.statementId = await this.client.requestStatementId(this.sessionId);
      this.isSessionClosed = false;
      console.log("Session started!");
    } catch (error) {
      console.error("Failed starting session with IoTDB: ", error);
    }
  }

  /**
   * Closes the current session if it is not already closed.
   */
  #closeSession() {
    if (this.isSessionClosed) {
      console.info("Session is already closed.");
      return;
    }

    let req = new TSCloseSessionReq({
      sessionId: this.sessionId,
    });

    try {
      this.client.closeSession(req);
    } catch (error) {
      console.error(
        "Error occurs when closing session at server. Maybe server is down. Error message: ",
        error
      );
    } finally {
      this.isSessionClosed = true;
      console.log("Session closed!");
    }
  }

  async #openSessionIfNeeded() {
    if (this.isSessionClosed) {
      await this.#openSession();
    }
  }

  async #closeSessionIfNeeded() {
    if (!this.isSessionClosed) {
      this.#closeSession();
    }
  }

  /**
   * Executes a SQL query statement asynchronously.
   *
   * @param {string} sql - The SQL query statement to be executed.
   * @returns {Promise<SessionDataSet|Object>} - Returns a SessionDataSet object if the query is successful,
   *                                             otherwise returns an empty object.
   * @throws {Error} - Throws an error if the session is not open.
   */
  async #executeQueryStatement(sql) {
    try {
      if (!this.sessionId) {
        throw new Error("Session is not open. Please authenticate first.");
      }

      const request = new TSExecuteStatementReq({
        sessionId: this.sessionId,
        statement: sql,
        statementId: this.statementId,
        fetchSize: this.fetchSize,
        timeout: 0,
      });

      const resp = await this.client.executeQueryStatement(request);
      if (!resp || !resp.queryDataSet || !resp.queryDataSet.valueList) {
        return {};
      } else {
        return new SessionDataSet(
          resp.columns,
          resp.dataTypeList,
          resp.columnNameIndexMap,
          resp.queryId,
          this.client,
          this.statementId,
          this.sessionId,
          resp.queryDataSet,
          resp.ignoreTimeStamp
        );
      }
    } catch (error) {
      console.error("Failed executing query statement: ", error);
    }
  }

  /**
   * Inserts a record into the time series database.
   * @param {string} deviceId - The ID of the device.
   * @param {number} timestamp - The timestamp of the record.
   * @param {string[]} measurements - Array of measurement names.
   * @param {string[]} dataTypes - Array of data types for each value.
   * @param {any[]} values - Array of values to be inserted.
   * @param {boolean} isAligned - Flag indicating if the data is aligned.
   * @returns {Promise<any>} - A promise that resolves with the result of the insertion.
   * @throws {string} - Throws an error if lengths of data types, values, and measurements do not match.
   */
  async #insertRecord(
    deviceId,
    timestamp,
    measurements,
    dataTypes,
    values,
    isAligned = false
  ) {
    if (
      values.length != dataTypes.length ||
      values.length != measurements.length
    ) {
      throw "length of data types does not equal to length of values!";
    }
    const valuesInBytes = IoTDBDataInterpreter.serializeValues(
      dataTypes,
      values
    );

    let request = new TSInsertRecordReq({
      sessionId: this.sessionId,
      prefixPath: deviceId,
      measurements: measurements,
      values: valuesInBytes,
      timestamp: timestamp,
      isAligned: isAligned,
    });
    return await this.client.insertRecord(request);
  }

  /**
   * Queries the last fields from the database based on the provided message and sends the response to the client.
   *
   * @param {Object} message - The message object containing the query details.
   * @param {WebSocket} ws - The WebSocket connection to send the response to.
   * @private
   */
  async #queryLastFields(message, ws) {
    const { id: objectId, tree } = message;
    const { databaseName, endpointId } = database[tree];
    const fieldsToSearch =
      IoTDBDataInterpreter.extractEndpointsFromNodes(message).join(", ");
    const sql = `SELECT ${fieldsToSearch} FROM ${databaseName} WHERE ${endpointId} = '${objectId}' ORDER BY Time ASC`;

    try {
      const sessionDataSet = await this.#executeQueryStatement(sql);

      if (!sessionDataSet || Object.keys(sessionDataSet).length === 0) {
        throw new Error({ error: "Internal error constructing read object." });
      }

      const mediaElements = [];
      while (sessionDataSet.hasNext()) {
        mediaElements.push(sessionDataSet.next());
      }

      let latestValues = {};

      mediaElements.forEach((mediaElement) => {
        const transformedObject =
          IoTDBDataInterpreter.extractNodesFromTimeseries(
            mediaElement,
            databaseName
          );
        Object.entries(transformedObject).forEach(([key, value]) => {
          if (value !== null) {
            latestValues[key] = value;
          }
        });
      });

      return Object.entries(latestValues).map(([name, value]) => ({
        name,
        value,
      }));
    } catch (error) {
      console.error(error);
      this.sendMessageToClient(
        ws,
        JSON.stringify({ error: "Internal error constructing read object." })
      );
    }
  }
}

module.exports = IoTDBHandler;
