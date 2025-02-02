/*
 * Copyright (c) 2012 - 2017 Adobe Systems Incorporated. All rights reserved.
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

/**
 * ProjectManager glues together the project model and file tree view and integrates as needed with other parts
 * of Brackets. It is responsible for creating and updating the project tree when projects are opened
 * and when changes occur to the file tree.
 *
 * This module dispatches these events:
 *    - beforeProjectClose -- before `_projectRoot` changes, but working set files still open
 *    - projectClose       -- *just* before `_projectRoot` changes; working set already cleared
 *      & project root unwatched
 *    - beforeAppClose     -- before Brackets quits entirely
 *    - projectOpen        -- after `_projectRoot` changes and the tree is re-rendered
 *    - projectRefresh     -- when project tree is re-rendered for a reason other than
 *      a project being opened (e.g. from the Refresh command)
 *
 * To listen for events, do something like this: (see EventDispatcher for details on this pattern)
 *    ProjectManager.on("eventname", handler);
 */

import "utils/Global";

import * as _ from "lodash";

// Load dependent modules
import * as AppInit from "utils/AppInit";
import * as Async from "utils/Async";
import * as PreferencesDialogs from "preferences/PreferencesDialogs";
import * as PreferencesManager from "preferences/PreferencesManager";
import * as DocumentManager from "document/DocumentManager";
import * as MainViewManager from "view/MainViewManager";
import * as CommandManager from "command/CommandManager";
import * as Commands from "command/Commands";
import * as Dialogs from "widgets/Dialogs";
import * as DefaultDialogs from "widgets/DefaultDialogs";
import * as EventDispatcher from "utils/EventDispatcher";
import * as LanguageManager from "language/LanguageManager";
import * as Menus from "command/Menus";
import * as StringUtils from "utils/StringUtils";
import * as Strings from "strings";
import * as FileSystem from "filesystem/FileSystem";
import * as FileViewController from "project/FileViewController";
import * as PerfUtils from "utils/PerfUtils";
import * as FileUtils from "file/FileUtils";
import FileSystemError = require("filesystem/FileSystemError");
import * as Urls from "i18n!nls/urls";
import * as FileSyncManager from "project/FileSyncManager";
import * as ProjectModel from "project/ProjectModel";
import * as FileTreeView from "project/FileTreeView";
import * as ViewUtils from "utils/ViewUtils";
import File = require("filesystem/File");

// Needed to ensure that menus are set up when we need them.
// See #10115
import "command/DefaultMenus";

/**
 * @private
 * Filename to use for project settings files.
 * @type {string}
 */
const SETTINGS_FILENAME = "." + PreferencesManager.SETTINGS_FILENAME;

/**
 * Name of the preferences for sorting directories first
 *
 * @type {string}
 */
const SORT_DIRECTORIES_FIRST = "sortDirectoriesFirst";

/**
 * @const
 * @private
 * Error context to show the correct error message
 * @type {int}
 */
const ERR_TYPE_CREATE                 = 1;
const ERR_TYPE_CREATE_EXISTS          = 2;
const ERR_TYPE_RENAME                 = 3;
const ERR_TYPE_DELETE                 = 4;
const ERR_TYPE_LOADING_PROJECT        = 5;
const ERR_TYPE_LOADING_PROJECT_NATIVE = 6;
const ERR_TYPE_MAX_FILES              = 7;
const ERR_TYPE_OPEN_DIALOG            = 8;
const ERR_TYPE_INVALID_FILENAME       = 9;
const ERR_TYPE_MOVE                   = 10;

/**
 * @private
 * Reference to the tree control container div. Initialized by
 * htmlReady handler
 * @type {jQueryObject}
 */
let $projectTreeContainer;

/**
 * @private
 *
 * Reference to the container of the React component. Everything in this
 * node is managed by React.
 * @type {Element}
 */
let fileTreeViewContainer;

/**
 * @private
 *
 * Does the file tree currently have the focus?
 *
 * @return {boolean} `true` if the file tree has the focus
 */
function _hasFileSelectionFocus() {
    return FileViewController.getFileSelectionFocus() === FileViewController.PROJECT_MANAGER;
}

/**
 * @private
 * Singleton ProjectModel object.
 * @type {ProjectModel.ProjectModel}
 */
const model = new ProjectModel.ProjectModel({
    focused: _hasFileSelectionFocus()
});

/**
 * @private
 * @type {boolean}
 * A flag to remember when user has been warned about too many files, so they
 * are only warned once per project/session.
 */
let _projectWarnedForTooManyFiles = false;

/**
 * @private
 *
 * Event handler which displays an error based on a problem creating a file.
 *
 * @param {$.Event} e jQuery event object
 * @param {{type:any,isFolder:boolean}} errorInfo Information passed in the error events
 */
function _displayCreationError(e, errorInfo) {
    window.setTimeout(function () {
        const error = errorInfo.type;
        const isFolder = errorInfo.isFolder;
        const name = errorInfo.name;

        if (error === FileSystemError.ALREADY_EXISTS) {
            _showErrorDialog(ERR_TYPE_CREATE_EXISTS, isFolder, null, name);
        } else if (error === ProjectModel.ERROR_INVALID_FILENAME) {
            _showErrorDialog(ERR_TYPE_INVALID_FILENAME, isFolder, ProjectModel._invalidChars);
        } else {
            const errString = error === FileSystemError.NOT_WRITABLE
                ? Strings.NO_MODIFICATION_ALLOWED_ERR
                : StringUtils.format(Strings.GENERIC_ERROR, error);

            _showErrorDialog(ERR_TYPE_CREATE, isFolder, errString, name)!.getPromise();
        }
    }, 10);
}

/**
 * @private
 *
 * Reverts to the previous selection (useful if there's an error).
 *
 * @param {string|File} previousPath The previously selected path.
 * @param {boolean} switchToWorkingSet True if we need to switch focus to the Working Set
 */
function _revertSelection(previousPath, switchToWorkingSet) {
    model.setSelected(previousPath);
    if (switchToWorkingSet) {
        FileViewController.setFileViewFocus(FileViewController.WORKING_SET_VIEW);
    }
}

/**
 * @constructor
 * @private
 *
 * Manages the interaction between the view and the model. This is loosely structured in
 * the style of [Flux](https://github.com/facebook/flux), but the initial implementation did
 * not need all of the parts of Flux yet. This ActionCreator could be replaced later with
 * a real ActionCreator that talks to a Dispatcher.
 *
 * Most of the methods just delegate to the ProjectModel. Some are responsible for integration
 * with other parts of Brackets.
 *
 * @param {ProjectModel} model store (in Flux terminology) with the project data
 */
class ActionCreator {
    private model: ProjectModel.ProjectModel;

    constructor(model) {
        this.model = model;
        this._bindEvents();
    }

    /**
     * @private
     *
     * Listen to events on the ProjectModel and cause the appropriate behavior within the rest of the system.
     */
    private _bindEvents() {
        // Change events are the standard Flux signal to rerender the view. Note that
        // current Flux style is to have the view itself listen to the Store for change events
        // and re-render itself.
        (this.model as unknown as EventDispatcher.DispatcherEvents).on(ProjectModel.EVENT_CHANGE, function () {
            _renderTree();
        });

        // The "should select" event signals that we need to open the document based on file tree
        // activity.
        (this.model as unknown as EventDispatcher.DispatcherEvents).on(ProjectModel.EVENT_SHOULD_SELECT, function (e, data) {
            if (data.add) {
                FileViewController.openFileAndAddToWorkingSet(data.path).fail(_.partial(_revertSelection, data.previousPath, !data.hadFocus));
            } else {
                FileViewController.openAndSelectDocument(data.path, FileViewController.PROJECT_MANAGER).fail(_.partial(_revertSelection, data.previousPath, !data.hadFocus));
            }
        });

        (this.model as unknown as EventDispatcher.DispatcherEvents).on(ProjectModel.EVENT_SHOULD_FOCUS, function () {
            FileViewController.setFileViewFocus(FileViewController.PROJECT_MANAGER);
        });

        (this.model as unknown as EventDispatcher.DispatcherEvents).on(ProjectModel.ERROR_CREATION, _displayCreationError);
    }

    /**
     * Sets the directory at the given path to open in the tree and saves the open nodes to view state.
     *
     * See `ProjectModel.setDirectoryOpen`
     */
    public setDirectoryOpen(path, open) {
        this.model.setDirectoryOpen(path, open).then(_saveTreeState);
    }

    /**
     * See `ProjectModel.setSelected`
     */
    public setSelected(path, doNotOpen?) {
        this.model.setSelected(path, doNotOpen);
    }

    /**
     * See `ProjectModel.selectInWorkingSet`
     */
    public selectInWorkingSet(path) {
        this.model.selectInWorkingSet(path);
    }

    /**
     * See `FileViewController.openWithExternalApplication`
     */
    public openWithExternalApplication(path) {
        FileViewController.openWithExternalApplication(path);
    }

    /**
     * See `ProjectModel.setContext`
     */
    public setContext(path) {
        this.model.setContext(path);
    }

    /**
     * See `ProjectModel.restoreContext`
     */
    public restoreContext() {
        this.model.restoreContext();
    }

    /**
     * See `ProjectModel.startRename`
     */
    public startRename(path, isMoved) {
        // This is very not Flux-like, which is a sign that Flux may not be the
        // right choice here *or* that this architecture needs to evolve subtly
        // in how errors are reported (more like the create case).
        // See #9284.
        renameItemInline(path, isMoved);
    }

    /**
     * See `ProjectModel.setRenameValue`
     */
    public setRenameValue(path) {
        this.model.setRenameValue(path);
    }

    /**
     * See `ProjectModel.cancelRename`
     */
    public cancelRename() {
        this.model.cancelRename();
    }

    /**
     * See `ProjectModel.performRename`
     */
    public performRename() {
        return this.model.performRename();
    }

    /**
     * See `ProjectModel.startCreating`
     */
    public startCreating(basedir, newName, isFolder) {
        return this.model.startCreating(basedir, newName, isFolder);
    }

    /**
     * See `ProjectModel.setSortDirectoriesFirst`
     */
    public setSortDirectoriesFirst(sortDirectoriesFirst) {
        this.model.setSortDirectoriesFirst(sortDirectoriesFirst);
    }

    /**
     * See `ProjectModel.setFocused`
     */
    public setFocused(focused) {
        this.model.setFocused(focused);
    }

    /**
     * See `ProjectModel.setCurrentFile`
     */
    public setCurrentFile(curFile) {
        this.model.setCurrentFile(curFile);
    }

    /**
     * See `ProjectModel.toggleSubdirectories`
     */
    public toggleSubdirectories(path, openOrClose) {
        this.model.toggleSubdirectories(path, openOrClose).then(_saveTreeState);
    }

    /**
     * See `ProjectModel.closeSubtree`
     */
    public closeSubtree(path) {
        this.model.closeSubtree(path);
        _saveTreeState();
    }

    public dragItem(path) {
        // Close open menus on drag and clear the context, but only if there's a menu open.
        if ($(".dropdown.open").length > 0) {
            Menus.closeAll();
            this.setContext(null);
        }

        // Close directory, if dragged item is directory
        if (_.last(path) === "/") {
            this.setDirectoryOpen(path, false);
        }
    }

    /**
     * Moves the item in the oldPath to the newDirectory directory
     */
    public moveItem(oldPath, newDirectory) {
        const fileName = FileUtils.getBaseName(oldPath);
        let newPath = newDirectory + fileName;

        // If item dropped onto itself or onto its parent directory, return
        if (oldPath === newDirectory || FileUtils.getParentPath(oldPath) === newDirectory) {
            return;
        }

        // Add trailing slash if directory is moved
        if (_.last(oldPath) === "/") {
            newPath = ProjectModel._ensureTrailingSlash(newPath);
        }

        this.startRename(oldPath, true);
        this.setRenameValue(newPath);

        this.performRename();
        this.setDirectoryOpen(newDirectory, true);
    }

    /**
     * See `ProjectModel.refresh`
     */
    public refresh() {
        this.model.refresh();
    }
}

/**
 * @private
 * @type {ActionCreator}
 *
 * Singleton actionCreator that is used for dispatching changes to the ProjectModel.
 *
 * Private API helpful in testing
 */
export const _actionCreator = new ActionCreator(model);

/**
 * Returns the File or Directory corresponding to the item that was right-clicked on in the file tree menu.
 * @return {?(File|Directory)}
 */
export function getFileTreeContext() {
    const selectedEntry = model.getContext();
    return selectedEntry;
}

/**
 * Returns the File or Directory corresponding to the item selected in the sidebar panel, whether in
 * the file tree OR in the working set; or null if no item is selected anywhere in the sidebar.
 * May NOT be identical to the current Document - a folder may be selected in the sidebar, or the sidebar may not
 * have the current document visible in the tree & working set.
 * @return {?(File|Directory)}
 */
export function getSelectedItem() {
    // Prefer file tree context, then file tree selection, else use working set
    let selectedEntry = getFileTreeContext();
    if (!selectedEntry) {
        selectedEntry = model.getSelected();
    }
    if (!selectedEntry) {
        selectedEntry = MainViewManager.getCurrentlyViewedFile();
    }
    return selectedEntry;
}

/**
 * @private
 *
 * Handler for changes in the focus between working set and file tree view.
 */
function _fileViewControllerChange() {
    _actionCreator.setFocused(_hasFileSelectionFocus());
    _renderTree();
}

/**
 * @private
 *
 * Handler for changes in document selection.
 */
function _documentSelectionFocusChange() {
    const curFullPath = MainViewManager.getCurrentlyViewedPath(MainViewManager.ACTIVE_PANE);
    if (curFullPath && _hasFileSelectionFocus()) {
        _actionCreator.setSelected(curFullPath, true);
    } else {
        _actionCreator.setSelected(null);
    }
    _fileViewControllerChange();
}

/**
 * @private
 *
 * Handler for changes to which file is currently viewed.
 *
 * @param {Object} e jQuery event object
 * @param {File} curFile Currently viewed file.
 */
function _currentFileChange(e, curFile) {
    _actionCreator.setCurrentFile(curFile);
}

/**
 * @private
 *
 * Creates a context object for doing project view state lookups.
 */
function _getProjectViewStateContext() {
    return { location : { scope: "user",
        layer: "project",
        layerID: model.projectRoot!.fullPath } };
}

/**
 * Returns the encoded Base URL of the currently loaded project, or empty string if no project
 * is open (during startup, or running outside of app shell).
 * @return {String}
 */
export function getBaseUrl() {
    return model.getBaseUrl();
}

/**
 * Sets the encoded Base URL of the currently loaded project.
 * @param {String}
 */
export function setBaseUrl(projectBaseUrl) {
    const context = _getProjectViewStateContext();

    projectBaseUrl = model.setBaseUrl(projectBaseUrl);

    PreferencesManager.setViewState("project.baseUrl", projectBaseUrl, context);
}

/**
 * Returns true if absPath lies within the project, false otherwise.
 * Does not support paths containing ".."
 * @param {string|FileSystemEntry} absPathOrEntry
 * @return {boolean}
 */
export function isWithinProject(absPathOrEntry) {
    return model.isWithinProject(absPathOrEntry);
}

/**
 * If absPath lies within the project, returns a project-relative path. Else returns absPath
 * unmodified.
 * Does not support paths containing ".."
 * @param {!string} absPath
 * @return {!string}
 */
export function makeProjectRelativeIfPossible(absPath) {
    return model.makeProjectRelativeIfPossible(absPath);
}

/**
 * Returns the root folder of the currently loaded project, or null if no project is open (during
 * startup, or running outside of app shell).
 * @return {Directory}
 */
export function getProjectRoot() {
    return model.projectRoot;
}

/**
 * @private
 *
 * Sets the project root to the given directory, resetting the ProjectModel and file tree in the process.
 *
 * @param {Directory} rootEntry directory object for the project root
 * @return {$.Promise} resolved when the project is done setting up
 */
function _setProjectRoot(rootEntry) {
    const d = $.Deferred();
    model.setProjectRoot(rootEntry).then(function () {
        d.resolve();
        model.reopenNodes(PreferencesManager.getViewState("project.treeState", _getProjectViewStateContext()));
    });
    return d.promise();
}

/**
 * @private
 *
 * Saves the project path.
 */
const _saveProjectPath = function () {
    // save the current project
    PreferencesManager.setViewState("projectPath", model.projectRoot!.fullPath);
};

/**
 * @private
 * Save tree state.
 */
const _saveTreeState = function () {
    const context = _getProjectViewStateContext();
    const openNodes = model.getOpenNodes();

    // Store the open nodes by their full path and persist to storage
    PreferencesManager.setViewState("project.treeState", openNodes, context);
};

/**
 * @private
 *
 * Displays an error dialog for problems when working with files in the file tree.
 *
 * @param {number} errType type of error that occurred
 * @param {boolean} isFolder did the error occur because of a folder operation?
 * @param {string} error message with detail about the error
 * @param {string} path path to file or folder that had the error
 * @return {Dialog|null} Dialog if the error message was created
 */
const _showErrorDialog = function (errType, isFolder?, error?, path?) {
    const titleType = isFolder ? Strings.DIRECTORY_TITLE : Strings.FILE_TITLE;
    const entryType = isFolder ? Strings.DIRECTORY : Strings.FILE;
    let title;
    let message;
    path = StringUtils.breakableUrl(path);

    switch (errType) {
        case ERR_TYPE_CREATE:
            title = StringUtils.format(Strings.ERROR_CREATING_FILE_TITLE, titleType);
            message = StringUtils.format(Strings.ERROR_CREATING_FILE, entryType, path, error);
            break;
        case ERR_TYPE_CREATE_EXISTS:
            title = StringUtils.format(Strings.INVALID_FILENAME_TITLE, titleType);
            message = StringUtils.format(Strings.ENTRY_WITH_SAME_NAME_EXISTS, path);
            break;
        case ERR_TYPE_RENAME:
            title = StringUtils.format(Strings.ERROR_RENAMING_FILE_TITLE, titleType);
            message = StringUtils.format(Strings.ERROR_RENAMING_FILE, path, error, entryType);
            break;
        case ERR_TYPE_MOVE:
            title = StringUtils.format(Strings.ERROR_MOVING_FILE_TITLE, titleType);
            message = StringUtils.format(Strings.ERROR_MOVING_FILE, path, error, entryType);
            break;
        case ERR_TYPE_DELETE:
            title = StringUtils.format(Strings.ERROR_DELETING_FILE_TITLE, titleType);
            message = StringUtils.format(Strings.ERROR_DELETING_FILE, path, error, entryType);
            break;
        case ERR_TYPE_LOADING_PROJECT:
            title = Strings.ERROR_LOADING_PROJECT;
            message = StringUtils.format(Strings.READ_DIRECTORY_ENTRIES_ERROR, path, error);
            break;
        case ERR_TYPE_LOADING_PROJECT_NATIVE:
            title = Strings.ERROR_LOADING_PROJECT;
            message = StringUtils.format(Strings.REQUEST_NATIVE_FILE_SYSTEM_ERROR, path, error);
            break;
        case ERR_TYPE_MAX_FILES:
            title = Strings.ERROR_MAX_FILES_TITLE;
            message = Strings.ERROR_MAX_FILES;
            break;
        case ERR_TYPE_OPEN_DIALOG:
            title = Strings.ERROR_LOADING_PROJECT;
            message = StringUtils.format(Strings.OPEN_DIALOG_ERROR, error);
            break;
        case ERR_TYPE_INVALID_FILENAME:
            title = StringUtils.format(Strings.INVALID_FILENAME_TITLE, isFolder ? Strings.DIRECTORY_NAME : Strings.FILENAME);
            message = StringUtils.format(Strings.INVALID_FILENAME_MESSAGE, isFolder ? Strings.DIRECTORY_NAMES_LEDE : Strings.FILENAMES_LEDE, error);
            break;
    }

    if (title && message) {
        return Dialogs.showModalDialog(
            DefaultDialogs.DIALOG_ID_ERROR,
            title,
            message
        );
    }
    return null;
};

export const _RENDER_DEBOUNCE_TIME = 100;

/**
 * @private
 *
 * Rerender the file tree view.
 *
 * @param {boolean} forceRender Force the tree to rerender. Should only be needed by extensions that call rerenderTree.
 */
const _renderTreeSync = function (forceRender?) {
    const projectRoot = getProjectRoot();
    if (!projectRoot) {
        return;
    }
    model.setScrollerInfo($projectTreeContainer[0].scrollWidth, $projectTreeContainer.scrollTop(), $projectTreeContainer.scrollLeft(), $projectTreeContainer.offset().top);
    FileTreeView.render(fileTreeViewContainer, model._viewModel, projectRoot, _actionCreator, forceRender, brackets.platform);
};

const _renderTree = _.debounce(_renderTreeSync, _RENDER_DEBOUNCE_TIME);

/**
 * @private
 *
 * Returns the full path to the welcome project, which we open on first launch.
 *
 * @param {string} sampleUrl URL for getting started project
 * @param {string} initialPath Path to Brackets directory (see FileUtils.getNativeBracketsDirectoryPath())
 * @return {!string} fullPath reference
 */
function _getWelcomeProjectPath(): string {
    return ProjectModel._getWelcomeProjectPath(Urls.GETTING_STARTED, FileUtils.getNativeBracketsDirectoryPath());
}

/**
 * Adds the path to the list of welcome projects we've ever seen, if not on the list already.
 *
 * @param {string} path Path to possibly add
 */
function addWelcomeProjectPath(path) {
    const welcomeProjects = ProjectModel._addWelcomeProjectPath(path,
        PreferencesManager.getViewState("welcomeProjects"));
    PreferencesManager.setViewState("welcomeProjects", welcomeProjects);
}


/**
 * Returns true if the given path is the same as one of the welcome projects we've previously opened,
 * or the one for the current build.
 *
 * @param {string} path Path to check to see if it's a welcome project path
 * @return {boolean} true if this is a welcome project path
 */
export function isWelcomeProjectPath(path) {
    return ProjectModel._isWelcomeProjectPath(path, _getWelcomeProjectPath(), PreferencesManager.getViewState("welcomeProjects"));
}

/**
 * If the provided path is to an old welcome project, returns the current one instead.
 */
export function updateWelcomeProjectPath(path) {
    if (isWelcomeProjectPath(path)) {
        return _getWelcomeProjectPath();
    }

    return path;
}

/**
 * After failing to load a project, this function determines which project path to fallback to.
 * @return {$.Promise} Promise that resolves to a project path {string}
 */
function _getFallbackProjectPath() {
    const fallbackPaths: Array<string> = [];
    const recentProjects: Array<string> = PreferencesManager.getViewState("recentProjects") || [];
    const deferred = $.Deferred();

    // Build ordered fallback path array
    if (recentProjects.length > 1) {
        // *Most* recent project is the one that just failed to load, so use second most recent
        fallbackPaths.push(recentProjects[1]);
    }

    // Next is Getting Started project
    fallbackPaths.push(_getWelcomeProjectPath());

    // Helper func for Async.firstSequentially()
    function processItem(path) {
        const deferred = $.Deferred();
        const fileEntry = FileSystem.getDirectoryForPath(path);

        fileEntry.exists(function (err, exists) {
            if (!err && exists) {
                deferred.resolve();
            } else {
                deferred.reject();
            }
        });

        return deferred.promise();
    }

    // Find first path that exists
    Async.firstSequentially(fallbackPaths, processItem)
        .done(function (fallbackPath) {
            deferred.resolve(fallbackPath);
        })
        .fail(function () {
            // Last resort is Brackets source folder which is guaranteed to exist
            deferred.resolve(FileUtils.getNativeBracketsDirectoryPath());
        });

    return deferred.promise();
}

/**
 * Initial project path is stored in prefs, which defaults to the welcome project on
 * first launch.
 */
export function getInitialProjectPath() {
    const shellArgv = appshell.shell.getProcessArgv();
    if (shellArgv.length > 1) {
        try {
            let path: string = _.last(shellArgv);
            const stats = appshell.fs.statSync(path);
            path = FileUtils.convertWindowsPathToUnixPath(path);
            if (stats.isFile()) {
                exports.one("projectOpen", function () {
                    FileViewController.openFileAndAddToWorkingSet(path);
                });
                return FileUtils.getDirectoryPath(path);
            }

            if (stats.isDirectory()) {
                return path.endsWith("/") ? path : path + "/";
            }
        } catch (err) {
            /* nothing */
        }
    }
    return updateWelcomeProjectPath(PreferencesManager.getViewState("projectPath"));
}

/**
 * @private
 *
 * Watches the project for filesystem changes so that the tree can be updated.
 */
function _watchProjectRoot(rootPath) {
    FileSystem.on("change", _fileSystemChange);
    FileSystem.on("rename", _fileSystemRename);

    FileSystem.watch(FileSystem.getDirectoryForPath(rootPath), ProjectModel._shouldShowName, ProjectModel.defaultIgnoreGlobs, function (err) {
        if (err === FileSystemError.TOO_MANY_ENTRIES) {
            if (!_projectWarnedForTooManyFiles) {
                _showErrorDialog(ERR_TYPE_MAX_FILES);
                _projectWarnedForTooManyFiles = true;
            }
        } else if (err) {
            console.error("Error watching project root: ", rootPath, err);
        }
    });

    // Reset allFiles cache
    model._resetCache();
}


/**
 * @private
 * Close the file system and remove listeners.
 * @return {$.Promise} A promise that's resolved when the root is unwatched. Rejected if
 *     there is no project root or if the unwatch fails.
 */
function _unwatchProjectRoot() {
    const result = $.Deferred();
    if (!model.projectRoot) {
        result.reject();
    } else {
        FileSystem.off("change", _fileSystemChange);
        FileSystem.off("rename", _fileSystemRename);

        FileSystem.unwatch(model.projectRoot, function (err) {
            if (err && err !== "RootNotBeingWatched") {
                console.error("Error unwatching project root: ", model.projectRoot!.fullPath, err);
                result.reject(err);
            } else {
                result.resolve();
            }
        });

        // Reset allFiles cache
        model._resetCache();
    }

    return result.promise();
}

/**
 * @private
 * Reloads the project preferences.
 */
function _reloadProjectPreferencesScope() {
    const root = getProjectRoot();
    if (root) {
        // Alias the "project" Scope to the path Scope for the project-level settings file
        PreferencesManager._setProjectSettingsFile(root.fullPath + SETTINGS_FILENAME);
    } else {
        PreferencesManager._setProjectSettingsFile();
    }
}

/**
 * Loads the given folder as a project. Does NOT prompt about any unsaved changes - use openProject()
 * instead to check for unsaved changes and (optionally) let the user choose the folder to open.
 *
 * @param {!string} rootPath  Absolute path to the root folder of the project.
 *  A trailing "/" on the path is optional (unlike many Brackets APIs that assume a trailing "/").
 * @param {boolean=} isUpdating  If true, indicates we're just updating the tree;
 *  if false, a different project is being loaded.
 * @return {$.Promise} A promise object that will be resolved when the
 *  project is loaded and tree is rendered, or rejected if the project path
 *  fails to load.
 */
function _loadProject(rootPath, isUpdating?) {
    const result = $.Deferred();
    const startLoad = $.Deferred();

    // Some legacy code calls this API with a non-canonical path
    rootPath = ProjectModel._ensureTrailingSlash(rootPath);

    const projectPrefFullPath = (rootPath + SETTINGS_FILENAME);
    const file   = FileSystem.getFileForPath(projectPrefFullPath);

    // Verify that the project preferences file (.brackets.json) is NOT corrupted.
    // If corrupted, display the error message and open the file in editor for the user to edit.
    FileUtils.readAsText(file)
        .done(function (text) {
            try {
                if (text) {
                    JSON.parse(text);
                }
            } catch (err) {
                // Cannot parse the text read from the project preferences file.
                const info = MainViewManager.findInAllWorkingSets(projectPrefFullPath);
                let paneId;
                if (info.length) {
                    paneId = info[0].paneId;
                }
                FileViewController.openFileAndAddToWorkingSet(projectPrefFullPath, paneId)
                    .done(function () {
                        Dialogs.showModalDialog(
                            DefaultDialogs.DIALOG_ID_ERROR,
                            Strings.ERROR_PREFS_CORRUPT_TITLE,
                            Strings.ERROR_PROJ_PREFS_CORRUPT
                        ).done(function () {
                            // give the focus back to the editor with the pref file
                            MainViewManager.focusActivePane();
                        });
                    });
            }
        });

    if (isUpdating) {
        // We're just refreshing. Don't need to unwatch the project root, so we can start loading immediately.
        startLoad.resolve();
    } else {
        if (model.projectRoot && model.projectRoot.fullPath === rootPath) {
            return $.Deferred().resolve().promise();
        }

        // About to close current project (if any)
        if (model.projectRoot) {
            exports.trigger("beforeProjectClose", model.projectRoot);
        }

        // close all the old files
        MainViewManager._closeAll(MainViewManager.ALL_PANES);

        _unwatchProjectRoot().always(function () {
            // Done closing old project (if any)
            if (model.projectRoot) {
                LanguageManager._resetPathLanguageOverrides();
                PreferencesManager._reloadUserPrefs(model.projectRoot);
                exports.trigger("projectClose", model.projectRoot);
            }

            startLoad.resolve();
        });
    }

    startLoad.done(function () {
        const context = {
            location: {
                scope: "user",
                layer: "project"
            }
        };

        // Clear project path map
        if (!isUpdating) {
            PreferencesManager._stateProjectLayer.setProjectPath(rootPath);
        }

        // Populate file tree as long as we aren't running in the browser
        if (!brackets.inBrowser) {
            if (!isUpdating) {
                _watchProjectRoot(rootPath);
            }
            // Point at a real folder structure on local disk
            const rootEntry = FileSystem.getDirectoryForPath(rootPath);
            rootEntry.exists(function (err, exists) {
                if (exists) {
                    const projectRootChanged = (!model.projectRoot || !rootEntry) ||
                        model.projectRoot.fullPath !== rootEntry.fullPath;

                    // Success!
                    const perfTimerName = PerfUtils.markStart("Load Project: " + rootPath);

                    _projectWarnedForTooManyFiles = false;

                    _setProjectRoot(rootEntry).always(function () {
                        model.setBaseUrl(PreferencesManager.getViewState("project.baseUrl", context) || "");

                        if (projectRootChanged) {
                            _reloadProjectPreferencesScope();
                            PreferencesManager._setCurrentFile(rootPath);
                        }

                        // If this is the most current welcome project, record it. In future launches, we want
                        // to substitute the latest welcome project from the current build instead of using an
                        // outdated one (when loading recent projects or the last opened project).
                        if (rootPath === _getWelcomeProjectPath()) {
                            addWelcomeProjectPath(rootPath);
                        }

                        if (projectRootChanged) {
                            // Allow asynchronous event handlers to finish before resolving result by collecting promises from them
                            exports.trigger("projectOpen", model.projectRoot);
                            result.resolve();
                        } else {
                            exports.trigger("projectRefresh", model.projectRoot);
                            result.resolve();
                        }
                        PerfUtils.addMeasurement(perfTimerName);
                    });
                } else {
                    console.log("error loading project");
                    _showErrorDialog(ERR_TYPE_LOADING_PROJECT_NATIVE, true, err || FileSystemError.NOT_FOUND, rootPath)!
                        .done(function () {
                            // Reset _projectRoot to null so that the following _loadProject call won't
                            // run the 'beforeProjectClose' event a second time on the original project,
                            // which is now partially torn down (see #6574).
                            model.projectRoot = null;

                            // The project folder stored in preference doesn't exist, so load the default
                            // project directory.
                            // TODO (issue #267): When Brackets supports having no project directory
                            // defined this code will need to change
                            _getFallbackProjectPath().done(function (path) {
                                _loadProject(path).always(function () {
                                    // Make sure not to reject the original deferred until the fallback
                                    // project is loaded, so we don't violate expectations that there is always
                                    // a current project before continuing after _loadProject().
                                    result.reject();
                                });
                            });
                        });
                }
            });
        }
    });

    return result.promise();
}

/**
 * @const
 * @private
 * @type {number} Minimum delay in milliseconds between calls to refreshFileTree
 */
const _refreshDelay = 1000;

/**
 * Refresh the project's file tree, maintaining the current selection.
 *
 * Note that the original implementation of this returned a promise to be resolved when the refresh is complete.
 * That use is deprecated and `refreshFileTree` is now a "fire and forget" kind of function.
 */
function _refreshFileTree() {
    FileSystem.clearAllCaches();
    return $.Deferred().resolve().promise();
}

export const refreshFileTree = _.debounce(_refreshFileTree, _refreshDelay);

/**
 * Expands tree nodes to show the given file or folder and selects it. Silently no-ops if the
 * path lies outside the project, or if it doesn't exist.
 *
 * @param {!(File|Directory)} entry File or Directory to show
 * @return {$.Promise} Resolved when done; or rejected if not found
 */
export function showInTree(entry) {
    return model.showInTree(entry).then(_saveTreeState);
}


/**
 * Open a new project. Currently, Brackets must always have a project open, so
 * this method handles both closing the current project and opening a new project.
 *
 * @param {string=} path Optional absolute path to the root folder of the project.
 *  If path is undefined or null, displays a dialog where the user can choose a
 *  folder to load. If the user cancels the dialog, nothing more happens.
 * @return {$.Promise} A promise object that will be resolved when the
 *  project is loaded and tree is rendered, or rejected if the project path
 *  fails to load.
 */
export function openProject(path) {
    const result = $.Deferred();

    // Confirm any unsaved changes first. We run the command in "prompt-only" mode, meaning it won't
    // actually close any documents even on success; we'll do that manually after the user also oks
    // the folder-browse dialog.
    CommandManager.execute(Commands.FILE_CLOSE_ALL, { promptOnly: true })
        .done(function () {
            if (path) {
                // use specified path
                _loadProject(path, false).then(result.resolve, result.reject);
            } else {
                // Pop up a folder browse dialog
                FileSystem.showOpenDialog(false, true, Strings.CHOOSE_FOLDER, model.projectRoot!.fullPath, null, function (err, files) {
                    if (!err) {
                        // If length == 0, user canceled the dialog; length should never be > 1
                        if (files.length > 0) {
                            // Load the new project into the folder tree
                            _loadProject(files[0]).then(result.resolve, result.reject);
                        } else {
                            result.reject();
                        }
                    } else {
                        _showErrorDialog(ERR_TYPE_OPEN_DIALOG, null, err);
                        result.reject();
                    }
                });
            }
        })
        .fail(function () {
            result.reject();
        });

    // if fail, don't open new project: user canceled (or we failed to save its unsaved changes)
    return result.promise();
}

/**
 * Invoke project settings dialog.
 * @return {$.Promise}
 */
function _projectSettings() {
    return PreferencesDialogs.showProjectPreferencesDialog(getBaseUrl()).getPromise();
}

/**
 * Create a new item in the current project.
 *
 * @param baseDir {string|Directory} Full path of the directory where the item should go.
 *   Defaults to the project root if the entry is not valid or not within the project.
 * @param initialName {string} Initial name for the item
 * @param skipRename {boolean} If true, don't allow the user to rename the item
 * @param isFolder {boolean} If true, create a folder instead of a file
 * @return {$.Promise} A promise object that will be resolved with the File
 *  of the created object, or rejected if the user cancelled or entered an illegal
 *  filename.
 */
export function createNewItem(baseDir, initialName, skipRename, isFolder) {
    baseDir = model.getDirectoryInProject(baseDir);

    if (skipRename) {
        if (isFolder) {
            return model.createAtPath(baseDir + initialName + "/");
        }
        return model.createAtPath(baseDir + initialName);
    }
    return _actionCreator.startCreating(baseDir, initialName, isFolder);
}

/**
 * Delete file or directore from project
 * @param {!(File|Directory)} entry File or Directory to delete
 */
export function deleteItem(entry) {
    const result = $.Deferred();

    entry.moveToTrash(function (err) {
        if (!err) {
            DocumentManager.notifyPathDeleted(entry.fullPath);
            result.resolve();
        } else {
            _showErrorDialog(ERR_TYPE_DELETE, entry.isDirectory, FileUtils.getFileErrorString(err), entry.fullPath);

            result.reject(err);
        }
    });

    return result.promise();
}

/**
 * Returns a filter for use with getAllFiles() that filters files based on LanguageManager language id
 * @param {!(string|Array.<string>)} languageId a single string of a language id or an array of language ids
 * @return {!function(File):boolean}
 */
export function getLanguageFilter(languageId) {
    return function languageFilter(file) {
        const id = LanguageManager.getLanguageForPath(file.fullPath).getId();
        if (typeof languageId === "string") {
            return (id === languageId);
        }

        return (languageId.indexOf(id) !== -1);
    };
}

/**
 * @private
 *
 * Respond to a FileSystem change event. Note that if renames are initiated
 * externally, they may be reported as a separate removal and addition. In
 * this case, the editor state isn't currently preserved.
 *
 * @param {$.Event} event
 * @param {?(File|Directory)} entry File or Directory changed
 * @param {Array.<FileSystemEntry>=} added If entry is a Directory, contains zero or more added children
 * @param {Array.<FileSystemEntry>=} removed If entry is a Directory, contains zero or more removed children
 */
const _fileSystemChange = function (event, entry, added, removed) {
    FileSyncManager.syncOpenDocuments();

    model.handleFSEvent(entry, added, removed);

    // @TODO: DocumentManager should implement its own fsChange  handler
    //          we can clean up the calls to DocumentManager.notifyPathDeleted
    //          and privatize DocumentManager.notifyPathDeleted as well
    //        We can also remove the _fileSystemRename handler below and move
    //          it to DocumentManager
    if (removed) {
        removed.forEach(function (file) {
            // The call to syncOpenDocuemnts above will not nofify
            //  document manager about deleted images that are
            //  not in the working set -- try to clean that up here
            DocumentManager.notifyPathDeleted(file.fullPath);
        });
    }
};

/**
 * @private
 * Respond to a FileSystem rename event.
 */
const _fileSystemRename = function (event, oldName, newName) {
    // Tell the document manager about the name change. This will update
    // all of the model information and send notification to all views
    DocumentManager.notifyPathNameChanged(oldName, newName);
};

/**
 * Causes the rename operation that's in progress to complete.
 */
export function forceFinishRename() {
    _actionCreator.performRename();
}

/**
 * @private
 *
 * Sets the width of the selection bar in the file tree.
 *
 * @param {int} width New width value
 *
 * Private API for use with SidebarView
 */
export function _setFileTreeSelectionWidth(width) {
    model.setSelectionWidth(width);
    _renderTreeSync();
}

// Initialize variables and listeners that depend on the HTML DOM
AppInit.htmlReady(function () {
    $projectTreeContainer = $("#project-files-container");
    $projectTreeContainer.addClass("jstree jstree-brackets");
    $projectTreeContainer.css("overflow", "auto");
    $projectTreeContainer.css("position", "relative");

    fileTreeViewContainer = $("<div>").appendTo($projectTreeContainer)[0];

    model.setSelectionWidth($projectTreeContainer.width());

    $(".main-view").click(function (jqEvent) {
        if (!jqEvent.target.classList.contains("jstree-rename-input")) {
            forceFinishRename();
            _actionCreator.setContext(null);
        }
    });

    $("#working-set-list-container").on("contentChanged", function () {
        $projectTreeContainer.trigger("contentChanged");
    });

    Menus.getContextMenu(Menus.ContextMenuIds.PROJECT_MENU).on("beforeContextMenuOpen", function () {
        _actionCreator.restoreContext();
    });

    Menus.getContextMenu(Menus.ContextMenuIds.PROJECT_MENU).on("beforeContextMenuClose", function () {
        model.setContext(null, false, true);
    });

    $projectTreeContainer.on("contextmenu", function () {
        forceFinishRename();
    });

    $projectTreeContainer.on("dragover", function (e) {
        e.preventDefault();
    });

    // Add support for moving items to root directory
    $projectTreeContainer.on("drop", function (e) {
        if ($projectTreeContainer[0] === $(e.target)[0]) {
            const data = JSON.parse(e.originalEvent.dataTransfer.getData("text"));
            _actionCreator.moveItem(data.path, getProjectRoot()!.fullPath);
            e.stopPropagation();
        }
    });

    // When a context menu item is selected, we need to clear the context
    // because we don't get a beforeContextMenuClose event since Bootstrap
    // handles this directly.
    $("#project-context-menu").on("click.dropdown-menu", function () {
        model.setContext(null, true);
    });

    $projectTreeContainer.on("scroll", function () {
        // Close open menus on scroll and clear the context, but only if there's a menu open.
        if ($(".dropdown.open").length > 0) {
            Menus.closeAll();
            _actionCreator.setContext(null);
        }
        // we need to render the tree without a delay to not cause selection extension issues (#10573)
        _renderTreeSync();
    });

    _renderTree();

    ViewUtils.addScrollerShadow($projectTreeContainer[0]);
});

EventDispatcher.makeEventDispatcher(exports);

// Init default project path to welcome project
PreferencesManager.stateManager.definePreference("projectPath", "string", _getWelcomeProjectPath());

exports.on("projectOpen", _reloadProjectPreferencesScope);
exports.on("projectOpen", _saveProjectPath);
exports.on("beforeAppClose", _unwatchProjectRoot);

// Due to circular dependencies, not safe to call on() directly for other modules' events
EventDispatcher.on_duringInit(FileViewController, "documentSelectionFocusChange", _documentSelectionFocusChange);
EventDispatcher.on_duringInit(FileViewController, "fileViewFocusChange", _fileViewControllerChange);
EventDispatcher.on_duringInit(MainViewManager, "currentFileChange", _currentFileChange);

// Commands
CommandManager.register(Strings.CMD_OPEN_FOLDER,      Commands.FILE_OPEN_FOLDER,      openProject);
CommandManager.register(Strings.CMD_PROJECT_SETTINGS, Commands.FILE_PROJECT_SETTINGS, _projectSettings);
CommandManager.register(Strings.CMD_FILE_REFRESH,     Commands.FILE_REFRESH,          refreshFileTree);

// Define the preference to decide how to sort the Project Tree files
PreferencesManager.definePreference(SORT_DIRECTORIES_FIRST, "boolean", brackets.platform !== "mac", {
    description: Strings.DESCRIPTION_SORT_DIRECTORIES_FIRST
})
    .on("change", function () {
        _actionCreator.setSortDirectoriesFirst(PreferencesManager.get(SORT_DIRECTORIES_FIRST));
    });

_actionCreator.setSortDirectoriesFirst(PreferencesManager.get(SORT_DIRECTORIES_FIRST));

/**
 * Gets the filesystem object for the current context in the file tree.
 */
export function getContext() {
    return model.getContext();
}

/**
 * Starts a rename operation, completing the current operation if there is one.
 *
 * The Promise returned is resolved with an object with a `newPath` property with the renamed path. If the user cancels the operation, the promise is resolved with the value RENAME_CANCELLED.
 *
 * @param {FileSystemEntry} entry file or directory filesystem object to rename
 * @param {boolean=} isMoved optional flag which indicates whether the entry is being moved instead of renamed
 * @return {$.Promise} a promise resolved when the rename is done.
 */
export function renameItemInline(entry, isMoved?) {
    const d = $.Deferred();

    model.startRename(entry, isMoved)
        .done(function () {
            d.resolve();
        })
        .fail(function (errorInfo) {
            // Need to do display the error message on the next event loop turn
            // because some errors can come up synchronously and then the dialog
            // is not displayed.
            window.setTimeout(function () {
                if (isMoved) {
                    switch (errorInfo.type) {
                        case FileSystemError.ALREADY_EXISTS:
                            _showErrorDialog(ERR_TYPE_MOVE, errorInfo.isFolder, Strings.FILE_EXISTS_ERR, errorInfo.fullPath);
                            break;
                        case ProjectModel.ERROR_NOT_IN_PROJECT:
                            _showErrorDialog(ERR_TYPE_MOVE, errorInfo.isFolder, Strings.ERROR_MOVING_NOT_IN_PROJECT, errorInfo.fullPath);
                            break;
                        default:
                            _showErrorDialog(ERR_TYPE_MOVE, errorInfo.isFolder, FileUtils.getFileErrorString(errorInfo.type), errorInfo.fullPath);
                    }
                } else {
                    switch (errorInfo.type) {
                        case ProjectModel.ERROR_INVALID_FILENAME:
                            _showErrorDialog(ERR_TYPE_INVALID_FILENAME, errorInfo.isFolder, ProjectModel._invalidChars);
                            break;
                        case FileSystemError.ALREADY_EXISTS:
                            _showErrorDialog(ERR_TYPE_RENAME, errorInfo.isFolder, Strings.FILE_EXISTS_ERR, errorInfo.fullPath);
                            break;
                        case ProjectModel.ERROR_NOT_IN_PROJECT:
                            _showErrorDialog(ERR_TYPE_RENAME, errorInfo.isFolder, Strings.ERROR_RENAMING_NOT_IN_PROJECT, errorInfo.fullPath);
                            break;
                        default:
                            _showErrorDialog(ERR_TYPE_RENAME, errorInfo.isFolder, FileUtils.getFileErrorString(errorInfo.type), errorInfo.fullPath);
                    }
                }
            }, 10);
            d.reject(errorInfo);
        });
    return d.promise();
}

/**
 * Returns an Array of all files for this project, optionally including
 * files in the working set that are *not* under the project root. Files are
 * filtered first by ProjectModel.shouldShow(), then by the custom filter
 * argument (if one was provided).
 *
 * @param {function (File, number):boolean=} filter Optional function to filter
 *          the file list (does not filter directory traversal). API matches Array.filter().
 * @param {boolean=} includeWorkingSet If true, include files in the working set
 *          that are not under the project root (*except* for untitled documents).
 * @param {boolean=} sort If true, The files will be sorted by their paths
 *
 * @return {$.Promise} Promise that is resolved with an Array of File objects.
 */
export function getAllFiles(filter, includeWorkingSet?, sort?): JQueryPromise<Array<File>> {
    let viewFiles;

    // The filter and includeWorkingSet params are both optional.
    // Handle the case where filter is omitted but includeWorkingSet is
    // specified.
    if (includeWorkingSet === undefined && typeof (filter) !== "function") {
        includeWorkingSet = filter;
        filter = null;
    }

    if (includeWorkingSet) {
        viewFiles = MainViewManager.getWorkingSet(MainViewManager.ALL_PANES);
    }

    const deferred = $.Deferred<Array<File>>();
    model.getAllFiles(filter, viewFiles, sort)
        .done(function (fileList) {
            deferred.resolve(fileList);
        })
        .fail(function (err) {
            if (err === FileSystemError.TOO_MANY_ENTRIES && !_projectWarnedForTooManyFiles) {
                _showErrorDialog(ERR_TYPE_MAX_FILES);
                _projectWarnedForTooManyFiles = true;
            }
            // resolve with empty list
            deferred.resolve([]);
        });
    return deferred.promise();
}

/**
 * Adds an icon provider. The callback is invoked before each tree item is rendered, and can
 * return content to prepend to the item.
 *
 * @param {!function(!{name:string, fullPath:string, isFile:boolean}):?string|jQuery|DOMNode|React.DOM.ins} callback
 * * `name`: the file or directory name
 * * `fullPath`: full path to the file or directory
 * * `isFile`: true if it's a file, false if it's a directory
 * Return a string of HTML text, a React.DOM.ins instance, a jQuery object, or a DOM node; or undefined
 * to prepend nothing.
 */
export function addIconProvider(callback) {
    return FileTreeView.addIconProvider(callback);
}

/**
 * Adds a CSS class provider, invoked before each tree item is rendered.
 *
 * @param {!function(!{name:string, fullPath:string, isFile:boolean}):?string} callback
 * * `name`: the file or directory name
 * * `fullPath`: full path to the file or directory
 * * `isFile`: true if it's a file, false if it's a directory
 * Return a string containing space-separated CSS class(es) to add, or undefined to leave CSS unchanged.
 */
export function addClassesProvider(callback) {
    return FileTreeView.addClassesProvider(callback);
}

/**
 * Forces the file tree to rerender. Typically, the tree only rerenders the portions of the
 * tree that have changed data. If an extension that augments the tree has changes that it
 * needs to display, calling rerenderTree will cause the components for the whole tree to
 * be rerendered.
 */
export function rerenderTree() {
    _renderTree(true);
}

export const shouldShow = ProjectModel.shouldShow;
