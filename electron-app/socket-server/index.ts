import * as http from "http";
import * as ConnectionManager from "./connection-manager";
import * as DomainManager from "./domain-manager";
import * as Logger from "../logger";
import * as WebSocket from "ws";
const Server = WebSocket.Server;
const log = Logger.get("socket-server");
const portscanner = require("portscanner");

const DEFAULT_PORT = 8123;
let httpServer: http.Server = null;
let httpPort: number = null;
let wsServer: WebSocket.Server = null;

function initPort() {
    return new Promise(function (resolve, reject) {
        portscanner.findAPortNotInUse(
            DEFAULT_PORT,
            DEFAULT_PORT + 1000,
            "127.0.0.1",
            function(err: Error, port: number) {
                if (err) {
                    return reject(err);
                }
                httpPort = port;
                resolve();
            }
        );
    });
}

function initHttp() {
    return new Promise(function (resolve, reject) {
        const server = http.createServer(function(req, res) {
            if (req.method === "GET" && req.url.indexOf("/api") === 0) {
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify(DomainManager.getDomainDescriptions(), null, 4));
                return;
            }
            log.info("received unhandled http request for " + req.url);
            res.writeHead(404, {
                "Content-Type": "text/plain"
            });
            res.end("Brackets-Shell Server");
        });
        server.on("error", function (err: Error) {
            log.error(err.name + ": " + err.message);
        });
        server.listen(httpPort, function() {
            httpServer = server;
            resolve();
        });
    });
}

function initWebsockets() {
    wsServer = new Server({
        server: httpServer
    });
    wsServer.on("error", function (err) {
        log.error("wsServer error: " + err);
    });
    wsServer.on("connection", ConnectionManager.createConnection);
}

export function start(callback: (err: Error, res?: any) => void) {
    initPort()
        .then(function () {
            return initHttp();
        })
        .then(function () {
            return initWebsockets();
        })
        .then(function () {
            return DomainManager.loadDomainModulesFromPaths(["./BaseDomain"]);
        })
        .then(function () {
            return httpPort;
        })
        .then(res => callback(null, res))
        .catch(err => callback(err));
};

export function stop(callback: (err: Error, res?: any) => void) {
    if (wsServer) {
        wsServer.close();
        wsServer = null;
    } else {
        log.warn("wsServer not running but stop has been called!");
    }

    if (httpServer) {
        httpServer.close();
        httpServer = null;
    } else {
        log.warn("httpServer not running but stop has been called!");
    }

    ConnectionManager.closeAllConnections();

    process.nextTick(callback);
};
