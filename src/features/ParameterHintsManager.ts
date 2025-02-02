/*
 * Copyright (c) 2019 - 2021 Adobe. All rights reserved.
 * Copyright (c) 2022 - present The quadre code authors. All rights reserved.
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

import * as _ from "lodash";

import * as Commands from "command/Commands";
import * as AppInit from "utils/AppInit";
import * as CommandManager from "command/CommandManager";
import * as EditorManager from "editor/EditorManager";
import * as Menus from "command/Menus";
import * as KeyEvent from "utils/KeyEvent";
import * as Strings from "strings";
import { RegistrationHandler as ProviderRegistrationHandler } from "features/PriorityBasedRegistration";
import { DispatcherEvents } from "utils/EventDispatcher";


/** @const {string} Show Function Hint command ID */
const SHOW_PARAMETER_HINT_CMD_ID = "showParameterHint"; // string must MATCH string in native code (brackets_extensions)
import * as hintContainerHTML from "text!htmlContent/parameter-hint-template.html";
const KeyboardPrefs = {
    "showParameterHint": [
        {
            "key": "Ctrl-Shift-Space"
        },
        {
            "key": "Ctrl-Shift-Space",
            "platform": "mac"
        }
    ]
};

let $hintContainer; // function hint container
let $hintContent; // function hint content holder
let hintState: any = {};
let lastChar: string | null = null;
let sessionEditor: any = null;
let keyDownEditor = null;

// Constants
const POINTER_TOP_OFFSET = 4; // Size of margin + border of hint.
const POSITION_BELOW_OFFSET = 4; // Amount to adjust to top position when the preview bubble is below the text

const _providerRegistrationHandler = new ProviderRegistrationHandler();
export const registerHintProvider = _providerRegistrationHandler.registerProvider.bind(_providerRegistrationHandler);
export const removeHintProvider = _providerRegistrationHandler.removeProvider.bind(_providerRegistrationHandler);

/**
 * Position a function hint.
 *
 * @param {number} xpos
 * @param {number} ypos
 * @param {number} ybot
 */
function positionHint(xpos, ypos, ybot) {
    const hintWidth = $hintContainer.width();
    const hintHeight = $hintContainer.height();
    let top = ypos - hintHeight - POINTER_TOP_OFFSET;
    let left = xpos;
    const $editorHolder = $("#editor-holder");

    if ($editorHolder.offset() === undefined) {
        // this happens in jasmine tests that run
        // without a windowed document.
        return;
    }

    const editorLeft = $editorHolder.offset().left;
    left = Math.max(left, editorLeft);
    left = Math.min(left, editorLeft + $editorHolder.width() - hintWidth);

    if (top < 0) {
        $hintContainer.removeClass("preview-bubble-above");
        $hintContainer.addClass("preview-bubble-below");
        top = ybot + POSITION_BELOW_OFFSET;
        $hintContainer.offset({
            left: left,
            top: top
        });
    } else {
        $hintContainer.removeClass("preview-bubble-below");
        $hintContainer.addClass("preview-bubble-above");
        $hintContainer.offset({
            left: left,
            top: top - POINTER_TOP_OFFSET
        });
    }
}

/**
 * Format the given parameter array. Handles separators between
 * parameters, syntax for optional parameters, and the order of the
 * parameter type and parameter name.
 *
 * @param {!Array.<{name: string, type: string, isOptional: boolean}>} params -
 * array of parameter descriptors
 * @param {function(string)=} appendSeparators - callback function to append separators.
 * The separator is passed to the callback.
 * @param {function(string, number)=} appendParameter - callback function to append parameter.
 * The formatted parameter type and name is passed to the callback along with the
 * current index of the parameter.
 * @param {boolean=} typesOnly - only show parameter types. The
 * default behavior is to include both parameter names and types.
 * @return {string} - formatted parameter hint
 */
function _formatParameterHint(params, appendSeparators, appendParameter, typesOnly?: boolean) {
    let result = "";
    let pendingOptional = false;

    appendParameter("(", "", -1);
    params.forEach(function (value, i) {
        let param = value.label || value.type;
        const documentation = value.documentation;
        let separators = "";

        if (value.isOptional) {
            // if an optional param is following by an optional parameter, then
            // terminate the bracket. Otherwise enclose a required parameter
            // in the same bracket.
            if (pendingOptional) {
                separators += "]";
            }

            pendingOptional = true;
        }

        if (i > 0) {
            separators += ", ";
        }

        if (value.isOptional) {
            separators += "[";
        }

        if (appendSeparators) {
            appendSeparators(separators);
        }

        result += separators;

        if (!typesOnly && value.name) {
            param += " " + value.name;
        }

        if (appendParameter) {
            appendParameter(param, documentation, i);
        }

        result += param;

    });

    if (pendingOptional) {
        if (appendSeparators) {
            appendSeparators("]");
        }

        result += "]";
    }
    appendParameter(")", "", -1);

    return result;
}

/**
 *  Bold the parameter at the caret.
 *
 *  @param {{inFunctionCall: boolean, functionCallPos: {line: number, ch: number}}} functionInfo -
 *  tells if the caret is in a function call and the position
 *  of the function call.
 */
function formatHint(hints) {
    $hintContent.empty();
    $hintContent.addClass("brackets-hints");

    function appendSeparators(separators) {
        $hintContent.append(separators);
    }

    function appendParameter(param, documentation, index) {
        if (hints.currentIndex === index) {
            $hintContent.append($("<span>")
                .append(_.escape(param))
                .addClass("current-parameter"));
        } else {
            $hintContent.append($("<span>")
                .append(_.escape(param))
                .addClass("parameter"));
        }
    }

    if (hints.parameters.length > 0) {
        _formatParameterHint(hints.parameters, appendSeparators, appendParameter);
    } else {
        $hintContent.append(_.escape(Strings.NO_ARGUMENTS));
    }
}

/**
 * Dismiss the function hint.
 *
 */
function dismissHint(editor?) {
    if (hintState.visible) {
        $hintContainer.hide();
        $hintContent.empty();
        hintState = {};

        if (editor) {
            editor.off("cursorActivity.ParameterHinting", handleCursorActivity);
            sessionEditor = null;
        } else if (sessionEditor) {
            sessionEditor.off("cursorActivity.ParameterHinting", handleCursorActivity);
            sessionEditor = null;
        }
    }
}

/**
 * Pop up a function hint on the line above the caret position.
 *
 * @param {object=} editor - current Active Editor
 * @param {boolean} explicit - true if hints are invoked through cursor activity.
 * @return {jQuery.Promise} - The promise will not complete until the
 *      hint has completed. Returns null, if the function hint is already
 *      displayed or there is no function hint at the cursor.
 *
 */
function popUpHint(editor, explicit?, onCursorActivity?) {
    let request: any = null;
    const $deferredPopUp = $.Deferred();
    let sessionProvider: any = null;

    dismissHint(editor);
    // Find a suitable provider, if any
    const language = editor.getLanguageForSelection();
    const enabledProviders = _providerRegistrationHandler.getProvidersForLanguageId(language.getId());

    enabledProviders.some(function (item, index) {
        if (item.provider.hasParameterHints(editor, lastChar)) {
            sessionProvider = item.provider;
            return true;
        }

        return false;
    });

    if (sessionProvider) {
        request = sessionProvider.getParameterHints(explicit, onCursorActivity);
    }

    if (request) {
        request.done(function (parameterHint) {
            const cm = editor._codeMirror;
            let pos = parameterHint.functionCallPos || editor.getCursorPos();

            pos = cm.charCoords(pos);
            formatHint(parameterHint);

            $hintContainer.show();
            positionHint(pos.left, pos.top, pos.bottom);
            hintState.visible = true;

            sessionEditor = editor;
            editor.on("cursorActivity.ParameterHinting", handleCursorActivity);
            $deferredPopUp.resolveWith(null);
        }).fail(function () {
            hintState = {};
        });
    }

    return $deferredPopUp;
}

/**
 *  Show the parameter the cursor is on in bold when the cursor moves.
 *  Dismiss the pop up when the cursor moves off the function.
 */
function handleCursorActivity(event, editor) {
    if (editor) {
        popUpHint(editor, false, true);
    } else {
        dismissHint();
    }
}

/**
 * Install function hint listeners.
 *
 * @param {Editor} editor - editor context on which to listen for
 *      changes
 */
function installListeners(editor) {
    editor.on("keydown.ParameterHinting", function (event, editor, domEvent) {
        if (domEvent.keyCode === KeyEvent.DOM_VK_ESCAPE) {
            dismissHint(editor);
        }
    })
        .on("scroll.ParameterHinting", function () {
            dismissHint(editor);
        })
        .on("editorChange.ParameterHinting", _handleChange)
        .on("keypress.ParameterHinting", _handleKeypressEvent);
}

/**
 * Clean up after installListeners()
 * @param {!Editor} editor
 */
function uninstallListeners(editor) {
    editor.off(".ParameterHinting");
}

function _handleKeypressEvent(jqEvent, editor, event) {
    keyDownEditor = editor;
    // Last inserted character, used later by handleChange
    lastChar = String.fromCharCode(event.charCode);
}

/**
 * Start a new implicit hinting session, or update the existing hint list.
 * Called by the editor after handleKeyEvent, which is responsible for setting
 * the lastChar.
 *
 * @param {Event} event
 * @param {Editor} editor
 * @param {{from: Pos, to: Pos, text: Array, origin: string}} changeList
 */
function _handleChange(event, editor, changeList) {
    if (lastChar && (lastChar === "(" || lastChar === ",") && editor === keyDownEditor) {
        keyDownEditor = null;
        popUpHint(editor);
    }
}

function activeEditorChangeHandler(event, current, previous) {

    if (previous) {
        // Removing all old Handlers
        previous.document
            .off("languageChanged.ParameterHinting");
        uninstallListeners(previous);
    }

    if (current) {
        current.document
            .on("languageChanged.ParameterHinting", function () {
                // If current doc's language changed, reset our state by treating it as if the user switched to a
                // different document altogether
                uninstallListeners(current);
                installListeners(current);
            });
        installListeners(current);
    }
}

/**
 * Show a parameter hint in its own pop-up.
 *
 */
function handleShowParameterHint() {
    const editor = EditorManager.getActiveEditor();
    // Pop up function hint
    popUpHint(editor, true, false);
}

AppInit.appReady(function () {
    CommandManager.register(Strings.CMD_SHOW_PARAMETER_HINT, SHOW_PARAMETER_HINT_CMD_ID, handleShowParameterHint);

    // Add the menu items
    const menu = Menus.getMenu(Menus.AppMenuBar.EDIT_MENU);
    if (menu) {
        menu.addMenuItem(SHOW_PARAMETER_HINT_CMD_ID, KeyboardPrefs.showParameterHint, Menus.AFTER, Commands.SHOW_CODE_HINTS);
    }
    // Create the function hint container
    $hintContainer = $(hintContainerHTML).appendTo($("body"));
    $hintContent = $hintContainer.find(".function-hint-content-new");
    activeEditorChangeHandler(null, EditorManager.getActiveEditor(), null);

    (EditorManager as unknown as DispatcherEvents).on("activeEditorChange", activeEditorChangeHandler);

    (CommandManager as unknown as DispatcherEvents).on("beforeExecuteCommand", function (event, commandId) {
        if (commandId !== SHOW_PARAMETER_HINT_CMD_ID &&
            commandId !== Commands.SHOW_CODE_HINTS) {
            dismissHint();
        }
    });
});
