/*
 * Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the 'Software'),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

/*global define, brackets */

define( function ( require, exports, module ) {
    'use strict';

    // Get our Brackets modules
    var FileSystem = brackets.getModule( 'filesystem/FileSystem' )._FileSystem;
    var ProjectMangager = brackets.getModule( 'project/ProjectManager' );
    var PreferencesManager = brackets.getModule( 'preferences/PreferencesManager' );
    var AppInit = brackets.getModule( 'utils/AppInit' );
    var _oldFilter = FileSystem.prototype._indexFilter;
    var _matched_files = [];
    var _unmatched_files = [];

    // Load up our Modules
    var extendFilter = require( 'includes/extend-filter' );
    var matched = require( 'includes/matched' );
    var flatten = require( 'includes/flatten' );

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
    var preferences = PreferencesManager.getExtensionPrefs( module_id );

    // If there aren't any preferences, assign the default values
    if ( !preferences.get( 'list' ) ) {
        preferences.definePreference( 'list', 'array', defaults );
        preferences.set( 'list', preferences.get( 'list' ) );
    }

    // Our new filter
    function new_filter( path, name ) {
        var not_in_our_filter = _matched_files.indexOf( path ) === -1;
        return not_in_our_filter ? _oldFilter.apply( this, arguments ) : not_in_our_filter;
    }

    // Use the custom filter when Brackets is done loading
    AppInit.appReady( function () {
        // Get all files in an array
        ProjectMangager.getAllFiles().then( function ( files ) {
            // Grab our preferences
            var list = preferences.get( 'list', preferences.CURRENT_PROJECT );

            // No exclusions? Quit early.
            if ( !list.length ) {
                return false;
            }

            // Extend the list with wildcards
            list = extendFilter( list );

            // Get the project info
            var projectRoot = ProjectMangager.getProjectRoot();
            var projectPath = projectRoot.fullPath;

            // Loop over the files and see if we need to filter them
            files.forEach( function ( file ) {
                // Make path relative to project
                var relative_path = file.fullPath.replace( projectPath, '' );
                var result = matched( relative_path, list ); // A banned result was in the path

                if ( result ) {
                    _matched_files.push( file.fullPath );
                } else {
                    _unmatched_files.push( file.fullPath );
                }
            } );

            // Apply a fix for Bracket's dumb filesystem handling
            _matched_files = flatten( _matched_files, _unmatched_files );
            // console.log( 'flattened', _matched_files );
            // console.log( '_unmatched_files', _unmatched_files );

            // Our filter is now the file filter
            FileSystem.prototype._indexFilter = new_filter;

            // Refresh the project to re-check the file filter
            ProjectMangager.refreshFileTree();
        } );
    } );
} );
