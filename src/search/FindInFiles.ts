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

/*
 * The core search functionality used by Find in Files and single-file Replace Batch.
 */

/// <amd-dependency path="module" name="module"/>

import * as _ from "lodash";
import * as FileFilters from "search/FileFilters";
import * as Async from "utils/Async";
import * as StringUtils from "utils/StringUtils";
import * as ProjectManager from "project/ProjectManager";
import * as PreferencesManager from "preferences/PreferencesManager";
import * as DocumentModule from "document/Document";
import * as DocumentManager from "document/DocumentManager";
import * as MainViewManager from "view/MainViewManager";
import * as FileSystem from "filesystem/FileSystem";
import * as LanguageManager from "language/LanguageManager";
import { SearchModel } from "search/SearchModel";
import * as PerfUtils from "utils/PerfUtils";
import NodeDomain = require("utils/NodeDomain");
import * as FileUtils from "file/FileUtils";
import * as FindUtils from "search/FindUtils";
import * as HealthLogger from "utils/HealthLogger";
import { DispatcherEvents } from "utils/EventDispatcher";
import File = require("filesystem/File");
import FileSystemEntry = require("filesystem/FileSystemEntry");
import Directory = require("filesystem/Directory");

interface UpdateObject {
    fileList: Array<File>;
    filesInSearchScope?: Array<string>;
}

interface Pos {
    line: number;
    ch: number;
}

interface SearchMatch {
    start: Pos;
    end: Pos;
    highlightOffset: number;
    startOffset: number;
    endOffset: number;
    line: string;
    result: RegExpExecArray;
    isChecked: boolean;
}

interface FileSystemEvent {
    event: any;
    entry?: FileSystemEntry;
    isDirectory: boolean;
    added: Array<File | Directory>;
    removed: Array<File | Directory>;
}

interface FileSystemEventMap {
    [fullpath: string]: FileSystemEvent;
}

const _bracketsPath   = FileUtils.getNativeBracketsDirectoryPath();
const _modulePath     = FileUtils.getNativeModuleDirectoryPath(module);
const _nodePath       = "node/FindInFilesDomain";
const _domainPath     = [_bracketsPath, _modulePath, _nodePath].join("/");
const searchDomain     = new NodeDomain("FindInFiles", _domainPath);
let searchScopeChanged = false;
let findOrReplaceInProgress = false;
const changedFileList = {};

/**
 * Token used to indicate a specific reason for zero search results
 * @const @type {!Object}
 */
export const ZERO_FILES_TO_SEARCH = {};

/**
 * Maximum length of text displayed in search results panel
 * @const
 */
const MAX_DISPLAY_LENGTH = 200;

/**
 * The search query and results model.
 * @type {SearchModel}
 */
export const searchModel = new SearchModel();

/**
 * Waits for FS changes to stack up until processing them
 * (scripts like npm install can do a lot of movements on the disk)
 * @const
 */
const FILE_SYSTEM_EVENT_DEBOUNCE_TIME = 100;

/** Remove the listeners that were tracking potential search result changes */
function _removeListeners() {
    (DocumentModule as unknown as DispatcherEvents).off("documentChange", _documentChangeHandler);
    FileSystem.off("change", _debouncedFileSystemChangeHandler);
    (DocumentManager as unknown as DispatcherEvents).off("fileNameChange", _fileNameChangeHandler);
}

/** Add listeners to track events that might change the search result set */
function _addListeners() {
    // Avoid adding duplicate listeners - e.g. if a 2nd search is run without closing the old results panel first
    _removeListeners();

    (DocumentModule as unknown as DispatcherEvents).on("documentChange", _documentChangeHandler);
    FileSystem.on("change", _debouncedFileSystemChangeHandler);
    (DocumentManager as unknown as DispatcherEvents).on("fileNameChange",  _fileNameChangeHandler);
}

function nodeFileCacheComplete(event, numFiles, cacheSize) {
    if (/\/test\/SpecRunner\.html$/.test(window.location.pathname)) {
        // Ignore the event in the SpecRunner window
        return;
    }

    const projectRoot = ProjectManager.getProjectRoot();
    let projectName = projectRoot ? projectRoot.name : null;

    if (!projectName) {
        console.error("'File cache complete' event received, but no project root found");
        projectName = "noName00";
    }

    FindUtils.setInstantSearchDisabled(false);
    // Node search could be disabled if some error has happened in node. But upon
    // project change, if we get this message, then it means that node search is working,
    // we re-enable node search. If a search fails, node search will be switched off eventually.
    FindUtils.setNodeSearchDisabled(false);
    FindUtils.notifyIndexingFinished();
    HealthLogger.setProjectDetail(projectName, numFiles, cacheSize);
}

/**
 * @private
 * Searches through the contents and returns an array of matches
 * @param {string} contents
 * @param {RegExp} queryExpr
 * @return {!Array.<{start: {line:number,ch:number}, end: {line:number,ch:number}, line: string}>}
 */
function _getSearchMatches(contents, queryExpr: RegExp) {
    // Quick exit if not found or if we hit the limit
    if (searchModel.foundMaximum || contents.search(queryExpr) === -1) {
        return [];
    }

    let match;
    let lineNum;
    let line;
    let ch;
    let totalMatchLength;
    let matchedLines;
    let numMatchedLines;
    let lastLineLength;
    let endCh;
    let padding;
    let leftPadding;
    let rightPadding;
    let highlightOffset;
    let highlightEndCh;
    const lines = StringUtils.getLines(contents);
    const matches: Array<SearchMatch> = [];

    // tslint:disable-next-line:no-conditional-assignment
    while ((match = queryExpr.exec(contents)) !== null) {
        lineNum          = StringUtils.offsetToLineNum(lines, match.index);
        line             = lines[lineNum];
        ch               = match.index - contents.lastIndexOf("\n", match.index - 1) - 1;  // 0-based index
        matchedLines     = match[0].split("\n");
        numMatchedLines  = matchedLines.length;
        totalMatchLength = match[0].length;
        lastLineLength   = matchedLines[matchedLines.length - 1].length;
        endCh            = (numMatchedLines === 1 ? ch + totalMatchLength : lastLineLength);
        highlightEndCh   = (numMatchedLines === 1 ? endCh : line.length);
        highlightOffset  = 0;

        if (highlightEndCh <= MAX_DISPLAY_LENGTH) {
            // Don't store more than 200 chars per line
            line = line.substr(0, MAX_DISPLAY_LENGTH);
        } else if (totalMatchLength > MAX_DISPLAY_LENGTH) {
            // impossible to display the whole match
            line = line.substr(ch, ch + MAX_DISPLAY_LENGTH);
            highlightOffset = ch;
        } else {
            // Try to have both beginning and end of match displayed
            padding = MAX_DISPLAY_LENGTH - totalMatchLength;
            rightPadding = Math.floor(Math.min(padding / 2, line.length - highlightEndCh));
            leftPadding = Math.ceil(padding - rightPadding);
            highlightOffset = ch - leftPadding;
            line = line.substring(highlightOffset, highlightEndCh + rightPadding);
        }

        matches.push({
            start:       {line: lineNum, ch: ch},
            end:         {line: lineNum + numMatchedLines - 1, ch: endCh},

            highlightOffset: highlightOffset,

            // Note that the following offsets from the beginning of the file are *not* updated if the search
            // results change. These are currently only used for multi-file replacement, and we always
            // abort the replace (by shutting the results panel) if we detect any result changes, so we don't
            // need to keep them up to date. Eventually, we should either get rid of the need for these (by
            // doing everything in terms of line/ch offsets, though that will require re-splitting files when
            // doing a replace) or properly update them.
            startOffset: match.index,
            endOffset:   match.index + totalMatchLength,

            line:        line,
            result:      match,
            isChecked:   true
        });

        // We have the max hits in just this 1 file. Stop searching this file.
        // This fixed issue #1829 where code hangs on too many hits.
        // Adds one over MAX_TOTAL_RESULTS in order to know if the search has exceeded
        // or is equal to MAX_TOTAL_RESULTS. Additional result removed in SearchModel
        if (matches.length > SearchModel.MAX_TOTAL_RESULTS) {
            queryExpr.lastIndex = 0;
            break;
        }

        // Pathological regexps like /^/ return 0-length matches. Ensure we make progress anyway
        if (totalMatchLength === 0) {
            queryExpr.lastIndex++;
        }
    }

    return matches;
}

/**
 * @private
 * Update the search results using the given list of changes for the given document
 * @param {Document} doc  The Document that changed, should be the current one
 * @param {Array.<{from: {line:number,ch:number}, to: {line:number,ch:number}, text: !Array.<string>}>} changeList
 *      An array of changes as described in the Document constructor
 */
function _updateResults(doc, changeList) {
    let i;
    let diff;
    let matches;
    let lines;
    let start;
    let howMany;
    let resultsChanged = false;
    const fullPath = doc.file.fullPath;
    let resultInfo = searchModel.results[fullPath];

    // Remove the results before we make any changes, so the SearchModel can accurately update its count.
    searchModel.removeResults(fullPath);

    changeList.forEach(function (change) {
        lines = [];
        start = 0;
        howMany = 0;

        // There is no from or to positions, so the entire file changed, we must search all over again
        if (!change.from || !change.to) {
            // TODO: add unit test exercising timestamp logic in this case
            // We don't just call _updateSearchMatches() here because we want to continue iterating through changes in
            // the list and update at the end.
            resultInfo = {matches: _getSearchMatches(doc.getText(), searchModel.queryExpr!), timestamp: doc.diskTimestamp};
            resultsChanged = true;

        } else {
            // Get only the lines that changed
            for (i = 0; i < change.text.length; i++) {
                lines.push(doc.getLine(change.from.line + i));
            }

            // We need to know how many newlines were inserted/deleted in order to update the rest of the line indices;
            // this is the total number of newlines inserted (which is the length of the lines array minus
            // 1, since the last line in the array is inserted without a newline after it) minus the
            // number of original newlines being removed.
            diff = lines.length - 1 - (change.to.line - change.from.line);

            if (resultInfo) {
                // Search the last match before a replacement, the amount of matches deleted and update
                // the lines values for all the matches after the change
                resultInfo.matches.forEach(function (item) {
                    if (item.end.line < change.from.line) {
                        start++;
                    } else if (item.end.line <= change.to.line) {
                        howMany++;
                    } else {
                        item.start.line += diff;
                        item.end.line   += diff;
                    }
                });

                // Delete the lines that where deleted or replaced
                if (howMany > 0) {
                    resultInfo.matches.splice(start, howMany);
                }
                resultsChanged = true;
            }

            // Searches only over the lines that changed
            matches = _getSearchMatches(lines.join("\r\n"), searchModel.queryExpr!);
            if (matches.length) {
                // Updates the line numbers, since we only searched part of the file
                matches.forEach(function (value, key) {
                    matches[key].start.line += change.from.line;
                    matches[key].end.line   += change.from.line;
                });

                // If the file index exists, add the new matches to the file at the start index found before
                if (resultInfo) {
                    Array.prototype.splice.apply(resultInfo.matches, [start, 0].concat(matches));
                // If not, add the matches to a new file index
                } else {
                    // TODO: add unit test exercising timestamp logic in self case
                    resultInfo = {
                        matches:   matches,
                        collapsed: false,
                        timestamp: doc.diskTimestamp
                    };
                }
                resultsChanged = true;
            }
        }
    });

    // Always re-add the results, even if nothing changed.
    if (resultInfo && resultInfo.matches.length) {
        searchModel.setResults(fullPath, resultInfo);
    }

    if (resultsChanged) {
        // Pass `true` for quickChange here. This will make listeners debounce the change event,
        // avoiding lots of updates if the user types quickly.
        searchModel.fireChanged(true);
    }
}

/**
 * Checks that the file matches the given subtree scope. To fully check whether the file
 * should be in the search set, use _inSearchScope() instead - a supserset of this.
 *
 * @param {!File} file
 * @param {?FileSystemEntry} scope Search scope, or null if whole project
 * @return {boolean}
 */
function _subtreeFilter(file, scope) {
    if (scope) {
        if (scope.isDirectory) {
            // Dirs always have trailing slash, so we don't have to worry about being
            // a substring of another dir name
            return file.fullPath.indexOf(scope.fullPath) === 0;
        }

        return file.fullPath === scope.fullPath;
    }
    return true;
}

/**
 * Filters out files that are known binary types.
 * @param {string} fullPath
 * @return {boolean} True if the file's contents can be read as text
 */
function _isReadableText(fullPath) {
    return !LanguageManager.getLanguageForPath(fullPath).isBinary();
}

/**
 * Finds all candidate files to search in the given scope's subtree that are not binary content. Does NOT apply
 * the current filter yet.
 * @param {?FileSystemEntry} scope Search scope, or null if whole project
 * @return {$.Promise} A promise that will be resolved with the list of files in the scope. Never rejected.
 */
export function getCandidateFiles(scope) {
    function filter(file) {
        return _subtreeFilter(file, scope) && _isReadableText(file.fullPath);
    }

    // If the scope is a single file, just check if the file passes the filter directly rather than
    // trying to use ProjectManager.getAllFiles(), both for performance and because an individual
    // in-memory file might be an untitled document that doesn't show up in getAllFiles().
    if (scope && scope.isFile) {
        return $.Deferred().resolve(filter(scope) ? [scope] : []).promise();
    }

    return ProjectManager.getAllFiles(filter, true, true);
}

/**
 * Checks that the file is eligible for inclusion in the search (matches the user's subtree scope and
 * file exclusion filters, and isn't binary). Used when updating results incrementally - during the
 * initial search, these checks are done in bulk via getCandidateFiles() and the filterFileList() call
 * after it.
 * @param {!File} file
 * @return {boolean}
 */
function _inSearchScope(file) {
    // Replicate the checks getCandidateFiles() does
    if (searchModel && searchModel.scope) {
        if (!_subtreeFilter(file, searchModel.scope)) {
            return false;
        }
    } else {
        // Still need to make sure it's within project or working set
        // In getCandidateFiles(), this is covered by the baseline getAllFiles() itself
        if (file.fullPath.indexOf(ProjectManager.getProjectRoot()!.fullPath) !== 0) {
            if (MainViewManager.findInWorkingSet(MainViewManager.ALL_PANES, file.fullPath) === -1) {
                return false;
            }
        }
    }

    if (!_isReadableText(file.fullPath)) {
        return false;
    }

    // Replicate the filtering filterFileList() does
    return FileFilters.filterPath(searchModel.filter, file.fullPath);
}


/**
 * @private
 * Tries to update the search result on document changes
 * @param {$.Event} event
 * @param {Document} document
 * @param {<{from: {line:number,ch:number}, to: {line:number,ch:number}, text: !Array.<string>}>} change
 *      A change list as described in the Document constructor
 */
export const _documentChangeHandler = function (event, document, change) {
    if (!findOrReplaceInProgress) {
        changedFileList[document.file.fullPath] = true;
    } else {
        if (_inSearchScope(document.file)) {
            _updateResults(document, change);
        }
    }
};

/**
 * @private
 * Finds search results in the given file and adds them to 'searchResults.' Resolves with
 * true if any matches found, false if none found. Errors reading the file are treated the
 * same as if no results found.
 *
 * Does not perform any filtering - assumes caller has already vetted this file as a search
 * candidate.
 *
 * @param {!File} file
 * @return {$.Promise}
 */
function _doSearchInOneFile(file): JQueryPromise<boolean> {
    const result = $.Deferred<boolean>();

    DocumentManager.getDocumentText(file)
        .done(function (text, timestamp) {
            // Note that we don't fire a model change here, since this is always called by some outer batch
            // operation that will fire it once it's done.
            const matches = _getSearchMatches(text, searchModel.queryExpr!);
            searchModel.setResults(file.fullPath, {matches: matches, timestamp: timestamp});
            result.resolve(!!matches.length);
        })
        .fail(function () {
            // Always resolve. If there is an error, this file
            // is skipped and we move on to the next file.
            result.resolve(false);
        });

    return result.promise();
}

/**
 * @private
 * Inform node that the document has changed [along with its contents]
 * @param {string} docPath the path of the changed document
 */
function _updateDocumentInNode(docPath) {
    DocumentManager.getDocumentForPath(docPath).done(function (doc) {
        if (doc) {
            const updateObject = {
                "filePath": docPath,
                "docContents": doc.getText()
            };
            searchDomain.exec("documentChanged", updateObject);
        }
    });
}

/**
 * @private
 * sends all changed documents that we have tracked to node
 */
function _updateChangedDocs() {
    for (const key in changedFileList) {
        if (changedFileList.hasOwnProperty(key)) {
            _updateDocumentInNode(key);
        }
    }
}

/**
 * @private
 * Executes the Find in Files search inside the current scope.
 * @param {{query: string, isCaseSensitive: boolean, isRegexp: boolean, isWholeWord: boolean}} queryInfo Query info object
 * @param {!$.Promise} candidateFilesPromise Promise from getCandidateFiles(), which was called earlier
 * @param {?string} filter A "compiled" filter as returned by FileFilters.compile(), or null for no filter
 * @return {?$.Promise} A promise that's resolved with the search results (or ZERO_FILES_TO_SEARCH) or rejected when the find competes.
 *      Will be null if the query is invalid.
 */
function _doSearch(queryInfo, candidateFilesPromise, filter) {
    searchModel.filter = filter;

    const queryResult = searchModel.setQueryInfo(queryInfo);
    if (!queryResult) {
        return null;
    }

    const scopeName = searchModel.scope ? searchModel.scope!.fullPath : ProjectManager.getProjectRoot()!.fullPath;
    const perfTimer = PerfUtils.markStart("FindIn: " + scopeName + " - " + queryInfo.query);

    findOrReplaceInProgress = true;

    return candidateFilesPromise
        .then(function (fileListResult) {
            // Filter out files/folders that match user's current exclusion filter
            fileListResult = FileFilters.filterFileList(filter, fileListResult);

            if (searchModel.isReplace || FindUtils.isNodeSearchDisabled()) {
                if (fileListResult.length) {
                    searchModel.allResultsAvailable = true;
                    return Async.doInParallel(fileListResult, _doSearchInOneFile);
                }

                return ZERO_FILES_TO_SEARCH;
            }

            const searchDeferred = $.Deferred();

            if (fileListResult.length) {
                let searchObject;
                if (searchScopeChanged) {
                    let files = fileListResult
                        .filter(function (entry) {
                            return entry.isFile && _isReadableText(entry.fullPath);
                        })
                        .map(function (entry) {
                            return entry.fullPath;
                        });

                    /* The following line prioritizes the open Document in editor and
                     * pushes it to the top of the filelist. */
                    files = FindUtils.prioritizeOpenFile(files, FindUtils.getOpenFilePath());

                    searchObject = {
                        "files": files,
                        "queryInfo": queryInfo,
                        "queryExpr": searchModel.queryExpr
                    };
                    searchScopeChanged = false;
                } else {
                    searchObject = {
                        "queryInfo": queryInfo,
                        "queryExpr": searchModel.queryExpr
                    };
                }

                if (searchModel.isReplace) {
                    searchObject.getAllResults = true;
                }
                _updateChangedDocs();
                FindUtils.notifyNodeSearchStarted();
                searchDomain.exec("doSearch", searchObject)
                    .done(function (rcvdObject) {
                        FindUtils.notifyNodeSearchFinished();
                        if (!rcvdObject || !rcvdObject.results) {
                            console.log("no node falling back to brackets search");
                            FindUtils.setNodeSearchDisabled(true);
                            searchDeferred.fail();
                            clearSearch();
                            return;
                        }
                        searchModel.results = rcvdObject.results;
                        searchModel.numMatches = rcvdObject.numMatches;
                        searchModel.numFiles = rcvdObject.numFiles;
                        searchModel.exceedsMaximum = rcvdObject.exceedsMaximum;
                        searchModel.allResultsAvailable = rcvdObject.allResultsAvailable;
                        searchDeferred.resolve();
                    })
                    .fail(function () {
                        FindUtils.notifyNodeSearchFinished();
                        console.log("node fails");
                        FindUtils.setNodeSearchDisabled(true);
                        clearSearch();
                        searchDeferred.reject();
                    });
                return searchDeferred.promise();
            }

            return ZERO_FILES_TO_SEARCH;
        })
        .then(function (zeroFilesToken) {
            exports._searchDone = true; // for unit tests
            PerfUtils.addMeasurement(perfTimer);

            if (zeroFilesToken === ZERO_FILES_TO_SEARCH) {
                return zeroFilesToken;
            }

            return searchModel.results;
        }, function (err) {
            console.log("find in files failed: ", err);
            PerfUtils.finalizeMeasurement(perfTimer);

            // In jQuery promises, returning the error here propagates the rejection,
            // unlike in Promises/A, where we would need to re-throw it to do so.
            return err;
        });
}

/**
 * @private
 * Clears any previous search information, removing update listeners and clearing the model.
 * @param {?Entry} scope Project file/subfolder to search within; else searches whole project.
 */
export const clearSearch = function () {
    findOrReplaceInProgress = false;
    searchModel.clear();
};

/**
 * Does a search in the given scope with the given filter. Used when you want to start a search
 * programmatically.
 * @param {{query: string, isCaseSensitive: boolean, isRegexp: boolean, isWholeWord: boolean}} queryInfo Query info object
 * @param {?Entry} scope Project file/subfolder to search within; else searches whole project.
 * @param {?string} filter A "compiled" filter as returned by FileFilters.compile(), or null for no filter
 * @param {?string} replaceText If this is a replacement, the text to replace matches with. This is just
 *      stored in the model for later use - the replacement is not actually performed right now.
 * @param {?$.Promise} candidateFilesPromise If specified, a promise that should resolve with the same set of files that
 *      getCandidateFiles(scope) would return.
 * @return {$.Promise} A promise that's resolved with the search results or rejected when the find competes.
 */
export function doSearchInScope(queryInfo, scope, filter, replaceText, candidateFilesPromise?) {
    clearSearch();
    searchModel.scope = scope;
    if (replaceText !== undefined) {
        searchModel.isReplace = true;
        searchModel.replaceText = replaceText;
    }
    candidateFilesPromise = candidateFilesPromise || getCandidateFiles(scope);
    return _doSearch(queryInfo, candidateFilesPromise, filter);
}

/**
 * Given a set of search results, replaces them with the given replaceText, either on disk or in memory.
 * @param {Object.<fullPath: string, {matches: Array.<{start: {line:number,ch:number}, end: {line:number,ch:number}, startOffset: number, endOffset: number, line: string}>, collapsed: boolean}>} results
 *      The list of results to replace, as returned from _doSearch..
 * @param {string} replaceText The text to replace each result with.
 * @param {?Object} options An options object:
 *      forceFilesOpen: boolean - Whether to open all files in editors and do replacements there rather than doing the
 *          replacements on disk. Note that even if this is false, files that are already open in editors will have replacements
 *          done in memory.
 *      isRegexp: boolean - Whether the original query was a regexp. If true, $-substitution is performed on the replaceText.
 * @return {$.Promise} A promise that's resolved when the replacement is finished or rejected with an array of errors
 *      if there were one or more errors. Each individual item in the array will be a {item: string, error: string} object,
 *      where item is the full path to the file that could not be updated, and error is either a FileSystem error or one
 *      of the `FindInFiles.ERROR_*` constants.
 */
export function doReplace(results, replaceText, options) {
    return FindUtils.performReplacements(results, replaceText, options).always(function () {
        // For UI integration testing only
        exports._replaceDone = true;
    });
}

/**
 * @private
 * Flags that the search scope has changed, so that the file list for the following search is recomputed
 */
const _searchScopeChanged = function () {
    searchScopeChanged = true;
};

/**
 * Notify node that the results should be collapsed
 */
function _searchcollapseResults() {
    if (FindUtils.isNodeSearchDisabled()) {
        return;
    }
    searchDomain.exec("collapseResults", FindUtils.isCollapsedResults());
}

/**
 * Inform node that the list of files has changed.
 * @param {array} fileList The list of files that changed.
 */
function filesChanged(fileList) {
    if (FindUtils.isNodeSearchDisabled() || !fileList || fileList.length === 0) {
        return;
    }
    const updateObject: UpdateObject = {
        "fileList": fileList
    };
    if (searchModel.filter) {
        updateObject.filesInSearchScope = FileFilters.getPathsMatchingFilter(searchModel.filter!, fileList);
        _searchScopeChanged();
    }
    searchDomain.exec("filesChanged", updateObject);
}

/**
 * Inform node that the list of files have been removed.
 * @param {array} fileList The list of files that was removed.
 */
function filesRemoved(fileList) {
    if (FindUtils.isNodeSearchDisabled() || !fileList || fileList.length === 0) {
        return;
    }
    const updateObject: UpdateObject = {
        "fileList": fileList
    };
    if (searchModel.filter) {
        updateObject.filesInSearchScope = FileFilters.getPathsMatchingFilter(searchModel.filter!, fileList);
        _searchScopeChanged();
    }
    searchDomain.exec("filesRemoved", updateObject);
}

/**
 * @private
 * Moves the search results from the previous path to the new one and updates the results list, if required
 * @param {$.Event} event
 * @param {string} oldName
 * @param {string} newName
 */
export const _fileNameChangeHandler = function (event, oldName, newName) {
    let resultsChanged = false;

    // Update the search results
    _.forEach(searchModel.results, function (item, fullPath: string) {
        if (fullPath.indexOf(oldName) === 0) {
            // node search : inform node about the rename
            filesRemoved([fullPath]);
            filesChanged([fullPath.replace(oldName, newName)]);

            if (findOrReplaceInProgress) {
                searchModel.removeResults(fullPath);
                searchModel.setResults(fullPath.replace(oldName, newName), item);
                resultsChanged = true;
            }
        }
    });

    if (resultsChanged) {
        searchModel.fireChanged();
    }
};

/**
 * @private
 * Updates search results in response to FileSystem "change" event
 * @param {$.Event} event
 * @param {FileSystemEntry} entry
 * @param {Array.<FileSystemEntry>=} added Added children
 * @param {Array.<FileSystemEntry>=} removed Removed children
 */
export const _fileSystemChangeHandler = function (event, entry, added, removed) {
    let resultsChanged = false;

    /*
     * Remove existing search results that match the given entry's path
     * @param {Array.<(File|Directory)>} entries
     */
    function _removeSearchResultsForEntries(entries) {
        const fullPaths: Array<string> = [];
        entries.forEach(function (entry) {
            Object.keys(searchModel.results).forEach(function (fullPath) {
                if (fullPath === entry.fullPath ||
                        (entry.isDirectory && fullPath.indexOf(entry.fullPath) === 0)) {
                    // node search : inform node that the file is removed
                    fullPaths.push(fullPath);
                    if (findOrReplaceInProgress) {
                        searchModel.removeResults(fullPath);
                        resultsChanged = true;
                    }
                }
            });
        });
        // this should be called once with a large array instead of numerous calls with single items
        filesRemoved(fullPaths);
    }

    /*
     * Add new search results for these entries and all of its children
     * @param {Array.<(File|Directory)>} entries
     * @return {jQuery.Promise} Resolves when the results have been added
     */
    function _addSearchResultsForEntries(entries) {
        let fullPaths: Array<string> = [];
        return Async.doInParallel(entries, function (entry) {
            const addedFiles: Array<File> = [];
            const addedFilePaths: Array<string> = [];
            const deferred = $.Deferred();

            // gather up added files
            const visitor = function (child) {
                // Replicate filtering that getAllFiles() does
                if (ProjectManager.shouldShow(child)) {
                    if (child.isFile && _isReadableText(child.name)) {
                        // Re-check the filtering that the initial search applied
                        if (_inSearchScope(child)) {
                            addedFiles.push(child);
                            addedFilePaths.push(child.fullPath);
                        }
                    }
                    return true;
                }
                return false;
            };

            entry.visit(visitor, function (err) {
                if (err) {
                    deferred.reject(err);
                    return;
                }

                // node Search : inform node about the file changes
                // filesChanged(addedFilePaths);
                fullPaths = fullPaths.concat(addedFilePaths);

                if (findOrReplaceInProgress) {
                    // find additional matches in all added files
                    Async.doInParallel(addedFiles, function (file) {
                        return _doSearchInOneFile(file)
                            .done(function (foundMatches) {
                                resultsChanged = resultsChanged || foundMatches!;
                            });
                    }).always(deferred.resolve);
                } else {
                    deferred.resolve();
                }
            });

            return deferred.promise();
        }).always(function () {
            // this should be called once with a large array instead of numerous calls with single items
            filesChanged(fullPaths);
        });
    }

    if (!entry) {
        // TODO: re-execute the search completely?
        return;
    }

    let addPromise;
    if (entry.isDirectory) {
        if (added.length === 0 && removed.length === 0) {
            // If the added or removed sets are null, must redo the search for the entire subtree - we
            // don't know which child files/folders may have been added or removed.
            _removeSearchResultsForEntries([ entry ]);

            const deferred = $.Deferred();
            addPromise = deferred.promise();
            entry.getContents(function (err, entries) {
                _addSearchResultsForEntries(entries).always(deferred.resolve);
            });
        } else {
            _removeSearchResultsForEntries(removed);
            addPromise = _addSearchResultsForEntries(added);
        }
    } else { // entry.isFile
        _removeSearchResultsForEntries([ entry ]);
        addPromise = _addSearchResultsForEntries([ entry ]);
    }

    addPromise.always(function () {
        // Restore the results if needed
        if (resultsChanged) {
            searchModel.fireChanged();
        }
    });
};

/**
 * This stores file system events emitted by watchers that were not yet processed
 */
let _cachedFileSystemEvents: Array<FileSystemEvent> = [];

/**
 * Debounced function to process emitted file system events
 * for cases when there's a lot of fs events emitted in a very short period of time
 */
const _processCachedFileSystemEvents = _.debounce(function () {
    // we need to reduce _cachedFileSystemEvents not to contain duplicates!
    const emptyMap: FileSystemEventMap = {};
    (_cachedFileSystemEvents as unknown as FileSystemEventMap) = _cachedFileSystemEvents.reduce(function (result, obj) {
        const fullPath = obj.entry ? obj.entry.fullPath : null;
        // merge added & removed
        if (result[fullPath!] && obj.isDirectory) {
            obj.added = obj.added.concat(result[fullPath!].added);
            obj.removed = obj.removed.concat(result[fullPath!].removed);
        }
        // use the latest event as base
        result[fullPath!] = obj;
        return result;
    }, emptyMap);
    _.forEach(_cachedFileSystemEvents, function (obj: FileSystemEvent) {
        _fileSystemChangeHandler(obj.event, obj.entry, obj.added, obj.removed);
    });
    _cachedFileSystemEvents = [];
}, FILE_SYSTEM_EVENT_DEBOUNCE_TIME);

/**
 * Wrapper function for _fileSystemChangeHandler which handles all incoming fs events
 * putting them to cache and executing a debounced function
 */
const _debouncedFileSystemChangeHandler = function (event, entry, added, removed) {
    // normalize this here so we don't need to handle null later
    let isDirectory = false;
    if (entry && entry.isDirectory) {
        isDirectory = true;
        added = added || [];
        removed = removed || [];
    }
    _cachedFileSystemEvents.push({
        event: event,
        entry: entry,
        isDirectory: isDirectory,
        added: added,
        removed: removed
    });
    _processCachedFileSystemEvents();
};

/**
 * On project change, inform node about the new list of files that needs to be crawled.
 * Instant search is also disabled for the time being till the crawl is complete in node.
 */
const _initCache = function () {
    function filter(file) {
        return _subtreeFilter(file, null) && _isReadableText(file.fullPath);
    }
    FindUtils.setInstantSearchDisabled(true);

    // we always listen for filesytem changes.
    _addListeners();

    if (!PreferencesManager.get("findInFiles.nodeSearch")) {
        return;
    }
    ProjectManager.getAllFiles(filter, true, true)
        .done(function (fileListResult) {
            let files = fileListResult!;
            const filter = FileFilters.getActiveFilter();
            if (filter && filter.patterns.length > 0) {
                files = FileFilters.filterFileList(FileFilters.compile(filter.patterns), files);
            }
            const filesPath = files.filter(function (entry) {
                return entry.isFile && _isReadableText(entry.fullPath);
            }).map(function (entry) {
                return entry.fullPath;
            });
            FindUtils.notifyIndexingStarted();
            searchDomain.exec("initCache", filesPath);
        });
    _searchScopeChanged();
};


/**
 * Gets the next page of search results to append to the result set.
 * @return {object} A promise that's resolved with the search results or rejected when the find competes.
 */
export function getNextPageofSearchResults() {
    const searchDeferred = $.Deferred();
    if (searchModel.allResultsAvailable) {
        return searchDeferred.resolve().promise();
    }
    _updateChangedDocs();
    FindUtils.notifyNodeSearchStarted();
    searchDomain.exec("nextPage")
        .done(function (rcvdObject) {
            FindUtils.notifyNodeSearchFinished();
            if (searchModel.results) {
                for (const resultEntry in rcvdObject.results) {
                    if (rcvdObject.results.hasOwnProperty(resultEntry)) {
                        searchModel.results[resultEntry.toString()] = rcvdObject.results[resultEntry];
                    }
                }
            } else {
                searchModel.results = rcvdObject.results;
            }
            searchModel.fireChanged();
            searchDeferred.resolve();
        })
        .fail(function () {
            FindUtils.notifyNodeSearchFinished();
            console.log("node fails");
            FindUtils.setNodeSearchDisabled(true);
            searchDeferred.reject();
        });
    return searchDeferred.promise();
}

export function getAllSearchResults() {
    const searchDeferred = $.Deferred();
    if (searchModel.allResultsAvailable) {
        return searchDeferred.resolve().promise();
    }
    _updateChangedDocs();
    FindUtils.notifyNodeSearchStarted();
    searchDomain.exec("getAllResults")
        .done(function (rcvdObject) {
            FindUtils.notifyNodeSearchFinished();
            searchModel.results = rcvdObject.results;
            searchModel.numMatches = rcvdObject.numMatches;
            searchModel.numFiles = rcvdObject.numFiles;
            searchModel.allResultsAvailable = true;
            searchModel.fireChanged();
            searchDeferred.resolve();
        })
        .fail(function () {
            FindUtils.notifyNodeSearchFinished();
            console.log("node fails");
            FindUtils.setNodeSearchDisabled(true);
            searchDeferred.reject();
        });
    return searchDeferred.promise();
}

(ProjectManager as unknown as DispatcherEvents).on("projectOpen", _initCache);
(FindUtils as unknown as DispatcherEvents).on(FindUtils.SEARCH_FILE_FILTERS_CHANGED, _searchScopeChanged);
(FindUtils as unknown as DispatcherEvents).on(FindUtils.SEARCH_SCOPE_CHANGED, _searchScopeChanged);
(FindUtils as unknown as DispatcherEvents).on(FindUtils.SEARCH_COLLAPSE_RESULTS, _searchcollapseResults);
(searchDomain as any).on("crawlComplete", nodeFileCacheComplete);
