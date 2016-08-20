import * as assert from "assert";
import * as path from "path";
import * as utils from "../utils";
import { app, remote, shell } from "electron";

const REMOTE_DEBUGGING_PORT = 9234; // TODO: this is hardcoded in brackets-shell
const shellState = remote.require("./shell-state");
const startupTime = process.hrtime();

export const NO_ERROR = null;
export const ERR_NOT_FOUND = "NOTFOUND";
// TODO: cleanup unused below
export const ERR_CL_TOOLS_CANCELLED = 12;
export const ERR_CL_TOOLS_MKDIRFAILED = 14;
export const ERR_CL_TOOLS_NOTSUPPORTED = 17;
export const ERR_CL_TOOLS_RMFAILED = 13;
export const ERR_CL_TOOLS_SERVFAILED = 16;
export const ERR_CL_TOOLS_SYMLINKFAILED = 15;
export const ERR_NODE_FAILED = -3;
export const ERR_NODE_NOT_YET_STARTED = -1;
export const ERR_NODE_PORT_NOT_YET_SET = -2;
// TODO: this should be changeable
export const language = "en";

export function closeLiveBrowser(callback) {
    process.nextTick(function () {
        // TODO: implement
        callback(new Error("app.closeLiveBrowser not implemented"));
    });
};

export function dragWindow() {
    // TODO: implement
    throw new Error("app.dragWindow not implemented");
};

export function getApplicationSupportDirectory() {
    return utils.convertWindowsPathToUnixPath(app.getPath("userData"));
};

export function getExtensionsFolder() {
    return utils.convertWindowsPathToUnixPath(
        path.resolve(getApplicationSupportDirectory(), "..", "Brackets", "extensions")
    );
};

// TODO: it seems that both arguments aren't needed anymore
export function showExtensionsFolder(appURL, callback) {
    process.nextTick(function () {
        shell.showItemInFolder(utils.convertBracketsPathToWindowsPath(getExtensionsFolder()));
        if (callback) { callback(NO_ERROR); }
    });
};

export function getDroppedFiles(callback) {
    process.nextTick(function () {
        // TODO: implement
        callback(new Error("app.getDroppedFiles not implemented"));
    });
};

// return the number of milliseconds that have elapsed since the application was launched
export function getElapsedMilliseconds() {
    const diff = process.hrtime(startupTime);
    // diff = [ seconds, nanoseconds ]
    return diff[0] * 1000 + diff[1] / 1000000;
};

export function getNodeState(callback) {
    process.nextTick(function () {
        const errorCode = exports[shellState.get("socketServer.state")];
        const port = shellState.get("socketServer.port");
        callback(errorCode, port);
    });
};

export function getPendingFilesToOpen(callback) {
    process.nextTick(function () {
        // TODO: implement
        callback(new Error("app.getPendingFilesToOpen not implemented"), []);
    });
};

export function getRemoteDebuggingPort() {
    return REMOTE_DEBUGGING_PORT;
};

export function getUserHomeDirectory() {
    return utils.convertWindowsPathToUnixPath(app.getPath("home"));
};

export function getUserDocumentsDirectory() {
    console.warn("DEPRECATED: don't use app.getUserDocumentsDirectory(); replaced by app.getUserHomeDirectory()");
    return getUserHomeDirectory();
};

export function installCommandLine(callback) {
    process.nextTick(function () {
        // TODO: implement
        callback(new Error("app.installCommandLine not implemented"));
    });
};

export function openLiveBrowser(url, enableRemoteDebugging, callback) {
    process.nextTick(function () {
        // TODO: implement
        callback(new Error("app.openLiveBrowser not implemented" + url));
    });
};

export function openURLInDefaultBrowser(url, callback) {
    assert(url && typeof url === "string", "url must be a string");
    process.nextTick(function () {
        shell.openExternal(url);
        if (callback) {
            callback(NO_ERROR);
        }
    });
};

export function quit() {
    app.quit();
};

export function showDeveloperTools() {
    const win = remote.getCurrentWindow();
    win.webContents.openDevTools({ mode: "detach" });
};

// TODO: get rid of callback? This call is not throwing any error.
export function showOSFolder(path, callback) {
    process.nextTick(function () {
        shell.showItemInFolder(utils.convertBracketsPathToWindowsPath(path));
        if (callback) { callback(NO_ERROR); }
    });
};
