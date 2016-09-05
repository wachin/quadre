/* eslint-env node */

import DomainManager from "./domain-manager";

/**
 * @private
 * @type {DomainManager}
 * DomainManager provided at initialization time
 */
let _domainManager: typeof DomainManager | null = null;

/**
 * @private
 * Implementation of base.loadDomainModulesFromPaths
 * @param {Array.<string>} paths Paths to load
 * @return {boolean} Whether the load succeeded
 */
function cmdLoadDomainModulesFromPaths(paths: string[]): boolean {
    if (_domainManager) {
        return _domainManager.loadDomainModulesFromPaths(paths);
    } else {
        return false;
    }
}

/**
 *
 * Registers commands with the DomainManager
 * @param {DomainManager} domainManager The DomainManager to use
 */
function init(domainManager: typeof DomainManager) {
    _domainManager = domainManager;

    _domainManager.registerDomain("base", {major: 0, minor: 1});
    _domainManager.registerCommand(
        "base",
        "loadDomainModulesFromPaths",
        cmdLoadDomainModulesFromPaths,
        false,
        "Attempt to load command modules from the given paths. " +
            "The paths should be absolute.",
        [{name: "paths", type: "array<string>"}],
        [{name: "success", type: "boolean"}]
    );

    _domainManager.registerEvent(
        "base",
        "log",
        [{name: "level", type: "string"},
            {name: "timestamp", type: "Date"},
            {name: "message", type: "string"}]
    );

    _domainManager.registerEvent("base", "newDomains", []);
}

exports.init = init;
