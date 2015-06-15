/*jshint globalstrict:true, node:true*/

"use strict";

var _ = require("lodash");
var remote = require("remote");
var app = _.extend({}, require("./app"), remote.require("./appshell/app-menu"));
var fs = _.extend({}, require("fs-extra"), require("./fs-additions"));

// prevent using this alias, rather use .remove
delete fs.delete;

// make sure extensions folder exists
fs.ensureDir(app.getExtensionsFolder());

module.exports = {
    app: app,
    fs: fs
};
