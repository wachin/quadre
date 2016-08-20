// this is meant to replace default window.open
// see https://github.com/atom/electron/blob/master/docs/api/window-open.md

import * as assert from "assert";
import * as path from "path";
import * as URL from "url";
import { BrowserWindow } from "electron";

const windows = {};

function resolveUrl(url) {
    if (Array.isArray(url)) {
        url = URL.resolve.apply(URL, url);
    }
    if (!url.match(/^[a-zA-Z]+:\/\//)) {
        url = "file://" + url;
    }
    return url;
}

export function open(url, id, options) {
    assert(id, "id is required parameter");
    // close if exists, do not call .open for refresh
    if (windows[id]) {
        windows[id].close();
        windows[id] = null;
    }
    const win = new BrowserWindow({
        width: options.width || 800,
        height: options.height || 600,
        webPreferences: {
            nodeIntegration: false,
            preload: path.resolve(__dirname, "preload.js")
        }
    });
    win.on("closed", function() {
        windows[id] = null;
    });
    win.loadURL(resolveUrl(url));
    windows[id] = win;
    // do not send complex objects across remote when not required
    return id;
}

export function isOpen(id) {
    return windows[id] != null;
}

export function loadURL(url, id) {
    assert(id, "id is required parameter");
    assert(windows[id], "window " + id + " is not open");
    windows[id].loadURL(resolveUrl(url));
}
