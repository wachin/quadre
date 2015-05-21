/*jshint globalstrict:true, node:true*/

"use strict";

var assert = require("assert");
var shell = require("shell");
var utils = require("../utils");

var remote = require("remote");
var electronApp = remote.require("app");
var shellState = remote.require("./shell-state");

var REMOTE_DEBUGGING_PORT = 9234; // TODO: this is hardcoded in brackets-shell

var app = module.exports = {
    NO_ERROR: null,
    ERR_NOT_FOUND: "NOTFOUND",
    // TODO: cleanup unused below
    ERR_CL_TOOLS_CANCELLED: 12,
    ERR_CL_TOOLS_MKDIRFAILED: 14,
    ERR_CL_TOOLS_NOTSUPPORTED: 17,
    ERR_CL_TOOLS_RMFAILED: 13,
    ERR_CL_TOOLS_SERVFAILED: 16,
    ERR_CL_TOOLS_SYMLINKFAILED: 15,
    ERR_NODE_FAILED: -3,
    ERR_NODE_NOT_YET_STARTED: -1,
    ERR_NODE_PORT_NOT_YET_SET: -2,
    // TODO: this should be changeable
    language: "en",
    // underscore electron custom props
    _startup: process.hrtime()
};

app.closeLiveBrowser = function (callback) {
    process.nextTick(function () {
        // TODO: implement
        callback(new Error("app.closeLiveBrowser not implemented"));
    });
};

app.dragWindow = function () {
    // TODO: implement
    throw new Error("app.dragWindow not implemented");
};

app.getApplicationSupportDirectory = function () {
    return utils.convertWindowsPathToUnixPath(electronApp.getPath("userData"));
};

app.getExtensionsFolder = function () {
    return app.getApplicationSupportDirectory() + "/extensions";
};

// TODO: it seems that both arguments aren't needed anymore
app.showExtensionsFolder = function (appURL, callback) {
    process.nextTick(function () {
        shell.showItemInFolder(utils.convertBracketsPathToWindowsPath(app.getExtensionsFolder()));
        if (callback) { callback(app.NO_ERROR); }
    });
};

app.getDroppedFiles = function (callback) {
    process.nextTick(function () {
        // TODO: implement
        callback(new Error("app.getDroppedFiles not implemented"));
    });
};

// return the number of milliseconds that have elapsed since the application was launched
app.getElapsedMilliseconds = function () {
    var diff = process.hrtime(app._startup);
    // diff = [ seconds, nanoseconds ]
    return diff[0] * 1000 + diff[1] / 1000000;
};

app.getNodeState = function (callback) {
    process.nextTick(function () {
        var errorCode = app[shellState.get("socketServer.state")];
        var port = shellState.get("socketServer.port");
        callback(errorCode, port);
    });
};

app.getPendingFilesToOpen = function (callback) {
    process.nextTick(function () {
        // TODO: implement
        callback(new Error("app.getPendingFilesToOpen not implemented"), []);
    });
};

app.getRemoteDebuggingPort = function () {
    return REMOTE_DEBUGGING_PORT;
};

app.getUserHomeDirectory = function () {
    return utils.convertWindowsPathToUnixPath(electronApp.getPath("home"));
};

app.getUserDocumentsDirectory = function () {
    console.warn("DEPRECATED: don't use app.getUserDocumentsDirectory(); replaced by app.getUserHomeDirectory()");
    return app.getUserHomeDirectory();
};

app.installCommandLine = function (callback) {
    process.nextTick(function () {
        // TODO: implement
        callback(new Error("app.installCommandLine not implemented"));
    });
};

app.openLiveBrowser = function (url, enableRemoteDebugging, callback) {
    process.nextTick(function () {
        // TODO: implement
        callback(new Error("app.openLiveBrowser not implemented" + url));
    });
};

app.openURLInDefaultBrowser = function (url, callback) {
    assert(url && typeof url === "string", "url must be a string");
    process.nextTick(function () {
        shell.openExternal(url);
        if (callback) {
            callback(app.NO_ERROR);
        }
    });
};

app.quit = function () {
    electronApp.quit();
};

app.showDeveloperTools = function () {
    var win = remote.getCurrentWindow();
    win.openDevTools({detach: true});
};

// TODO: get rid of callback? This call is not throwing any error.
app.showOSFolder = function (path, callback) {
    process.nextTick(function () {
        shell.showItemInFolder(utils.convertBracketsPathToWindowsPath(path));
        if (callback) { callback(app.NO_ERROR); }
    });
};
