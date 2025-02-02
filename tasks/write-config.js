/*
 * Copyright (c) 2013 - 2017 Adobe Systems Incorporated. All rights reserved.
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

"use strict";

const gulp = require("gulp");
const log = require("fancy-log");
const PluginError = require("plugin-error");
const common = require("./lib/common");
const file = require("./lib/file");
const gitInfo = require("./lib/git-info");

function doWriteConfig(name, cb) {
    const appConfigJSON = file.readJSON("src/brackets.config.json");
    const appConfigEnvJSON = file.readJSON("src/brackets.config." + name + ".json");
    for (const key in appConfigEnvJSON) {
        if (appConfigEnvJSON.hasOwnProperty(key)) {
            appConfigJSON.config[key] = appConfigEnvJSON[key];
        }
    }

    const packageJSON = file.readJSON("package.json");
    Object.keys(packageJSON).forEach(function (key) {
        if (appConfigJSON[key] === undefined) {
            appConfigJSON[key] = packageJSON[key];
        }
    });
    common.writeJSON("src/config.json", appConfigJSON);
    cb();
}

function writeConfig(cb) {
    doWriteConfig("dev", cb);
}
writeConfig.description = "Merge package.json and src/brackets.config.json into src/config.json";
writeConfig.displayName = "write-config";

gulp.task(writeConfig);


function writeConfigDist(cb) {
    doWriteConfig("dist", cb);
}
writeConfigDist.description = "Merge package.json and src/brackets.config.json into src/config.json";
writeConfigDist.displayName = "write-config:dist";

gulp.task(writeConfigDist);


function writeConfigPrerelease(cb) {
    doWriteConfig("prerelease", cb);
}
writeConfigPrerelease.description = "Merge package.json and src/brackets.config.json into src/config.json";
writeConfigPrerelease.displayName = "write-config:prerelease";

gulp.task(writeConfigPrerelease);


function buildConfig(cb) {
    const distConfig = file.readJSON("src/config.json");

    gitInfo.getGitInfo(process.cwd()).then(function (info) {
        distConfig.buildnumber = info.commits;
        // distConfig.version = distConfig.version.substr(0, distConfig.version.lastIndexOf("-") + 1) + info.commits;
        distConfig.repository.SHA = info.sha;
        distConfig.repository.branch = info.branch;
        distConfig.config.build_timestamp = new Date().toString().split("(")[0].trim();
        common.writeJSON("dist/www/config.json", distConfig);
        cb();
    }, function (err) {
        log.error(err);
        const errPlugin = new PluginError("build-config", err, { showStack: true });
        cb(errPlugin);
    });
}
buildConfig.description = "Update config.json with the build timestamp, branch and SHA being built";

gulp.task("build-config", buildConfig);
