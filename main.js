/*
 * Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.
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
 */

/*global define, brackets */

define(function (require, exports, module) {
	"use strict";

	var FileSystem = brackets.getModule("filesystem/FileSystem");

	var _oldFilter = FileSystem._FileSystem.prototype._indexFilter;

	var regex = "node_modules|bower_components|/.git/|^vendor$";

	FileSystem._FileSystem.prototype._indexFilter = function (path, name) {
		// Call old filter
		var result = _oldFilter.apply(this, arguments);

		if (!result) {
			return false;
		}

		var path_matched = path.match(regex);
		var name_matched = name.match(regex);

//		console.group();
//		console.log(path, !path_matched);
//		console.log(name, !name_matched);
//		console.log('verdict', (!path_matched && !name_matched) ? 'show' : 'hide');
//		console.groupEnd();

		return !path_matched && !name_matched;
	};
});
