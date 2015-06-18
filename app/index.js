#!/usr/bin/env electron

/*jshint globalstrict:true, node:true*/

"use strict";

var _ = require("lodash");
var appInfo = require("../package.json");
var path = require("path");
var app = require("app"); // Electron module to control application life
var BrowserWindow = require("browser-window"); // Electron to create native browser window
var SocketServer = require("./socket-server"); // Implementation of Brackets' shell server
var utils = require("./utils");
var shellConfig = require("./shell-config");
var shellState = require("./shell-state");

// Live browser modules
var live_preview_browser;
var ipc                  = require('ipc');

// Live browser preview implemented only on mac.
// TODO: Port this to Windows and Linux as well.
if (process.platform === "darwin" || process.platform === "win32") {
    live_preview_browser = require("live-browser-preview");
    //runas = require("../node_modules/pathwatcher/node_modules/runas");
}


// Report crashes to electron server
// TODO: doesn't work
// require("crash-reporter").start();

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the javascript object is GCed.
var wins = [];

// fetch window position values from the window and save them to config file
function _saveWindowPosition(sync, win) {
    var size = win.getSize();
    var pos = win.getPosition();
    shellConfig.set("window.posX", pos[0]);
    shellConfig.set("window.posY", pos[1]);
    shellConfig.set("window.width", size[0]);
    shellConfig.set("window.height", size[1]);
    shellConfig.set("window.maximized", win.isMaximized());
    if (sync) {
        shellConfig.saveSync();
    } else {
        shellConfig.save();
    }
}
var saveWindowPositionSync = _.partial(_saveWindowPosition, true);
var saveWindowPosition = _.debounce(_.partial(_saveWindowPosition, false), 100);

// Quit when all windows are closed.
app.on("window-all-closed", function () {
    app.quit();
});

// Start the socket server used by Brackets'
SocketServer.start(function (err, port) {
    if (err) {
        shellState.set("socketServer.state", "ERR_NODE_FAILED");
        console.log("socket-server failed to start: " + utils.errToString(err));
    } else {
        shellState.set("socketServer.state", "NO_ERROR");
        shellState.set("socketServer.port", port);
        console.log("socket-server started on port " + port);
    }
});

function openBracketsWindow(queryObj) {
    queryObj = queryObj || {};

    // compose path to brackets' index file
    var indexPath = "file://" + path.resolve(__dirname, "..", "src", "index.html");

    // build a query for brackets' window
    var queryString = "";
    if (_.isObject(queryObj) && !_.isEmpty(queryObj)) {
        queryString = "?" + _.map(queryObj, function (value, key) {
            return key + "=" + encodeURIComponent(value);
        }).join("&");
    } else if (_.isString(queryObj)) {
        var io1 = queryObj.indexOf("?");
        var io2 = queryObj.indexOf("#");
        if (io1 !== -1) {
            queryString = queryObj.substring(io1);
        } else if (io2 !== -1) {
            queryString = queryObj.substring(io2);
        } else {
            queryString = "";
        }
    }

    var indexUrl = indexPath + queryString;

    var winOptions = {
        preload: require.resolve("./preload"),
        title: appInfo.productName,
        icon: path.resolve(__dirname, "res", "appicon.png"),
        x: shellConfig.get("window.posX"),
        y: shellConfig.get("window.posY"),
        width: shellConfig.get("window.width"),
        height: shellConfig.get("window.height")
    };

    // create the browser window
    var win = new BrowserWindow(winOptions);
    wins.push(win);

    // load the index.html of the app
    win.loadUrl(indexUrl);
    if (shellConfig.get("window.maximized")) {
        win.maximize();
    }

    // emitted when the window is closed
    win.on("closed", function () {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        var io = wins.indexOf(win);
        if (io !== -1) { wins.splice(io, 1); }
    });

    // this is used to remember the size from the last time
    // emitted before the window is closed
    win.on("close", function () {
        saveWindowPositionSync(win);
    });
    win.on("maximize", function () {
        saveWindowPosition(win);
    });
    win.on("unmaximize", function () {
        saveWindowPosition(win);
    });
    win.on("resize", function () {
        saveWindowPosition(win);
    });
    win.on("move", function () {
        saveWindowPosition(win);
    });

    return win;
}

// This method will be called when Electron has done everything
// initialization and ready for creating browser windows.
app.on("ready", function () {
    openBracketsWindow();
});

ipc.on('openLiveBrowser', function(event, arg, enableRemoteDebugging, appSupportDir) {
    if (live_preview_browser) {
        var retVal = live_preview_browser.openLiveBrowser(arg, enableRemoteDebugging, appSupportDir);
        if (retVal === 0) {
            event.sender.send('liveBrowserOpenResult');
        } else {
            event.sender.send('liveBrowserOpenResult', retVal);
        }
    } else {
        event.sender.send('liveBrowserOpenResult', "Not yet Implemented!");
    }
});

ipc.on('closeLiveBrowser', function(event) {
    if (live_preview_browser) {
        var retVal = live_preview_browser.closeLiveBrowser( function (retVal) {
            event.sender.send('liveBrowserCloseResult', retVal);
        });
    } else {
        event.sender.send('liveBrowserCloseResult', "Not yet Implemented!");
    }
});


exports.openBracketsWindow = openBracketsWindow;

exports.getMainWindow = function () {
    return wins[0];
};

exports.restart = function (query) {
    while (wins.length > 0) {
        wins.shift().close();
    }
    openBracketsWindow(query);
};
