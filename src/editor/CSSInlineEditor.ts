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

// Load dependent modules
import * as CSSUtils from "language/CSSUtils";
import { DropdownButton } from "widgets/DropdownButton";
import * as CommandManager from "command/CommandManager";
import * as Commands from "command/Commands";
import * as DocumentManager from "document/DocumentManager";
import * as EditorManager from "editor/EditorManager";
import { Editor } from "editor/Editor";
import * as LanguageManager from "language/LanguageManager";
import * as ProjectManager from "project/ProjectManager";
import * as FileUtils from "file/FileUtils";
import * as HTMLUtils from "language/HTMLUtils";
import { MultiRangeInlineEditor, getFocusedMultiRangeInlineEditor } from "editor/MultiRangeInlineEditor";
import * as Strings from "strings";
import * as ViewUtils from "utils/ViewUtils";
import * as HealthLogger from "utils/HealthLogger";
import * as _ from "lodash";
import File = require("filesystem/File");

interface FileNameMap {
    [fileName: string]: Array<File>;
}

interface RuleHandler {
    inlineEditor: MultiRangeInlineEditor;
    handler: (e?) => void;
}

const _newRuleHandlers: Array<RuleHandler> = [];

function _getCSSFilesInProject(): JQueryPromise<Array<File>> {
    return ProjectManager.getAllFiles(ProjectManager.getLanguageFilter(["css", "less", "scss"]));
}

/**
 * Given a position in an HTML editor, returns the relevant selector for the attribute/tag
 * surrounding that position, or "" if none is found.
 * @param {!Editor} editor
 * @param {!{line:Number, ch:Number}} pos
 * @return {selectorName: {string}, reason: {string}}
 * @private
 */
function _getSelectorName(editor, pos) {
    const tagInfo = HTMLUtils.getTagInfo(editor, pos);
    let selectorName = "";
    let reason;

    if (tagInfo.position.tokenType === HTMLUtils.TAG_NAME || tagInfo.position.tokenType === HTMLUtils.CLOSING_TAG) {
        // Type selector
        selectorName = tagInfo.tagName;
    } else if (tagInfo.position.tokenType === HTMLUtils.ATTR_NAME ||
               tagInfo.position.tokenType === HTMLUtils.ATTR_VALUE) {
        if (tagInfo.attr.name === "class") {
            // Class selector. We only look for the class name
            // that includes the insertion point. For example, if
            // the attribute is:
            //   class="error-dialog modal hide"
            // and the insertion point is inside "modal", we want ".modal"
            const attributeValue = tagInfo.attr.value;
            if (/\S/.test(attributeValue)) {
                const startIndex = attributeValue.substr(0, tagInfo.position.offset).lastIndexOf(" ");
                const endIndex = attributeValue.indexOf(" ", tagInfo.position.offset);
                selectorName = "." +
                    attributeValue.substring(
                        startIndex === -1 ? 0 : startIndex + 1,
                        endIndex === -1 ? attributeValue.length : endIndex
                    );

                // If the insertion point is surrounded by space between two classnames, selectorName is "."
                if (selectorName === ".") {
                    selectorName = "";
                    reason = Strings.ERROR_CSSQUICKEDIT_BETWEENCLASSES;
                }
            } else {
                reason = Strings.ERROR_CSSQUICKEDIT_CLASSNOTFOUND;
            }
        } else if (tagInfo.attr.name === "id") {
            // ID selector
            const trimmedVal = tagInfo.attr.value.trim();
            if (trimmedVal) {
                selectorName = "#" + trimmedVal;
            } else {
                reason = Strings.ERROR_CSSQUICKEDIT_IDNOTFOUND;
            }
        } else {
            reason = Strings.ERROR_CSSQUICKEDIT_UNSUPPORTEDATTR;
        }
    }

    return {
        selectorName: selectorName,
        reason:       reason
    };
}

/**
 * @private
 * Add a new rule for the given selector to the given stylesheet, then add the rule to the
 * given inline editor.
 * @param {string} selectorName The selector to create a rule for.
 * @param {MultiRangeInlineEditor} inlineEditor The inline editor to display the new rule in.
 * @param {string} path The path to the stylesheet file.
 */
function _addRule(selectorName, inlineEditor, path) {
    DocumentManager.getDocumentForPath(path).done(function (styleDoc) {
        const newRuleInfo = CSSUtils.addRuleToDocument(styleDoc, selectorName, Editor.getUseTabChar(path), Editor.getSpaceUnits(path));
        inlineEditor.addAndSelectRange(selectorName, styleDoc, newRuleInfo.range.from.line, newRuleInfo.range.to.line);
        inlineEditor.editor.setCursorPos(newRuleInfo.pos.line, newRuleInfo.pos.ch);
    });
}

/**
 * @private
 * Handle the "new rule" menu item by dispatching it to the handler for the focused inline editor.
 */
function _handleNewRule() {
    const inlineEditor = getFocusedMultiRangeInlineEditor();
    if (inlineEditor) {
        const handlerInfo = _.find(_newRuleHandlers, function (entry) {
            return entry.inlineEditor === inlineEditor;
        });
        if (handlerInfo) {
            handlerInfo.handler();
        }
    }
}

/** Item renderer for stylesheet-picker dropdown */
function _stylesheetListRenderer(item) {
    let html = "<span class='stylesheet-name'>" + _.escape(item.name);
    if (item.subDirStr) {
        html += "<span class='stylesheet-dir'> — " + _.escape(item.subDirStr) + "</span>";
    }
    html += "</span>";
    return html;
}

/**
 * This function is registered with EditManager as an inline editor provider. It creates a CSSInlineEditor
 * when cursor is on an HTML tag name, class attribute, or id attribute, find associated
 * CSS rules and show (one/all of them) in an inline editor.
 *
 * @param {!Editor} editor
 * @param {!{line:Number, ch:Number}} pos
 * @return {?$.Promise} synchronously resolved with an InlineWidget; or error
 *         {string} if pos is in tag but not in tag name, class attr, or id attr; or null if the
 *         selection isn't even close to a context where we could provide anything.
 */
function htmlToCSSProvider(hostEditor, pos) {

    // Only provide a CSS editor when cursor is in HTML content
    if (hostEditor.getLanguageForSelection().getId() !== "html") {
        return null;
    }

    // Send analytics data for QuickEdit open
    HealthLogger.sendAnalyticsData(
        "QuickEditOpen",
        "usage",
        "quickEdit",
        "open"
    );

    // Only provide CSS editor if the selection is within a single line
    const sel = hostEditor.getSelection();
    if (sel.start.line !== sel.end.line) {
        return null;
    }

    // Always use the selection start for determining selector name. The pos
    // parameter is usually the selection end.
    const selectorResult = _getSelectorName(hostEditor, sel.start);
    if (selectorResult.selectorName === "") {
        return selectorResult.reason || null;
    }

    const selectorName = selectorResult.selectorName;

    const result = $.Deferred();
    let cssInlineEditor;
    let cssFileInfos: Array<File> = [];
    let newRuleButton;

    /**
     * @private
     * Callback when item from dropdown list is selected
     */
    function _onDropdownSelect(event, fileInfo) {
        _addRule(selectorName, cssInlineEditor, fileInfo.fullPath);
    }

    /**
     * @private
     * Checks to see if there are any stylesheets in the project, and returns the appropriate
     * "no rules"/"no stylesheets" message accordingly.
     * @return {$.Promise} a promise that is resolved with the message to show. Never rejected.
     */
    function _getNoRulesMsg() {
        const result = $.Deferred();
        _getCSSFilesInProject().done(function (fileInfos: Array<File>) {
            result.resolve(fileInfos.length ? Strings.CSS_QUICK_EDIT_NO_MATCHES : Strings.CSS_QUICK_EDIT_NO_STYLESHEETS);
        });
        return result;
    }

    /**
     * @private
     * Update the enablement of associated menu commands.
     */
    function _updateCommands() {
        _newRuleCmd!.setEnabled(cssInlineEditor.hasFocus() && !newRuleButton.$button.hasClass("disabled"));
    }

    /**
     * @private
     * Create a new rule on click.
     */
    function _handleNewRuleClick(e) {
        if (!newRuleButton.$button.hasClass("disabled")) {
            if (cssFileInfos.length === 1) {
                // Just go ahead and create the rule.
                _addRule(selectorName, cssInlineEditor, cssFileInfos[0].fullPath);
            } else {
                // Although not attached to button click in 'dropdown mode', this handler can still be
                // invoked via the command shortcut. Just toggle dropdown open/closed in that case.
                newRuleButton.toggleDropdown();
            }
        }
    }

    /**
     * @private
     * Sort files with LESS/SCSS above CSS, and then within each grouping sort by path & filename
     * (the same order we use for Find in Files)
     * @param {!File} a, b
     * @return {number}
     */
    function _fileComparator(a, b) {
        const aIsCSS = LanguageManager.getLanguageForPath(a.fullPath).getId() === "css";
        const bIsCSS = LanguageManager.getLanguageForPath(b.fullPath).getId() === "css";
        if (aIsCSS && !bIsCSS) {
            return 1;
        }

        if (!aIsCSS && bIsCSS) {
            return -1;
        }

        return FileUtils.comparePaths(a.fullPath, b.fullPath);
    }

    /**
     * @private
     * Prepare file list for display
     */
    function _prepFileList(files: Array<File>): Array<File> {
        // First, sort list (the same ordering we use for the results list)
        files.sort(_fileComparator);

        // Find any files that share the same name (with different path)
        const fileNames: FileNameMap = {};
        files.forEach(function (file) {
            if (!fileNames[file.name]) {
                fileNames[file.name] = [];
            }
            fileNames[file.name].push(file);
        });

        // For any duplicate filenames, set subDirStr to a path snippet the helps
        // the user distinguish each file in the list.
        _.forEach(fileNames, function (files) {
            if (files.length > 1) {
                const displayPaths = ViewUtils.getDirNamesForDuplicateFiles(files);
                files.forEach(function (file, i) {
                    file.subDirStr = displayPaths[i];
                });
            }
        });

        return files;
    }

    function _onHostEditorScroll() {
        newRuleButton.closeDropdown();
    }

    CSSUtils.findMatchingRules(selectorName, hostEditor.document)
        .done(function (rules) {
            const inlineEditorDeferred = $.Deferred();
            cssInlineEditor = new MultiRangeInlineEditor(
                CSSUtils.consolidateRules(rules!),
                _getNoRulesMsg, CSSUtils.getRangeSelectors,
                _fileComparator
            );
            cssInlineEditor.load(hostEditor);
            cssInlineEditor.$htmlContent
                .on("focusin", _updateCommands)
                .on("focusout", _updateCommands);
            cssInlineEditor.on("add", function () {
                inlineEditorDeferred.resolve();
            });
            cssInlineEditor.on("close", function () {
                newRuleButton.closeDropdown();
                hostEditor.off("scroll", _onHostEditorScroll);
            });

            const $header = $(".inline-editor-header", cssInlineEditor.$htmlContent);
            newRuleButton = new DropdownButton(Strings.BUTTON_NEW_RULE, [], _stylesheetListRenderer); // actual item list populated later, below
            newRuleButton.$button.addClass("disabled");  // disabled until list is known
            newRuleButton.$button.addClass("btn-mini stylesheet-button");
            $header.append(newRuleButton.$button);
            _newRuleHandlers.push({inlineEditor: cssInlineEditor, handler: _handleNewRuleClick});

            hostEditor.on("scroll", _onHostEditorScroll);

            result.resolve(cssInlineEditor);


            // Now that dialog has been built, collect list of stylesheets
            const stylesheetsPromise = _getCSSFilesInProject();

            // After both the stylesheets are loaded and the inline editor has been added to the DOM,
            // update the UI accordingly. (Those can happen in either order, so we need to wait for both.)
            // Note that the stylesheetsPromise needs to be passed first in order for the fileInfos to be
            // properly passed to the handler, since $.when() passes the results in order of the argument
            // list.
            $.when(stylesheetsPromise, inlineEditorDeferred.promise())
                .done(function (fileInfos: Array<File>) {
                    cssFileInfos = _prepFileList(fileInfos);

                    // "New Rule" button is disabled by default and gets enabled
                    // here if there are any stylesheets in project
                    if (cssFileInfos.length > 0) {
                        newRuleButton.$button.removeClass("disabled");
                        if (!rules!.length) {
                            // Force focus to the button so the user can create a new rule from the keyboard.
                            newRuleButton.$button.focus();
                        }

                        if (cssFileInfos.length === 1) {
                            // Make it look & feel like a plain button in this case
                            newRuleButton.$button.removeClass("btn-dropdown");
                            newRuleButton.$button.on("click", _handleNewRuleClick);
                        } else {
                            // Fill out remaining dropdown attributes otherwise
                            newRuleButton.items = cssFileInfos;
                            newRuleButton.on("select", _onDropdownSelect);
                        }
                    }

                    _updateCommands();
                });
        })
        .fail(function (error) {
            console.warn("Error in findMatchingRules()", error);
            result.reject();
        });

    return result.promise();
}

EditorManager.registerInlineEditProvider(htmlToCSSProvider);

const _newRuleCmd = CommandManager.register(Strings.CMD_CSS_QUICK_EDIT_NEW_RULE, Commands.CSS_QUICK_EDIT_NEW_RULE, _handleNewRule);
_newRuleCmd!.setEnabled(false);
