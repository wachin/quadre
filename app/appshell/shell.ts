/* eslint-env node */

import { BrowserWindow } from "electron";

export function getMainWindow(): Electron.BrowserWindow {
    const wins = BrowserWindow.getAllWindows();
    if (wins.length > 1) {
        console.warn(`getMainWindow() -> ${wins.length} windows open`);
    }
    return wins[0];
}

export function getProcessArgv() {
    return process.argv;
}
