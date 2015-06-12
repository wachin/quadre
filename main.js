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

	var FileSystem = brackets.getModule("filesystem/FileSystem")._FileSystem;
	var ProjectMangager = brackets.getModule("project/ProjectManager");
	var AppInit = brackets.getModule("utils/AppInit");
	var _oldFilter = FileSystem.prototype._indexFilter;
    
    var minimatch = require("includes/minimatch");
    var minimatch_options = {
        dot: true,
        matchBase: true,
        nocomment: true
    };
    
	function newFilter(path, name) {
		var module_id = 'jwolfe.file-tree-exclude',
			defaults = [
                'node_modules',
                'bower_components',
                '.git',
                'dist',
                'vendor'
            ],
            projectPath = ProjectMangager.getProjectRoot()._path;
    
		var PreferencesManager = brackets.getModule("preferences/PreferencesManager"),
			preferences = PreferencesManager.getExtensionPrefs(module_id);

		if (!preferences.get('list')) {
			preferences.definePreference('list', 'array', defaults);
			preferences.set('list', preferences.get('list'));
		}

		var list = preferences.get('list', preferences.CURRENT_PROJECT);

		if (!list.length) {
			return true;
		}

		path = path.substr(0, path.length - name.length).replace(projectPath, '');
        
        var path_matched, name_matched;

        list.some(function(pattern){
            path_matched = minimatch(path, pattern, minimatch_options); // A banned result was in the path
            name_matched = minimatch(name, pattern, minimatch_options); // A banned result was the name
            return path_matched || name_matched;
        });
        
        var orig_result = _oldFilter.apply(this, arguments); // A default brackets banned result

		//Did Brackets ban it? No? Then did we ban it? No? Then show it.
		var verdict = (orig_result) ? (!path_matched && !name_matched) : orig_result;

        //console.group();
        //console.log('list', list);
        //console.log('projectPath', projectPath);
        //console.log(path ? path : '[project_root]', !path_matched);
        //console.log(name, !name_matched);
        //console.log('verdict', verdict, verdict ? 'show' : 'hide');
        //console.groupEnd();

		return verdict;
	}

	AppInit.appReady(function () {
		FileSystem.prototype._indexFilter = newFilter;
		ProjectMangager.refreshFileTree();
	});
});
