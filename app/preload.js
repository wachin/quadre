(function () {
    "use strict";

    // expose electron renderer process modules, uncomment those required
    window.electron = {
        ipc: require("ipc"),
        remote: require("remote")
        // webFrame: require("web-frame"),
        // clipboard: require("clipboard"),
        // crashReporter: require("crash-reporter"),
        // nativeImage: require("native-image"),
        // screen: require("screen"),
        // shell: require("shell")
    };

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
    try { // TODO: remove try-catch when issue fixed - https://github.com/atom/electron/issues/1566
        window.appshell = window.brackets = window.node.require("../app/appshell");
    } catch (e) {
        console.log(e.stack);
        throw e;
    }

}());
