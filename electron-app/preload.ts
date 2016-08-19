import * as electron from "electron";
let t;

try {
    t = {
        electron: electron,
        process: process,
        require: require,
        module: module,
        __filename: __filename,
        __dirname: __dirname,
        appshell: require("./appshell/index")
    };
} catch (err) {
    electron.ipcRenderer.send("log", err.stack);
}

process.once("loaded", function () {
    // expose electron renderer process modules
    global.electron = t.electron;
    // expose node stuff under node global wrapper because of requirejs
    global.node = {
        process: t.process,
        require: t.require,
        module: t.module,
        __filename: t.__filename,
        __dirname: t.__dirname
    };
    // this is to fix requirejs text plugin
    global.process = t.process;
    global.process.versions["node-webkit"] = true;
    // inject appshell implementation into the browser window
    global.appshell = global.brackets = t.appshell;
});
