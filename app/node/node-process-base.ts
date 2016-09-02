/* eslint-env node */

import * as ConnectionManager from "./connection-manager";
import DomainManager from "./domain-manager";

// logger
const log = {
    info: (msg: string) => {
        process.send && process.send({ type: "log", level: "info", msg });
    },
    warn: (msg: string) => {
        process.send && process.send({ type: "log", level: "warn", msg });
    },
    error: (msg: string) => {
        process.send && process.send({ type: "log", level: "error", msg });
    }
};
console.log = (...args: any[]) => log.info(args.join(" "));
console.warn = (...args: any[]) => log.warn(args.join(" "));
console.error = (...args: any[]) => log.error(args.join(" "));

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
DomainManager.loadDomainModulesFromPaths(["./BaseDomain"]);

const MessageHandlers: { [type: string]: (obj: any) => void } = {
    "refresh-interface": () => {
        process.send && process.send({
            type: "refresh-interface-callback",
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
});
