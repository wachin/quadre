/* eslint-env node */

"use strict";

const MessageHandlers: { [type: string]: (obj: any) => void } = {

};

process.on("message", async function(obj: any) {

    const type: string = obj.type;

    if (MessageHandlers[type]) {
        MessageHandlers[type](obj);
    } else {
        if (!process.send) { return; }
        process.send({
            type: "log",
            level: "warn",
            msg: `no handler for ${type}`
        });
    }

});

process.on("uncaughtException", (err: Error) => {
    if (!process.send) { return; }
    process.send({
        type: "log",
        level: "error",
        msg: err.stack
    });
});
