/*
 * Copyright (c) 2013 - present Adobe Systems Incorporated. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

declare const brackets: any;

define(function (require, exports, module) {
    "use strict";

    var EventDispatcher = require("utils/EventDispatcher");
    var fork            = node.require("child_process").fork;
    var getLogger       = node.require("./utils").getLogger;
    var log             = getLogger("node-connection");

    /**
     * Milliseconds to wait before a particular connection attempt is considered failed.
     * NOTE: It's okay for the connection timeout to be long because the
     * expected behavior of WebSockets is to send a "close" event as soon
     * as they realize they can't connect. So, we should rarely hit the
     * connection timeout even if we try to connect to a port that isn't open.
     * @type {number}
     */
    var CONNECTION_TIMEOUT  = 10000; // 10 seconds

    /**
     * Maximum value of the command ID counter
     * @type  {number}
     */
    var MAX_COUNTER_VALUE = 4294967295; // 2^32 - 1

    /**
     * @private
     * Helper function to auto-reject a deferred after a given amount of time.
     * If the deferred is resolved/rejected manually, then the timeout is
     * automatically cleared.
     */
    function setDeferredTimeout(deferred, delay) {
        var timer = setTimeout(function () {
            deferred.reject("timeout");
        }, delay);
        deferred.always(function () { clearTimeout(timer); });
    }

    /**
     * Provides an interface for interacting with the node server.
     * @constructor
     */
    function NodeConnection() {
        this.domains = {};
        this._messageHandlers = {};
        this._tempMessageHandlers = [];
        this._registeredModules = [];
        this._pendingInterfaceRefreshDeferreds = [];
        this._pendingCommandDeferreds = [];
    }
    EventDispatcher.makeEventDispatcher(NodeConnection.prototype);

    /**
     * @type {Object}
     * Exposes the domains registered with the server. This object will
     * have a property for each registered domain. Each of those properties
     * will be an object containing properties for all the commands in that
     * domain. So, myConnection.base.enableDebugger would point to the function
     * to call to enable the debugger.
     *
     * This object is automatically replaced every time the API changes (based
     * on the base:newDomains event from the server). Therefore, code that
     * uses this object should not keep their own pointer to the domain property.
     */
    NodeConnection.prototype.domains = null;

    /**
     * @private
     * @type {Array.<string>}
     * List of module pathnames that should be re-registered if there is
     * a disconnection/connection (i.e. if the server died).
     */
    NodeConnection.prototype._registeredModules = null;

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
     * List of deferred objects that should be resolved pending
     * a successful refresh of the API
     */
    NodeConnection.prototype._pendingInterfaceRefreshDeferreds = null;

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
     * @private
     * Helper function to do cleanup work when a connection fails
     */
    NodeConnection.prototype._cleanup = function () {
        // clear out the domains, since we may get different ones
        // on the next connection
        this.domains = {};

        // shut down the old connection if there is one
        if (this._ws && this._ws.readyState !== WebSocket.CLOSED) {
            try {
                this._ws.close();
            } catch (e) { }
        }
        var failedDeferreds = this._pendingInterfaceRefreshDeferreds
            .concat(this._pendingCommandDeferreds);
        failedDeferreds.forEach(function (d) {
            d.reject("cleanup");
        });
        this._pendingInterfaceRefreshDeferreds = [];
        this._pendingCommandDeferreds = [];

        if (this._nodeProcess) {
            this._nodeProcess.kill();
            this._nodeProcess = null;
        }
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
        var deferred = $.Deferred();

        // Start the connection process
        this._cleanup();
        const nodeProcessPath = node.require.resolve("./node/node-process-base.js");
        this._nodeProcess = fork(nodeProcessPath);
        this._nodeProcess.on('message', (obj) => {            
            const type: string = obj.type;            
            if (this._messageHandlers[type]) {
                this._messageHandlers[type](obj);
                return;
            }
            
            const temp = this._tempMessageHandlers.find(x => x.type === type);
            if (temp) {                
                this._tempMessageHandlers.splice(this._tempMessageHandlers.indexOf(temp), 1);
                temp.handler(obj);
                return;
            }
            
            log.warn(`unhandled message: ${JSON.stringify(obj)}`);
        });

        // Called if we succeed at the final setup
        const success = () => {
            this._ws.onclose = () => {
                if (this._autoReconnect) {
                    var $promise = this.connect(true);
                    this.trigger("close", $promise);
                } else {
                    this._cleanup();
                    this.trigger("close");
                }
            };
            deferred.resolve();
        };

        // Called if we fail at the final setup
        const fail = (err) => {
            this._cleanup();
            deferred.reject(err);
        };

        // refresh the current domains, then re-register any
        // "autoregister" modules
        this._refreshInterface().then(() => {
            if (this._registeredModules.length > 0) {
                this.loadDomains(this._registeredModules, false).then(
                    success,
                    fail
                );
            } else {
                success();
            }
        }, fail);

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

    /**
     * Load domains into the server by path
     * @param {Array.<string>} List of absolute paths to load
     * @param {boolean} autoReload Whether to auto-reload the domains if the server
     *    fails and restarts. Note that the reload is initiated by the
     *    client, so it will only happen after the client reconnects.
     * @return {jQuery.Promise} Promise that resolves after the load has
     *    succeeded and the new API is availale at NodeConnection.domains,
     *    or that rejects on failure.
     */
    NodeConnection.prototype.loadDomains = function (paths, autoReload) {
        var deferred = $.Deferred();
        setDeferredTimeout(deferred, CONNECTION_TIMEOUT);
        var pathArray = paths;
        if (!Array.isArray(paths)) {
            pathArray = [paths];
        }

        if (autoReload) {
            Array.prototype.push.apply(this._registeredModules, pathArray);
        }

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

            this._pendingInterfaceRefreshDeferreds.push(deferred);
        } else {
            deferred.reject("this.domains.base is undefined");
        }

        return deferred.promise();
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
            var messageString = null;
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
                    this._ws.send(messageString);
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
    NodeConnection.prototype._receive = function (message) {
        var responseDeferred = null;
        var data = message.data;
        var m;

        if (message.data instanceof ArrayBuffer) {
            // The first four bytes encode the command ID as an unsigned 32-bit integer
            if (data.byteLength < 4) {
                console.error("[NodeConnection] received malformed binary message");
                return;
            }

            var header = data.slice(0, 4),
                body = data.slice(4),
                headerView = new Uint32Array(header),
                id = headerView[0];

            // Unpack the binary message into a commandResponse
            m = {
                type: "commandResponse",
                message: {
                    id: id,
                    response: body
                }
            };
        } else {
            try {
                m = JSON.parse(data);
            } catch (e) {
                console.error("[NodeConnection] received malformed message", message, e.message);
                return;
            }
        }

        switch (m.type) {
        case "event":
            if (m.message.domain === "base" && m.message.event === "newDomains") {
                this._refreshInterface();
            }

            // Event type "domain:event"
            EventDispatcher.triggerWithArray(this, m.message.domain + ":" + m.message.event,
                                             m.message.parameters);
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

    /**
     * @private
     * Helper function for refreshing the interface in the "domain" property.
     * Automatically called when the connection receives a base:newDomains
     * event from the server, and also called at connection time.
     */
    NodeConnection.prototype._refreshInterface = function () {
        var deferred = $.Deferred();
        var self = this;

        var pendingDeferreds = this._pendingInterfaceRefreshDeferreds;
        this._pendingInterfaceRefreshDeferreds = [];
        deferred.then(
            function () {
                pendingDeferreds.forEach(function (d) { d.resolve(); });
            },
            function (err) {
                pendingDeferreds.forEach(function (d) { d.reject(err); });
            }
        );

        function refreshInterfaceCallback(spec) {
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

            // TODO: Don't replace the domain object every time. Instead, merge.
            self.domains = {};
            self.domainEvents = {};
            Object.keys(spec).forEach(function (domainKey) {
                var domainSpec = spec[domainKey];
                self.domains[domainKey] = {};
                Object.keys(domainSpec.commands).forEach(function (commandKey) {
                    var commandSpec = domainSpec.commands[commandKey];
                    self.domains[domainKey][commandKey] = makeCommandFunction(domainKey, commandKey);
                });
                self.domainEvents[domainKey] = {};
                Object.keys(domainSpec.events).forEach(function (eventKey) {
                    var eventSpec = domainSpec.events[eventKey];
                    var parameters = eventSpec.parameters;
                    self.domainEvents[domainKey][eventKey] = parameters;
                });
            });
            deferred.resolve();
        }

        if (this.connected()) {
            this._tempMessageHandlers.push({
                type: "refresh-interface-callback",
                handler: () => {
                    debugger;
                }
            });            
            this._nodeProcess.send({ type: "refresh-interface" });
        } else {
            deferred.reject("Attempted to call _refreshInterface when not connected.");
        }

        return deferred.promise();
    };

    /**
     * @private
     * Get the default timeout value
     * @return {number} Timeout value in milliseconds
     */
    NodeConnection._getConnectionTimeout = function () {
        return CONNECTION_TIMEOUT;
    };

    module.exports = NodeConnection;

});
