/* eslint-env node */

import { log } from "./logging";
import * as ConnectionManager from "./connection-manager";
import DomainManager from "./domain-manager";

// emulate ws for now
const EventEmitter = require("events");
const ws = new EventEmitter();
ws.send = function (msg: any, options: any) {
    if (options) {
        log.warn(`ws.send options: ${options}`);
    }
    process.send && process.send({ type: "receive", msg });
};
ConnectionManager.createConnection(ws);

// load the base domain
DomainManager.loadDomainModulesFromPaths(["./BaseDomain"], false);

const MessageHandlers: { [type: string]: (obj: any) => void } = {
    refreshInterface: () => {
        process.send && process.send({
            type: "refreshInterface",
            spec: DomainManager.getDomainDescriptions()
        });
    },
    message: ({ message }) => {
        ws.emit("message", message);
    }
};

process.on("message", async function(obj: any) {
    const type: string = obj.type;
    if (MessageHandlers[type]) {
        MessageHandlers[type](obj);
    } else {
        log.warn(`no handler for ${type}`);
    }
});

process.on("uncaughtException", (err: Error) => {
    log.error(`uncaughtException: ${err.stack}`);
    process.exit(1);
});
