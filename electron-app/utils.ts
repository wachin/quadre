export function errToString(err) {
    if (err.stack) {
        return err.stack;
    }
    if (err.name && err.message) {
        return err.name + ": " + err.message;
    }
    return err.toString();
}

export function convertWindowsPathToUnixPath(path) {
    if (process.platform === "win32") {
        path = path.replace(/\\/g, "/");
    }
    return path;
}

export function convertBracketsPathToWindowsPath(path) {
    if (process.platform === "win32") {
        path = path.replace(/\//g, "\\");
    }
    return path;
}
