define(function (require, exports, module) {
	"use strict";
	var arrayUniq = require('includes/array-uniq');

	return exports = module.exports = function () {
		return arrayUniq([].concat.apply([], arguments));
	};
});