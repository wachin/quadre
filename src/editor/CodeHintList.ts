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
import * as KeyBindingManager from "command/KeyBindingManager";
import * as Menus from "command/Menus";
import * as KeyEvent from "utils/KeyEvent";
import * as StringUtils from "utils/StringUtils";
import * as ValidationUtils from "utils/ValidationUtils";
import * as ViewUtils from "utils/ViewUtils";
import * as PopUpManager from "widgets/PopUpManager";
import * as Mustache from "thirdparty/mustache/mustache";

import * as CodeHintListHTML from "text!htmlContent/code-hint-list.html";


interface Hint {
    handleWideResults?;
    jquery?;
    formattedHint?;
}

interface HintArray<T> extends Array<T> {
    handleWideResults?;
}

export interface HintObject<T> {
    match: string | null;
    selectInitial: boolean;
    hints: HintArray<T>;
    handleWideResults;
    enableDescription: boolean;
}

interface ViewHints {
    hints: Array<Hint>;
}

/**
 * Displays a popup list of hints for a given editor context.
 *
 * @constructor
 * @param {Editor} editor
 * @param {boolean} insertHintOnTab Whether pressing tab inserts the selected hint
 * @param {number} maxResults Maximum hints displayed at once. Defaults to 50
 */
export class CodeHintList {
    /**
     * The list of hints to display
     *
     * @type {Array.<string|jQueryObject>}
     */
    public hints: HintArray<Hint> = [];

    /**
     * The selected position in the list; otherwise -1.
     *
     * @type {number}
     */
    public selectedIndex = -1;

    /**
     * The maximum number of hints to display. Can be overriden via maxCodeHints pref
     *
     * @type {number}
     */
    public maxResults;

    /**
     * Is the list currently open?
     *
     * @type {boolean}
     */
    public opened = false;

    /**
     * The editor context
     *
     * @type {Editor}
     */
    public editor;

    /**
     * Whether the currently selected hint should be inserted on a tab key event
     *
     * @type {boolean}
     */
    public insertHintOnTab;

    /**
     * Pending text insertion
     *
     * @type {string}
     */
    public pendingText = "";

    /**
     * The hint selection callback function
     *
     * @type {Function}
     */
    public handleSelect;

    /**
     * The hint list highlight callback function
     *
     * @type {Function}
     */
    private handleHighlight: (item: any, codeHintDesc: any) => void;

    /**
     * The hint list closure callback function
     *
     * @type {Function}
     */
    public handleClose;

    /**
     * The hint list menu object
     *
     * @type {jQuery.Object}
     */
    public $hintMenu;

    public enableDescription: boolean;

    constructor(editor, insertHintOnTab, maxResults) {
        this.maxResults = ValidationUtils.isIntegerInRange(maxResults, 1, 1000) ? maxResults : 50;
        this.editor = editor;
        this.insertHintOnTab = insertHintOnTab;

        this.$hintMenu =
            $("<li class='dropdown codehint-menu'></li>")
                .append($("<a href='#' class='dropdown-toggle' data-toggle='dropdown'></a>")
                    .hide())
                .append("<ul class='dropdown-menu'></ul>");

        this._keydownHook = this._keydownHook.bind(this);
    }

    /**
     * Select the item in the hint list at the specified index, or remove the
     * selection if index < 0.
     *
     * @private
     * @param {number} index
     */
    private _setSelectedIndex(index) {
        const items = this.$hintMenu.find("li");

        // Range check
        index = Math.max(-1, Math.min(index, items.length - 1));

        // Clear old highlight
        if (this.selectedIndex !== -1) {
            $(items[this.selectedIndex]).find("a").removeClass("highlight");
        }

        this.selectedIndex = index;

        // Highlight the new selected item, if necessary
        if (this.selectedIndex !== -1) {
            const $item = $(items[this.selectedIndex]);
            const $view = this.$hintMenu.find("ul.dropdown-menu");

            $item.find("a").addClass("highlight");
            ViewUtils.scrollElementIntoView($view, $item, false);

            if (this.handleHighlight) {
                this.handleHighlight($item.find("a"), this.$hintMenu.find("#codehint-desc"));
            }
        }
    }

    /**
     * Appends text to end of pending text.
     *
     * @param {string} text
     */
    public addPendingText(text) {
        this.pendingText += text;
    }

    /**
     * Removes text from beginning of pending text.
     *
     * @param {string} text
     */
    public removePendingText(text) {
        if (this.pendingText.indexOf(text) === 0) {
            this.pendingText = this.pendingText.slice(text.length);
        }
    }

    /**
     * Rebuilds the list items for the hint list.
     *
     * @private
     */
    private _buildListView(hintObj: HintObject<Hint>) {
        const self            = this;
        const match           = hintObj.match;
        const selectInitial   = hintObj.selectInitial;
        const view: ViewHints = { hints: [] };
        let _addHint;

        this.hints = hintObj.hints;
        this.hints.handleWideResults = hintObj.handleWideResults;
        this.enableDescription = hintObj.enableDescription;

        // if there is no match, assume name is already a formatted jQuery
        // object; otherwise, use match to format name for display.
        if (match) {
            _addHint = function (name) {
                const displayName = name.replace(
                    new RegExp(StringUtils.regexEscape(match), "i"),
                    "<strong>$&</strong>"
                );

                view.hints.push({ formattedHint: "<span>" + displayName + "</span>" });
            };
        } else {
            _addHint = function (hint) {
                view.hints.push({ formattedHint: (hint.jquery) ? "" : hint });
            };
        }

        // clear the list
        this.$hintMenu.find("li").remove();

        // if there are no hints then close the list; otherwise add them and
        // set the selection
        if (this.hints.length === 0) {
            if (this.handleClose) {
                this.handleClose();
            }
        } else {
            for (let index = 0; index < this.hints.length; index++) {
                if (index >= self.maxResults) {
                    break;
                }

                const item = this.hints[index];
                _addHint(item);
            }

            // render code hint list
            const $ul = this.$hintMenu.find("ul.dropdown-menu");
            const $parent = $ul.parent();

            // remove list temporarily to save rendering time
            $ul.remove().append(Mustache.render(CodeHintListHTML, view));

            $ul.children("li").each(function (index, element) {
                const hint        = self.hints[index];
                const $element    = $(element);

                // store hint on each list item
                $element.data("hint", hint);

                // insert jQuery hint objects after the template is rendered
                if (hint.jquery) {
                    $element.find(".codehint-item").append(hint as any);
                }
            });

            // delegate list item events to the top-level ul list element
            $ul.on("click", "li", function (this: CodeHintList, e) {
                // Don't let the click propagate upward (otherwise it will
                // hit the close handler in bootstrap-dropdown).
                e.stopPropagation();
                if (self.handleSelect) {
                    self.handleSelect($(this).data("hint"));
                }
            });

            // Lists with wide results require different formatting
            if (this.hints.handleWideResults) {
                $ul.find("li a").addClass("wide-result");
            }

            // attach to DOM
            $parent.append($ul);

            // If a a description field requested attach one
            if (this.enableDescription) {
                // Remove the desc element first to ensure DOM order
                $parent.find("#codehint-desc").remove();
                $parent.append("<div id='codehint-desc' class='dropdown-menu quiet-scrollbars'></div>");
                $ul.addClass("withDesc");
            }
            this._setSelectedIndex(selectInitial ? 0 : -1);
        }
    }

    /**
     * Computes top left location for hint list so that the list is not clipped by the window.
     * Also computes the largest available width.
     *
     * @private
     * @return {{left: number, top: number, width: number}}
     */
    private _calcHintListLocation() {
        const cursor      = this.editor._codeMirror.cursorCoords();
        let posTop        = cursor.bottom;
        let posLeft       = cursor.left;
        const textHeight  = this.editor.getTextHeight();
        const $window     = $(window);
        const $menuWindow = this.$hintMenu.children("ul");
        const $descElement = this.$hintMenu.find("#codehint-desc");
        const descOverhang = $descElement.length === 1 ? $descElement.height() : 0;
        const menuHeight  = $menuWindow.outerHeight() + descOverhang;

        // TODO Ty: factor out menu repositioning logic so code hints and Context menus share code
        // adjust positioning so menu is not clipped off bottom or right
        const bottomOverhang = posTop + menuHeight - $window.height();
        if (bottomOverhang > 0) {
            posTop -= (textHeight + 2 + menuHeight);
        }

        posTop -= 30;   // shift top for hidden parent element

        const menuWidth = $menuWindow.width();
        let availableWidth = menuWidth;
        const rightOverhang = posLeft + menuWidth - $window.width();
        if (rightOverhang > 0) {
            posLeft = Math.max(0, posLeft - rightOverhang);
        } else if (this.hints.handleWideResults) {
            // Right overhang is negative
            availableWidth = menuWidth + Math.abs(rightOverhang);
        }

        // Creating the offset element for hint description element
        let descOffset = this.$hintMenu.find("ul.dropdown-menu")[0].getBoundingClientRect().height;
        if (descOffset === 0) {
            descOffset = menuHeight - descOverhang;
        }
        this.$hintMenu.find("#codehint-desc").css("margin-top", descOffset - 1);

        return {left: posLeft, top: posTop, width: availableWidth};
    }

    /**
     * Check whether Event is one of the keys that we handle or not.
     *
     * @param {KeyBoardEvent|keyBoardEvent.keyCode} keyEvent
     */
    public isHandlingKeyCode(keyCodeOrEvent) {
        const keyCode = typeof keyCodeOrEvent === "object" ? keyCodeOrEvent.keyCode : keyCodeOrEvent;
        const ctrlKey = typeof keyCodeOrEvent === "object" ? keyCodeOrEvent.ctrlKey : false;


        return (keyCode === KeyEvent.DOM_VK_UP || keyCode === KeyEvent.DOM_VK_DOWN ||
                keyCode === KeyEvent.DOM_VK_PAGE_UP || keyCode === KeyEvent.DOM_VK_PAGE_DOWN ||
                keyCode === KeyEvent.DOM_VK_RETURN ||
                keyCode === KeyEvent.DOM_VK_CONTROL ||
                keyCode === KeyEvent.DOM_VK_ESCAPE ||
                (ctrlKey && keyCode === KeyEvent.DOM_VK_SPACE) ||
                (keyCode === KeyEvent.DOM_VK_TAB && this.insertHintOnTab));
    }

    /**
     * Convert keydown events into hint list navigation actions.
     *
     * @param {KeyBoardEvent} keyEvent
     * @param {bool} isFakeKeydown - True if faked key down call (for example calling CTRL+Space while hints are open)
     */
    private _keydownHook(event, isFakeKeydown) {
        let keyCode;
        const self = this;

        // positive distance rotates down; negative distance rotates up
        function _rotateSelection(distance) {
            const len = Math.min(self.hints.length, self.maxResults);
            let pos;

            if (self.selectedIndex < 0) {
                // set the initial selection
                pos = (distance > 0) ? distance - 1 : len - 1;

            } else {
                // adjust current selection
                pos = self.selectedIndex;

                // Don't "rotate" until all items have been shown
                if (distance > 0) {
                    if (pos === (len - 1)) {
                        pos = 0;  // wrap
                    } else {
                        pos = Math.min(pos + distance, len - 1);
                    }
                } else {
                    if (pos === 0) {
                        pos = (len - 1);  // wrap
                    } else {
                        pos = Math.max(pos + distance, 0);
                    }
                }
            }

            self._setSelectedIndex(pos);
        }

        // Calculate the number of items per scroll page.
        function _itemsPerPage() {
            let itemsPerPage = 1;
            const $items = self.$hintMenu.find("li");
            const $view = self.$hintMenu.find("ul.dropdown-menu");
            let itemHeight;

            if ($items.length !== 0) {
                itemHeight = $($items[0]).height();
                if (itemHeight) {
                    // round down to integer value
                    itemsPerPage = Math.floor($view.height() / itemHeight);
                    itemsPerPage = Math.max(1, Math.min(itemsPerPage, $items.length));
                }
            }

            return itemsPerPage;
        }

        // If we're no longer visible, skip handling the key and end the session.
        if (!this.isOpen()) {
            this.handleClose();
            return false;
        }

        // (page) up, (page) down, enter and tab key are handled by the list
        if ((event.type === "keydown" || isFakeKeydown) && this.isHandlingKeyCode(event)) {
            keyCode = event.keyCode;

            if (event.keyCode === KeyEvent.DOM_VK_ESCAPE) {
                event.stopImmediatePropagation();
                this.handleClose();

                return false;
            }

            if (event.shiftKey &&
                    (event.keyCode === KeyEvent.DOM_VK_UP ||
                     event.keyCode === KeyEvent.DOM_VK_DOWN ||
                     event.keyCode === KeyEvent.DOM_VK_PAGE_UP ||
                     event.keyCode === KeyEvent.DOM_VK_PAGE_DOWN)) {
                this.handleClose();
                // Let the event bubble.
                return false;
            }

            if (keyCode === KeyEvent.DOM_VK_UP) {
                _rotateSelection.call(this, -1);
            } else if (keyCode === KeyEvent.DOM_VK_DOWN ||
                    (event.ctrlKey && keyCode === KeyEvent.DOM_VK_SPACE)) {
                _rotateSelection.call(this, 1);
            } else if (keyCode === KeyEvent.DOM_VK_PAGE_UP) {
                _rotateSelection.call(this, -_itemsPerPage());
            } else if (keyCode === KeyEvent.DOM_VK_PAGE_DOWN) {
                _rotateSelection.call(this, _itemsPerPage());
            } else if (this.selectedIndex !== -1 &&
                    (keyCode === KeyEvent.DOM_VK_RETURN ||
                    (keyCode === KeyEvent.DOM_VK_TAB && this.insertHintOnTab))) {

                if (this.pendingText) {
                    // Issues #5003: We received a "selection" key while there is "pending
                    // text". This is rare but can happen because CM uses polling, so we
                    // can receive key events while CM is waiting for timeout to expire.
                    // Pending text may dismiss the list, or it may cause a valid selection
                    // which keeps open hint list. We can compare pending text against
                    // list to determine whether list is dismissed or not, but to handle
                    // inserting selection in the page we'd need to either:
                    // 1. Synchronously force CodeMirror to poll (but there is not
                    //    yet a public API for that).
                    // 2. Pass pending text back to where text gets inserted, which
                    //    means it would need to be implemented for every HintProvider!
                    // You have to be typing so fast to hit this case, that's it's
                    // highly unlikely that inserting something from list was the intent,
                    // which makes this pretty rare, so case #2 is not worth implementing.
                    // If case #1 gets implemented, then we may want to use it here.
                    // So, assume that pending text dismisses hints and let event bubble.
                    return false;
                }

                // Trigger a click handler to commmit the selected item
                $(this.$hintMenu.find("li")[this.selectedIndex]).trigger("click");
            } else {
                // Let the event bubble.
                return false;
            }

            event.stopImmediatePropagation();
            event.preventDefault();
            return true;
        }

        // If we didn't handle it, let other global keydown hooks handle it.
        return false;
    }

    /**
     * Is the CodeHintList open?
     *
     * @return {boolean}
     */
    public isOpen() {
        // We don't get a notification when the dropdown closes. The best
        // we can do is keep an "opened" flag and check to see if we
        // still have the "open" class applied.
        if (this.opened && !this.$hintMenu.hasClass("open")) {
            this.opened = false;
        }

        return this.opened;
    }

    /**
     * Displays the hint list at the current cursor position
     *
     * @param {{hints: Array.<string|jQueryObject>, match: string,
     *          selectInitial: boolean}} hintObj
     */
    public open(hintObj) {
        Menus.closeAll();
        this._buildListView(hintObj);

        if (this.hints.length) {
            // Need to add the menu to the DOM before trying to calculate its ideal location.
            $("#codehint-menu-bar > ul").append(this.$hintMenu);

            const hintPos = this._calcHintListLocation();

            this.$hintMenu.addClass("open")
                .css({"left": hintPos.left, "top": hintPos.top, "width": hintPos.width + "px"});
            this.opened = true;

            KeyBindingManager.addGlobalKeydownHook(this._keydownHook);
        }
    }

    /**
     * Updates the (already open) hint list window with new hints
     *
     * @param {{hints: Array.<string|jQueryObject>, match: string,
     *          selectInitial: boolean}} hintObj
     */
    public update(hintObj) {
        this.$hintMenu.addClass("apply-transition");
        this._buildListView(hintObj);

        // Update the CodeHintList location
        if (this.hints.length) {
            const hintPos = this._calcHintListLocation();
            this.$hintMenu.css({"left": hintPos.left, "top": hintPos.top,
                "width": hintPos.width + "px"});
        }
    }
    /**
     * Calls the move up keybind to move hint suggestion selector
     *
     * @param {KeyBoardEvent} keyEvent
     */
    public callMoveUp(event) {
        this._keydownHook(event, true);
    }

    /**
     * Closes the hint list
     */
    public close() {
        this.opened = false;

        if (this.$hintMenu) {
            this.$hintMenu.removeClass("open");
            PopUpManager.removePopUp(this.$hintMenu);
            this.$hintMenu.remove();
        }

        KeyBindingManager.removeGlobalKeydownHook(this._keydownHook);
    }

    /**
     * Set the hint list selection callback function
     *
     * @param {Function} callback
     */
    public onSelect(callback) {
        this.handleSelect = callback;
    }

    /**
     * Set the hint list highlight callback function
     *
     * @param {Function} callback
     */
    public onHighlight(callback): void {
        this.handleHighlight = callback;
    }

    /**
     * Set the hint list closure callback function
     *
     * @param {Function} callback
     */
    public onClose(callback) {
        // TODO: Due to #1381, this won't get called if the user clicks out of
        // the code hint menu. That's (sort of) okay right now since it doesn't
        // really matter if a single old invisible code hint list is lying
        // around (it will ignore keydown events, and it'll get closed the next
        // time the user pops up a code hint). Once #1381 is fixed this issue
        // should go away.
        this.handleClose = callback;
    }
}
