/*
 * Copyright (c) 2012 - 2017 Adobe Systems Incorporated. All rights reserved.
 * Copyright (c) 2018 - present The quadre code authors. All rights reserved.
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

/**
 * Initializes the global "brackets" variable and it's properties.
 * Modules should not access the global.brackets object until either
 * (a) the module requires this module, i.e. require("utils/Global") or
 * (b) the module receives a "appReady" callback from the utils/AppReady module.
 */

import * as configJSON from "text!config.json";
import { UrlParams } from "utils/UrlParams";
import * as ShellAPI from "utils/ShellAPI";

// Define core brackets namespace if it isn't already defined
//
// We can't simply do 'brackets = {}' to define it in the global namespace because
// we're in "use strict" mode. Most likely, 'window' will always point to the global
// object when this code is running. However, in case it isn't (e.g. if we're running
// inside Node for CI testing) we use this trick to get the global object.
const Fn = Function;
export const global = (new Fn("return this"))();
if (!global.brackets) {

    // Earlier brackets object was initialized at
    // https://github.com/adobe/brackets-shell/blob/908ed1503995c1b5ae013473c4b181a9aa64fd22/appshell/appshell_extensions.js#L945.
    // With the newer versions of CEF, the initialization was crashing the render process, citing
    // JS eval error. So moved the brackets object initialization from appshell_extensions.js to here.
    if (global.appshell) {
        global.brackets = global.appshell;
    } else {
        global.brackets = {};
    }
}

// Parse URL params
const params = new UrlParams();
params.parse();

// Parse src/config.json
try {
    global.brackets.metadata = JSON.parse(configJSON);
    global.brackets.config = global.brackets.metadata.config;
} catch (err) {
    console.log(err);
}

// Uncomment the following line to force all low level file i/o routines to complete
// asynchronously. This should only be done for testing/debugging.
// NOTE: Make sure this line is commented out again before committing!
// brackets.forceAsyncCallbacks = true;

// Load native shell when brackets is run in a native shell rather than the browser
// TODO: (issue #266) load conditionally
global.brackets.shellAPI = ShellAPI;

// Determine OS/platform
if (global.navigator.platform === "MacIntel" || global.navigator.platform === "MacPPC") {
    global.brackets.platform = "mac";
} else if (global.navigator.platform.indexOf("Linux") >= 0) {
    global.brackets.platform = "linux";
} else {
    global.brackets.platform = "win";
}

// Expose platform info for build applicability consumption
global.brackets.getPlatformInfo = function () {
    let OS = "";

    if (/Windows|Win32|WOW64|Win64/.test(window.navigator.userAgent)) {
        OS = "WIN";
    } else if (/Mac/.test(window.navigator.userAgent)) {
        OS = "OSX";
    } else if (/Linux|X11/.test(window.navigator.userAgent)) {
        OS = "LINUX32";
        if (/x86_64/.test(window.navigator.appVersion + window.navigator.userAgent)) {
            OS = "LINUX64";
        }
    }

    return OS;
};

global.brackets.inBrowser = !global.brackets.hasOwnProperty("fs");

// Are we in a desktop shell with a native menu bar?
const hasNativeMenus = params.get("hasNativeMenus");
if (hasNativeMenus) {
    global.brackets.nativeMenus = (hasNativeMenus === "true");
} else {
    global.brackets.nativeMenus = !global.brackets.inBrowser;
}

// Locale-related APIs
global.brackets.isLocaleDefault = function () {
    return !global.localStorage.getItem("locale");
};

global.brackets.getLocale = function () {
    // By default use the locale that was determined in brackets.js
    return params.get("testEnvironment") ? "en" : (global.localStorage.getItem("locale") || global.require.s.contexts._.config.locale);
};

global.brackets.setLocale = function (locale) {
    if (locale) {
        global.localStorage.setItem("locale", locale);
    } else {
        global.localStorage.removeItem("locale");
    }
};

// Create empty app namespace if running in-browser
if (!global.brackets.app) {
    global.brackets.app = {};
}

// Loading extensions requires creating new require.js contexts, which
// requires access to the global 'require' object that always gets hidden
// by the 'require' in the AMD wrapper. We store this in the brackets
// object here so that the ExtensionLoader doesn't have to have access to
// the global object.
global.brackets.libRequire = global.require;

// Also store our current require.js context (the one that loads brackets
// core modules) so that extensions can use it.
// Note: we change the name to "getModule" because this won't do exactly
// the same thing as 'require' in AMD-wrapped modules. The extension will
// only be able to load modules that have already been loaded once.
global.brackets.getModule = require;

/* API for retrieving the global RequireJS config
 * For internal use only
 */
global.brackets._getGlobalRequireJSConfig = function () {
    return global.require.s.contexts._.config;
};
