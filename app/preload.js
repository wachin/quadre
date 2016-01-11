(function () {
    "use strict";

    // expose electron renderer process modules
    window.electron = require("electron");

    // TODO: found the reason why ipcRenderer/ipcMain aren't enough...
    window.electron.ipc = require("ipc");

    // move injected node variables, do not move "process" as that'd break node.require
    window.node = {
        process: window.process
    };
    ["require", "module", "__filename", "__dirname"].forEach(function (name) {
        window.node[name] = window[name];
        delete window[name];
    });

    // this is to fix requirejs text plugin
    window.process.versions["node-webkit"] = true;

    // inject appshell implementation into the browser window
    window.appshell = window.brackets = window.node.require("../app/appshell");
}());
