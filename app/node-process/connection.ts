/* eslint-env node */

import DomainManager from "./domain-manager";
import { errToMessage, errToString } from "../utils";

/* eslint-disable */
export interface ConnectionMessage {
    id: number;
    domain: string;
    command?: string;
    event?: string;
    parameters?: any[];
}

export interface ConnectionErrorMessage {
    message: string;
}

export interface CommandResponse {
    id: number;
    response: any;
}

export interface CommandError {
    id: number;
    message: string;
    stack: string;
}
/* eslint-enable */

export const Connection = {

    setEmitter: function setEmitter(ws: any) {
        this._ws = ws;
        this._connected = !!ws;
        if (this._ws) {
            this._ws.on("message", this._receive.bind(this));
            this._ws.on("close", this.close.bind(this));
        }
    },

    _send: function _send(
        type: string,
        message: ConnectionMessage | ConnectionErrorMessage | CommandResponse | CommandError
    ) {
        try {
            process.send && process.send({
                type: "receive",
                msg: JSON.stringify({ type, message })
            });
        } catch (e) {
            console.error("[Connection] Unable to stringify message: " + e.message);
        }
    },

    _sendBinary: function _sendBinary(message: Buffer) {
        process.send && process.send({
            type: "receive",
            msg: message,
            options: { binary: true, mask: false }
        });
    },

    _receive: function _receive(message: string) {
        let m: ConnectionMessage;
        try {
            m = JSON.parse(message);
        } catch (ignoreErr) {
            // try again with potentially missing `}`, this should be fixed when we get rid of websockets
            try {
                m = JSON.parse(message + "}");
            } catch (err) {
                console.error(`[Connection] Error parsing message json: ${err.name}: ${err.message}`);
                this.sendError("Unable to parse message: " + message);
                return;
            }
        }

        const validId = m.id != null;
        const hasDomain = !!m.domain;
        const hasCommand = typeof m.command === "string";

        if (validId && hasDomain && hasCommand) {
            // okay if m.parameters is null/undefined
            try {
                DomainManager.executeCommand(
                    this,
                    m.id,
                    m.domain,
                    m.command as string,
                    m.parameters
                );
            } catch (executionError) {
                this.sendCommandError(m.id, errToMessage(executionError), errToString(executionError));
            }
        } else {
            this.sendError(`Malformed message (${validId}, ${hasDomain}, ${hasCommand}): ${message}`);
        }
    },

    close: function close() {
        process.exit(0);
    },

    sendError: function sendError(message: string) {
        this._send("error", { message });
    },

    sendCommandResponse: function sendCommandResponse(id: number, response: Object | Buffer) {
        if (Buffer.isBuffer(response)) {
            // Assume the id is an unsigned 32-bit integer, which is encoded
            // as a four-byte header
            const header = new Buffer(4);

            header.writeUInt32LE(id, 0);

            // Prepend the header to the message
            const message = Buffer.concat([header, response], response.length + 4);

            this._sendBinary(message);
        } else {
            this._send("commandResponse", { id, response });
        }
    },

    sendCommandProgress: function sendCommandProgress(id: number, message: any) {
        this._send("commandProgress", {id, message });
    },

    sendCommandError: function sendCommandError(id: number, message: string, stack?: string) {
        this._send("commandError", { id, message, stack });
    },

    sendEventMessage: function sendEventMessage(id: number, domain: string, event: string, parameters?: any[]) {
        this._send("event", { id, domain, event, parameters });
    }

};

export default Connection;
