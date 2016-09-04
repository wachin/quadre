define((require, exports, module) => {
    "use strict";

    const EventDispatcher = require("utils/EventDispatcher");
    const fork            = node.require("child_process").fork;
    const getLogger       = node.require("./utils").getLogger;
    const path            = node.require("path");
    const log             = getLogger("node-connection");

    const CONNECTION_TIMEOUT = 10000; // 10 seconds
    const MAX_COUNTER_VALUE = 4294967295; // 2^32 - 1

    function setDeferredTimeout(deferred, delay = CONNECTION_TIMEOUT) {
        const timer = setTimeout(() => deferred.reject("timeout"), delay);
        deferred.always(() => clearTimeout(timer));
    }

    function waitFor(condition, delay = CONNECTION_TIMEOUT) {
        const deferred = $.Deferred();
        setDeferredTimeout(deferred, delay);
        // periodically check condition
        function doCheck() {
            return condition() ? deferred.resolve() : setTimeout(doCheck, 10);
        }
        doCheck();
        return deferred.promise();
    }

    class NodeConnection {

        private domains: any; // TODO: better define structure // TODO: underscore
        private registeredDomains: { [domainPath: string]: { loaded: boolean } }; // TODO: underscore
        private _nodeProcess: any; // TODO: ChildProcess;
        private _pendingCommandDeferreds: Array<JQueryDeferred<any>>;

        constructor() {

            this.domains = {};
            this.registeredDomains = {
                // TODO: remove BaseDomain concept
                "./BaseDomain": { loaded: false }
            };
            this._nodeProcess = null;
            this._pendingCommandDeferreds = [];

        }

    }

    EventDispatcher.makeEventDispatcher(NodeConnection.prototype);

    NodeConnection.prototype.getName = function () {
        const domainPaths = Object.keys(this.registeredDomains);
        return domainPaths.length > 1 ?
            domainPaths.map(p => path.basename(p)).join(",") :
            this._nodeProcess.pid;
    };

    NodeConnection.prototype._cleanup = function () {
        // shut down the old process if there is one
        if (this._nodeProcess) {
            try {
                this._nodeProcess.kill();
            } finally {
                this._nodeProcess = null;
            }
        }

        // clear out the domains, since we may get different ones on the next connection
        this.domains = {};

        // reject all the commands that are to be resolved
        this._pendingCommandDeferreds.forEach((d) => d.reject("cleanup"));
        this._pendingCommandDeferreds = [];
    };

    /**
     * @private
     * @type {WebSocket}
     * The connection to the server
     */
    NodeConnection.prototype._ws = null;

    /**
     * @private
     * @type {?number}
     * The port the WebSocket is currently connected to
     */
    NodeConnection.prototype._port = null;

    /**
     * @private
     * @type {number}
     * Unique ID for commands
     */
    NodeConnection.prototype._commandCount = 1;

    /**
     * @private
     * @type {boolean}
     * Whether to attempt reconnection if connection fails
     */
    NodeConnection.prototype._autoReconnect = false;

    /**
     * @private
     * @type {Array.<jQuery.Deferred>}
     * Array (indexed on command ID) of deferred objects that should be
     * resolved/rejected with the response of commands.
     */
    NodeConnection.prototype._pendingCommandDeferreds = null;

    /**
     * @private
     * @return {number} The next command ID to use. Always representable as an
     * unsigned 32-bit integer.
     */
    NodeConnection.prototype._getNextCommandID = function () {
        var nextID;

        if (this._commandCount > MAX_COUNTER_VALUE) {
            nextID = this._commandCount = 0;
        } else {
            nextID = this._commandCount++;
        }

        return nextID;
    };

    /**
     * Connect to the node server. After connecting, the NodeConnection
     * object will trigger a "close" event when the underlying socket
     * is closed. If the connection is set to autoReconnect, then the
     * event will also include a jQuery promise for the connection.
     *
     * @param {boolean} autoReconnect Whether to automatically try to
     *    reconnect to the server if the connection succeeds and then
     *    later disconnects. Note if this connection fails initially, the
     *    autoReconnect flag is set to false. Future calls to connect()
     *    can reset it to true
     * @return {jQuery.Promise} Promise that resolves/rejects when the
     *    connection succeeds/fails
     */
    NodeConnection.prototype.connect = function (autoReconnect) {
        this._autoReconnect = autoReconnect;
        const deferred = $.Deferred();

        // Start the connection process
        this._cleanup();
        const nodeProcessPath = node.require.resolve("./node-process/base.js");
        this._nodeProcess = fork(nodeProcessPath);
        this._nodeProcess.on("message", (obj) => {

            // TODO: rewrite all of this
            const type: string = obj.type;
            const _messageHandlers = {
                log: ({ level, msg }) => log[level](`[node-process-${this.getName()}]`, msg),
                receive: ({ msg }) => this._receive(msg),
                refreshInterface: ({ spec }) => this.refreshInterfaceCallback(spec)
            };
            if (_messageHandlers[type]) {
                _messageHandlers[type](obj);
                return;
            }
            log.warn(`unhandled message: ${JSON.stringify(obj)}`);

        });

        // Called if we succeed at the final setup
        const success = () => {
            this._nodeProcess.on("disconnect", () => {
                this._cleanup();
                if (this._autoReconnect) {
                    this.trigger("close", this.connect(true));
                } else {
                    this.trigger("close");
                }
            });
            deferred.resolve();
        };

        // Called if we fail at the final setup
        const fail = (err) => {
            this._cleanup();
            deferred.reject(err);
        };

        // refresh the current domains, then re-register any
        // "autoregister" modules

        // TODO: we shouldn't need to wait for BaseDomain, remove the concept
        waitFor(() => this.connected() && this.registeredDomains["./BaseDomain"].loaded === true).then(() => {
            const toReload = Object.keys(this.registeredDomains)
                .filter(path => this.registeredDomains[path].autoReload === true);
            return toReload.length > 0 ?
                this._loadDomains(toReload).then(success, fail) :
                success();
        });

        return deferred.promise();
    };

    /**
     * Determines whether the NodeConnection is currently connected
     * @return {boolean} Whether the NodeConnection is connected.
     */
    NodeConnection.prototype.connected = function () {
        return this._nodeProcess && this._nodeProcess.connected;
    };

    /**
     * Explicitly disconnects from the server. Note that even if
     * autoReconnect was set to true at connection time, the connection
     * will not reconnect after this call. Reconnection can be manually done
     * by calling connect() again.
     */
    NodeConnection.prototype.disconnect = function () {
        this._autoReconnect = false;
        this._cleanup();
    };

    NodeConnection.prototype._loadDomains = function (pathArray) {
        var deferred = $.Deferred();
        setDeferredTimeout(deferred, CONNECTION_TIMEOUT);

        // TODO: shouldn't need this, should call _loadDomains
        if (this.domains.base && this.domains.base.loadDomainModulesFromPaths) {
            this.domains.base.loadDomainModulesFromPaths(pathArray).then(
                function (success) { // command call succeeded
                    if (!success) {
                        // response from commmand call was "false" so we know
                        // the actual load failed.
                        deferred.reject("loadDomainModulesFromPaths failed");
                    }
                    // if the load succeeded, we wait for the API refresh to
                    // resolve the deferred.
                },
                function (reason) { // command call failed
                    deferred.reject("Unable to load one of the modules: " + pathArray + (reason ? ", reason: " + reason : ""));
                }
            );
            waitFor(() => {
                const loadedCount = pathArray
                    .map(path => this.registeredDomains[path].loaded)
                    .filter(x => x === true)
                    .length;
                return loadedCount === pathArray.length;
            }).then(deferred.resolve);
        } else {
            deferred.reject("this.domains.base is undefined");
        }

        return deferred.promise();
    };

    NodeConnection.prototype.loadDomains = function (paths: string | Array<string>, autoReload: boolean) {
        const pathArray: Array<string> = Array.isArray(paths) ? paths : [paths];

        pathArray.forEach(path => {
            if (this.registeredDomains[path]) {
                throw new Error(`Domain path already registered: ${path}`);
            }
            this.registeredDomains[path] = {
                loaded: false,
                autoReload
            };
        });

        return this._loadDomains(pathArray);
    };

    /**
     * @private
     * Sends a message over the WebSocket. Automatically JSON.stringifys
     * the message if necessary.
     * @param {Object|string} m Object to send. Must be JSON.stringify-able.
     */
    NodeConnection.prototype._send = function (m) {
        if (this.connected()) {

            // Convert the message to a string
            var messageString: string | null = null;
            if (typeof m === "string") {
                messageString = m;
            } else {
                try {
                    messageString = JSON.stringify(m);
                } catch (stringifyError) {
                    console.error("[NodeConnection] Unable to stringify message in order to send: " + stringifyError.message);
                }
            }

            // If we succeded in making a string, try to send it
            if (messageString) {
                try {
                    this._nodeProcess.send({ type: "message", message: messageString });
                } catch (sendError) {
                    console.error("[NodeConnection] Error sending message: " + sendError.message);
                }
            }
        } else {
            console.error("[NodeConnection] Not connected to node, unable to send.");
        }
    };

    /**
     * @private
     * Handler for receiving events on the WebSocket. Parses the message
     * and dispatches it appropriately.
     * @param {WebSocket.Message} message Message object from WebSocket
     */
    NodeConnection.prototype._receive = function (messageString) {
        var responseDeferred: JQueryDeferred<any> | null = null;
        var m;

        try {
            m = JSON.parse(messageString);
        } catch (err) {
            console.error("[NodeConnection] received malformed message", messageString, err.message);
            return;
        }

        switch (m.type) {
        case "event":
            if (m.message.domain === "base" && m.message.event === "newDomains") {
                const newDomainPaths: string[] = m.message.parameters;
                newDomainPaths.forEach((newDomainPath: string) => {
                    this.registeredDomains[newDomainPath].loaded = true;
                });
            }
            // Event type "domain:event"
            EventDispatcher.triggerWithArray(this, m.message.domain + ":" + m.message.event, m.message.parameters);
            break;
        case "commandResponse":
            responseDeferred = this._pendingCommandDeferreds[m.message.id];
            if (responseDeferred) {
                responseDeferred.resolveWith(this, [m.message.response]);
                delete this._pendingCommandDeferreds[m.message.id];
            }
            break;
        case "commandProgress":
            responseDeferred = this._pendingCommandDeferreds[m.message.id];
            if (responseDeferred) {
                responseDeferred.notifyWith(this, [m.message.message]);
            }
            break;
        case "commandError":
            responseDeferred = this._pendingCommandDeferreds[m.message.id];
            if (responseDeferred) {
                responseDeferred.rejectWith(
                    this,
                    [m.message.message, m.message.stack]
                );
                delete this._pendingCommandDeferreds[m.message.id];
            }
            break;
        case "error":
            console.error("[NodeConnection] received error: " +
                            m.message.message);
            break;
        default:
            console.error("[NodeConnection] unknown event type: " + m.type);
        }
    };

    NodeConnection.prototype.refreshInterfaceCallback = function (spec) {
        const self = this;
        // TODO: move to prototype
        function makeCommandFunction(domainName, commandName) {
            return function () {
                var deferred = $.Deferred();
                var parameters = Array.prototype.slice.call(arguments, 0);
                var id = self._getNextCommandID();
                self._pendingCommandDeferreds[id] = deferred;
                self._send({
                    id: id,
                    domain: domainName,
                    command: commandName,
                    parameters: parameters
                });
                return deferred;
            };
        }
        self.domains = {};
        self.domainEvents = {};
        Object.keys(spec).forEach(function (domainKey) {
            var domainSpec = spec[domainKey];
            self.domains[domainKey] = {};
            Object.keys(domainSpec.commands).forEach(function (commandKey) {
                self.domains[domainKey][commandKey] = makeCommandFunction(domainKey, commandKey);
            });
            self.domainEvents[domainKey] = {};
            Object.keys(domainSpec.events).forEach(function (eventKey) {
                var eventSpec = domainSpec.events[eventKey];
                var parameters = eventSpec.parameters;
                self.domainEvents[domainKey][eventKey] = parameters;
            });
        });
    };

    module.exports = NodeConnection;

});
