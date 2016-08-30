/* eslint-env node */

import { app, BrowserWindow } from "electron";

export function isDev() {
    return /(\/|\\)electron.exe$/i.test(app.getPath("exe"));
}

let mainWindow: Electron.BrowserWindow;
let mainWindowLoaded: boolean = false;
function logWithLevel(level: string, ...args: string[]) {

    // this works when it's called from shell, not from renderer process
    if (mainWindow == null && BrowserWindow) {
        let windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
            mainWindow = windows[0];
            mainWindow.webContents.once("did-frame-finish-load", (event: any) => {
                mainWindowLoaded = true;
            });
        }
    }

    // if there's main window, log into its console
    if (mainWindow != null && mainWindowLoaded) {
        mainWindow.webContents.send("log", level, ...args);
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
