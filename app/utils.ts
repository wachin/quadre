/* eslint-env node */

import { app } from "electron";

export function isDev() {
    return /(\/|\\)electron.exe$/i.test(app.getPath("exe"));
}

let loggerWindow: Electron.BrowserWindow;

export function setLoggerWindow(win: Electron.BrowserWindow) {
    win.webContents.once("did-frame-finish-load", (event: any) => {
        loggerWindow = win;
    });
}

function logWithLevel(level: string, ...args: string[]): void {

    // if there's main window, log into its console
    if (loggerWindow) {
        loggerWindow.webContents.send("log", level, ...args);
        return;
    }

    // if there's no main window, use normal logging
    switch (level) {
        case "error":
            (console as any).error(...args);
            break;
        case "warn":
            (console as any).warn(...args);
            break;
        default:
            (console as any).log(...args);
    }
}

export function getLogger(name: string) {
    return {
        info: (...msgs: string[]) => logWithLevel("info", `[${name}]`, ...msgs),
        warn: (...msgs: string[]) => logWithLevel("warn", `[${name}]`, ...msgs),
        error: (...msgs: string[]) => logWithLevel("error", `[${name}]`, ...msgs)
    };
}

export function errToString(err: Error): string {
    if (err.stack) {
        return err.stack;
    }
    if (err.name && err.message) {
        return err.name + ": " + err.message;
    }
    return err.toString();
}

export function convertWindowsPathToUnixPath(path: string): string {
    return process.platform === "win32" ? path.replace(/\\/g, "/") : path;
}

export function convertBracketsPathToWindowsPath(path: string): string {
    return process.platform === "win32" ? path.replace(/\//g, "\\") : path;
}
