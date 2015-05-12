/*jshint globalstrict:true, node:true*/

"use strict";

var _ = require("lodash");
var remote = require("remote");
var app = _.extend({}, require("./app"), remote.require(require.resolve("./app-menu")));
var fs = _.extend({}, require("fs-extra"), require("./fs-additions"));

// prevent using this alias, rather use .remove
delete fs.delete;

module.exports = {
    app: app,
    fs: fs
};
