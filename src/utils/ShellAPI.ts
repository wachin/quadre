/*
 * Copyright (c) 2012 - present Adobe Systems Incorporated. All rights reserved.
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
  * This is JavaScript API exposed to the native shell when Brackets is run in a native shell rather than a browser.
  */
define(function (require, exports, module) {
    "use strict";

    // Load dependent modules
    const AppInit        = require("utils/AppInit");
    const CommandManager = require("command/CommandManager");
    const Commands       = require("command/Commands");
    const electron       = (window as any).electron;

    let appReady = false; // Set to true after app is fully initialized

    /**
     * The native function BracketsShellAPI::DispatchBracketsJSCommand calls this function in order to enable
     * calling Brackets commands from the native shell.
     */
    electron.ipcRenderer.on("executeCommand", function (evt, eventName) {
        // Temporary fix for #2616 - don't execute the command if a modal dialog is open.
        // This should really be fixed with proper menu enabling.
        if ($(".modal.instance").length || !appReady) {
            // Another hack to fix issue #3219 so that all test windows are closed
            // as before the fix for #3152 has been introduced. isBracketsTestWindow
            // property is explicitly set in createTestWindowAndRun() in SpecRunnerUtils.js.
            if ((window as any).isBracketsTestWindow) {
                return false;
            }
            // Return false for all commands except file.close_window command for
            // which we have to return true (issue #3152).
            return (eventName === Commands.FILE_CLOSE_WINDOW);
        }

        const promise = CommandManager.execute(eventName);
        return (promise && promise.state() === "rejected") ? false : true;
    });

    electron.ipcRenderer.on("console-msg", function (evt, method, ...args) {
        console[method]("[shell]", ...args);
    });

    electron.ipcRenderer.on("notify", function (evt, title, message) {
        window.alert(`${title}\n\n${message}`);
    });

    AppInit.appReady(function () {
        electron.ipcRenderer.send("brackets-app-ready");
        appReady = true;
    });

});
