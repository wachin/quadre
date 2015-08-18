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

	// Get our Brackets modules
	var ProjectMangager = brackets.getModule("project/ProjectManager");
	var PreferencesManager = brackets.getModule("preferences/PreferencesManager");
	var AppInit = brackets.getModule("utils/AppInit");

	// Load up Multimatch
	var multimatch = require("includes/multimatch");

	// Preference Stuff
	var module_id = 'jwolfe.file-tree-exclude',
		defaults = [
                'node_modules',
                'bower_components',
                '.git',
                'dist',
                'vendor'
            ];

	// Get the preferences for this extension
	var preferences = PreferencesManager.getExtensionPrefs(module_id);

	// If there aren't any preferences, assign the default values
	if (!preferences.get('list')) {
		preferences.definePreference('list', 'array', defaults);
		preferences.set('list', preferences.get('list'));
	}

	// Define the new filter
	function filter_files(list, file) {

		var projectRoot = ProjectMangager.getProjectRoot();
		var projectPath = projectRoot.fullPath;

		// prep show - default to showing the file
		var show = true;

		// No exclusions? Quit early.
		if (!list.length) {
			return show;
		}

		// Make path relative to project
		var relative_path = file.fullPath.replace(projectPath, '');
		var matched = multimatch(relative_path, list); // A banned result was in the path

		if (matched.length) {
			show = false; // we banned it
		}

		// Debug info
		console.group();
		console.log('projectPath', projectPath);
		console.log(relative_path ? relative_path : '[project_root]', matched);
		console.log('show', show ? 'show' : 'hide');
		console.groupEnd();

		return show;
	}

	// Use the custom filter when Brackets is done loading
	AppInit.appReady(function () {
		ProjectMangager.getAllFiles().then(function (files) {
			var list = preferences.get('list', preferences.CURRENT_PROJECT);

			console.log('list', list);
			console.log('files', files);

			files.forEach(function (file) {
				filter_files(list, file);
			});
		});

		ProjectMangager.refreshFileTree();
	});
});