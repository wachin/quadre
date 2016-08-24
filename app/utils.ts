import { app } from "electron";
const { log, warn, error } = console; // tslint:disable-line

export function isDev() {
    return app.getPath("exe").endsWith("electron.exe");
}

export function getLogger(name: string) {
    return {
        info: (...msgs: string[]) => log(`[${name}]`, ...msgs),
        warn: (...msgs: string[]) => warn(`[${name}]`, ...msgs),
        error: (...msgs: string[]) => error(`[${name}]`, ...msgs)
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
