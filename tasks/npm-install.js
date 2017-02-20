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

/* eslint-env node */

"use strict";

module.exports = function (grunt) {

    var _       = require("lodash"),
        common  = require("./lib/common")(grunt),
        build   = require("./build")(grunt),
        glob    = require("glob"),
        path    = require("path"),
        exec    = require("child_process").exec,
        _spawn  = require("child_process").spawn;
    
    function spawn(what, args, options, callback) {
        var child = _spawn(what, args, options);
        child.on("error", function (err) {
            return callback(err, null, err.toString());
        });
        var stdout = [];
        child.stdout.addListener("data", function (buffer) {
            stdout.push(buffer);
        });
        var stderr = [];
        child.stderr.addListener("data", function (buffer) {
            stderr.push(buffer);
        });
        var exitCode;
        child.addListener("exit", function (code) {
            exitCode = code;
        });
        child.addListener("close", function () {
            stderr = Buffer.concat(stderr);
            stdout = Buffer.concat(stdout);
            return callback(exitCode > 0 ? new Error(stderr) : null, stdout, stderr);
        });
        child.stdin.end();
    }
    
    function runNpmInstall(where, callback) {
        grunt.log.writeln("running npm install --production in " + where);
        exec('npm install --production', { cwd: './' + where }, function (err, stdout, stderr) {
            if (err) {
                grunt.log.error(stderr);
                return callback(stderr);
            }
            if (stdout) { grunt.log.writeln(stdout); }
            grunt.log.writeln("finished npm install --production in " + where);
            if (!stdout) {
                // nothing done by npm, skip electron-rebuild
                grunt.log.writeln("skipping electron-rebuild in " + where);
                return callback(null);
            }
            var npmRebuildPath = path.resolve(
                __dirname,
                '..',
                'node_modules',
                '.bin',
                process.platform === 'win32' ? 'electron-rebuild.cmd' : 'electron-rebuild'
            );
            var args = [
                "-m=" + path.resolve(__dirname, '..', where)
            ];
            grunt.log.writeln("running electron-rebuild " + args.join(" "));
            spawn(npmRebuildPath, args, { cwd: './' + where }, function (err, stdout, stderr) {
                if (err) {
                    if (stderr) {
                        grunt.log.error(stderr);
                    } else {
                        grunt.log.error(err);
                    }
                    grunt.log.writeln("failed electron-rebuild in " + where);
                    return callback(err);
                }
                if (stdout) { grunt.log.writeln(stdout); }
                grunt.log.writeln("finished electron-rebuild in " + where);
                callback(null);
            });
        });
    }

    grunt.registerTask("npm-install-dist", "Install node_modules to the dist folder so it gets bundled with release", function () {
        /*
        try {
            const npmShrinkwrapJSON = grunt.file.readJSON("src/npm-shrinkwrap.json");
            common.writeJSON(grunt, "dist/npm-shrinkwrap.json", npmShrinkwrapJSON);
        } catch (err) {
            grunt.log.error(err);
        }
        */

        const packageJSON = grunt.file.readJSON("package.json");
        const appJson = _.pick(packageJSON, [
            'name',
            'productName',
            'description',
            'author',
            'license',
            'homepage',
            'version',
            'apiVersion',
            'issues',
            'repository',
            'dependencies',
            'optionalDependencies'
        ]);

        common.writeJSON(grunt, "dist/package.json", appJson);

        var done = this.async();
        runNpmInstall("dist", function (err) {
            if (err) {
                return done(false);
            }

            // dist/www/node_modules
            const packageJSONSrc = grunt.file.readJSON("src/package.json");
            appJson.dependencies = {};
            for (var key in packageJSONSrc.dependencies) {
                appJson.dependencies[key] = packageJSONSrc.dependencies[key];
            }
            common.writeJSON(grunt, "dist/www/package.json", appJson);

            runNpmInstall("dist/www", function (err) {
                return err ? done(false) : done();
            });
        });
    });

    grunt.registerTask("npm-install-src", "Install node_modules to the src folder", function () {
        var done = this.async();
        runNpmInstall("src", function (err) {

        });
    });
    
    function npmInstallExtensions(globs) {
        var doneWithTask = this.async();
        var globs = [
            "dist/www/+(extensibility|extensions|LiveDevelopment)/**/package.json"
        ];
        var result;
        var doneWithGlob = _.after(globs.length, () => {
            doneWithTask(result);
        });
        globs.forEach(g => {
            glob(g, function (err, files) {
                if (err) {
                    grunt.log.error(err);
                    result = false;
                    return doneWithGlob();
                }
                files = files.filter(function (path) {
                    return path.indexOf("node_modules") === -1;
                });
                var doneWithFile = _.after(files.length, doneWithGlob);
                files.forEach(function (file) {
                    runNpmInstall(path.dirname(file), function (err) {
                        if (err) {
                            result = false;
                        }
                        return doneWithFile();
                    });
                });
            });
        });
    }

    grunt.registerTask("npm-install-extensions-src", "Install node_modules for default extensions which have package.json defined", function () {
        var globs = [
            "src/www/+(extensibility|extensions|LiveDevelopment)/**/package.json"
        ];
        return npmInstallExtensions.call(this, globs);
    });

    grunt.registerTask("npm-install-extensions-dist", "Install node_modules for default extensions which have package.json defined", function () {
        var globs = [
            "dist/www/+(extensibility|extensions|LiveDevelopment)/**/package.json"
        ];
        return npmInstallExtensions.call(this, globs);
    });

};
