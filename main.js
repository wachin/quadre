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

	var FileSystem = brackets.getModule("filesystem/FileSystem"),
		_oldFilter = FileSystem._FileSystem.prototype._indexFilter,
		regex = "node_modules|bower_components|/.git/|^dist$|^vendor$";

	FileSystem._FileSystem.prototype._indexFilter = function (path, name) {

		var path_matched = path.match(regex), // A banned result was in the path
			name_matched = name.match(regex), // A banned result was the name
			orig_result = _oldFilter.apply(this, arguments), // A default brackets banned result
			verdict = (orig_result) ? (!path_matched && !name_matched) : orig_result;
					// Did Brackets ban it? No? Then did we ban it? No? Then show it.

		console.group();
		console.log(path, !path_matched);
		console.log(name, !name_matched);
		console.log('verdict', verdict ? 'show' : 'hide');
		console.groupEnd();

		return verdict;
	};
});
