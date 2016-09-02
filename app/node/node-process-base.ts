/* eslint-env node */

import * as ConnectionManager from "./connection-manager";
import DomainManager from "./domain-manager";

export interface ConnectionMessage {
    id: number;
    domain: string;
    command?: string;
    event?: string;
    parameters?: any[];
}

// emulate ws for now
const EventEmitter = require('events');
const ws = new EventEmitter();
ConnectionManager.createConnection(ws);

DomainManager.loadDomainModulesFromPaths(["./BaseDomain"]);

const log = {
    error: (msg: string) => {
        process.send && process.send({ type: "log", level: "error", msg });
    }
};

const MessageHandlers: { [type: string]: (obj: any) => void } = {
    "refresh-interface": () => {
        process.send && process.send({
            type: "refresh-interface-callback",
            spec: DomainManager.getDomainDescriptions()
        });
    },
    "message": ({ message }) => {
        ws.emit("message", message);
    }
};

process.on("message", async function(obj: any) {
    const type: string = obj.type;
    if (MessageHandlers[type]) {
        MessageHandlers[type](obj);
    } else {
        process.send && process.send({
            type: "log",
            level: "warn",
            msg: `no handler for ${type}`
        });
    }
});

process.on("uncaughtException", (err: Error) => {
    process.send && process.send({
        type: "log",
        level: "error",
        msg: err.stack
    });
});
