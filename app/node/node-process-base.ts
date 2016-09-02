/* eslint-env node */

import DomainManager from "../socket-server/domain-manager";

const MessageHandlers: { [type: string]: (obj: any) => void } = {
    "refresh-interface": () => {
        process.send && process.send({
            type: "refresh-interface-callback",
            spec: DomainManager.getDomainDescriptions()
        });
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
