/*jshint globalstrict:true, node:true*/

"use strict";

var _ = require("lodash");
var main = require("../index");
var assert = require("assert");
var Menu = require("menu");

var menuTemplate = [];

var app = module.exports = {
    NO_ERROR: 0,
    ERR_NOT_FOUND: "NOTFOUND"
};

var __refreshMenu = _.debounce(function () {
    Menu.setApplicationMenu(Menu.buildFromTemplate(_.cloneDeep(menuTemplate)));
}, 100);

function _refreshMenu(callback) {
    __refreshMenu();
    process.nextTick(callback);
}

function _findMenuItemPosition(id, where, whereId) {
    where = where || menuTemplate;
    whereId = whereId || "";

    var result = _.find(where, {id: id});
    if (result) {
        return [whereId, _.findIndex(where, {id: id})];
    }

    var results = _.compact(where.map(function (menuItem) {
        return menuItem.submenu ? _findMenuItemPosition(id, menuItem.submenu, menuItem.id) : null;
    }));
    return results.length > 0 ? results[0] : null;
}

function _deleteMenuItemById(id, where) {
    where = where || menuTemplate;

    var result = _.findIndex(where, {id: id});
    if (result !== -1) {
        where.splice(result, 1);
        return true;
    }

    var deleted = where.map(function (menuItem) {
        return menuItem.submenu ? _deleteMenuItemById(id, menuItem.submenu) : null;
    }).filter(function (result) { return result === true; });
    return deleted.length > 0 ? true : false;
}

function _findMenuItemById(id, where) {
    where = where || menuTemplate;

    var result = _.find(where, {id: id});
    if (result) {
        return result;
    }

    var results = _.compact(where.map(function (menuItem) {
        return menuItem.submenu ? _findMenuItemById(id, menuItem.submenu) : null;
    }));
    return results.length > 0 ? results[0] : null;
}

function _addToPosition(obj, target, position, relativeId) {
    if (!target.push) {
        console.log("_addToPosition");
        console.log(target);
    }

    var retVal = app.NO_ERROR;
    if (position === "first") {
        target.unshift(obj);
    } else if (position === "last") {
        target.push(obj);
    } else if (position === "before" || position === "after" || position === "firstInSection" || position === "lastInSection") {
        var idx = _.findIndex(target, {id: relativeId});
        var idxSection;
        if (idx === -1) {
            // NOTE: original behaviour - if relativeId wasn't found
            // menu should be put to the end of the list
            console.warn("menu item with id: " + relativeId + " was not found, adding entry to the end of the list");
            retVal = app.ERR_NOT_FOUND;
            idx = target.length;
        }
        if (position === "firstInSection") {
            idxSection = _.findLastIndex(target, function (obj, i) {
                return i < idx && obj.type === "separator";
            });
            idx = idxSection + 1;
        }
        if (position === "lastInSection") {
            idxSection = _.findIndex(target, function (obj, i) {
                return i >= idx && obj.type === "separator";
            });
            idx = idxSection === -1 ? target.length : idxSection;
        }
        if (position === "after") {
            idx++;
        }
        target.splice(idx, 0, obj);
    } else {
        throw new Error("position not implemented in _addToPosition: " + position);
    }
    return retVal;
}

function _fixBracketsKeyboardShortcut(shortcut) {
    if (typeof shortcut !== "string" || shortcut.trim() === "") {
        return null;
    }

    shortcut = shortcut.replace(/-/g, "+");
    shortcut = shortcut.replace(/\+$/g, "Plus");
    shortcut = shortcut.replace(/\u2190/g, "Left");
    shortcut = shortcut.replace(/\u2191/g, "Up");
    shortcut = shortcut.replace(/\u2192/g, "Right");
    shortcut = shortcut.replace(/\u2193/g, "Down");
    shortcut = shortcut.replace(/\u2212/g, "-");

    if (!shortcut.match(/^[\x00-\x7F]+$/)) {
        console.error("Non ASCII keyboard shortcut used: " + shortcut);
        shortcut = null;
    }

    return shortcut;
}

app.addMenu = function (title, id, position, relativeId, callback) {
    assert(title && typeof title === "string", "title must be a string");
    assert(id && typeof id === "string", "id must be a string");
    assert(!position || position && typeof position === "string", "position must be a string");
    assert(!relativeId || relativeId && typeof relativeId === "string", "relativeId must be a string");
    assert(typeof callback === "function", "callback must be a function");
    process.nextTick(function () {
        var newObj = {
            id: id,
            label: title
        };
        var err = _addToPosition(newObj, menuTemplate, position || "last", relativeId);
        _refreshMenu(callback.bind(null, err));
    });
};

app.addMenuItem = function (parentId, title, id, key, displayStr, position, relativeId, callback) {
    assert(parentId && typeof parentId === "string", "parentId must be a string");
    assert(title && typeof title === "string", "title must be a string");
    assert(id && typeof id === "string", "id must be a string");
    assert(!key || key && typeof key === "string", "key must be a string");
    assert(!displayStr || displayStr && typeof displayStr === "string", "displayStr must be a string");
    assert(!position || position && typeof position === "string", "position must be a string");
    assert(!relativeId || relativeId && typeof relativeId === "string", "relativeId must be a string");
    assert(typeof callback === "function", "callback must be a function");
    process.nextTick(function () {
        key = _fixBracketsKeyboardShortcut(key);

        var isSeparator = title === "---",
            newObj = {
            type: isSeparator ? "separator" : "normal",
            id: id,
            label: title,
            click: function () {
                main.getMainWindow().webContents.send("executeCommand", id);
            }
        };

        if (key) {
            newObj.accelerator = key;
        }

        var parentObj = _findMenuItemById(parentId);
        if (!parentObj) {
            return process.nextTick(function () {
                callback(app.ERR_NOT_FOUND);
            });
        }

        if (!parentObj.submenu) {
            parentObj.submenu = [];
        }

        var err = _addToPosition(newObj, parentObj.submenu, position || "last", relativeId);
        _refreshMenu(callback.bind(null, err));
    });
};

app.getMenuItemState = function (commandId, callback) {
    assert(commandId && typeof commandId === "string", "commandId must be a string");
    process.nextTick(function () {
        var obj = _findMenuItemById(commandId);
        if (!obj) {
            return callback(app.ERR_NOT_FOUND);
        }
        callback(app.NO_ERROR, obj.enabled === true, obj.checked === true);
    });
};

app.getMenuPosition = function (commandId, callback) {
    assert(commandId && typeof commandId === "string", "commandId must be a string");
    process.nextTick(function () {
        var res = _findMenuItemPosition(commandId);
        callback(app.NO_ERROR, res[0], res[1]);
    });
};

app.getMenuTitle = function (commandId, callback) {
    assert(commandId && typeof commandId === "string", "commandId must be a string");
    process.nextTick(function () {
        var obj = _findMenuItemById(commandId);
        if (!obj) {
            return callback(app.ERR_NOT_FOUND);
        }
        callback(app.NO_ERROR, obj.label);
    });
};

app.removeMenu = function (commandId, callback) {
    assert(commandId && typeof commandId === "string", "commandId must be a string");
    process.nextTick(function () {
        var deleted = _deleteMenuItemById(commandId);
        _refreshMenu(callback.bind(null, deleted ? app.NO_ERROR : app.ERR_NOT_FOUND));
    });
};

app.removeMenuItem = function (commandId, callback) {
    assert(commandId && typeof commandId === "string", "commandId must be a string");
    process.nextTick(function () {
        var deleted = _deleteMenuItemById(commandId);
        _refreshMenu(callback.bind(null, deleted ? app.NO_ERROR : app.ERR_NOT_FOUND));
    });
};

app.setMenuItemShortcut = function (commandId, shortcut, displayStr, callback) {
    assert(commandId && typeof commandId === "string", "commandId must be a string");
    assert(shortcut && typeof shortcut === "string", "shortcut must be a string");
    process.nextTick(function () {
        shortcut = _fixBracketsKeyboardShortcut(shortcut);
        var obj = _findMenuItemById(commandId);
        if (shortcut) {
            obj.accelerator = shortcut;
        } else {
            delete obj.accelerator;
        }
        _refreshMenu(callback.bind(null, app.NO_ERROR));
    });
};

app.setMenuItemState = function (commandId, enabled, checked, callback) {
    assert(typeof enabled === "boolean", "enabled must be a boolean");
    assert(typeof checked === "boolean", "checked must be a boolean");
    process.nextTick(function () {
        var obj = _findMenuItemById(commandId);
        if (!obj) {
            return callback(app.ERR_NOT_FOUND);
        }

        obj.enabled = enabled;
        obj.checked = checked;

        if (checked) {
            // TODO: Change addMenuItem to set the type (checkbox, radio, ... submenu)
            obj.type = "checkbox";
        }
        _refreshMenu(callback.bind(null, app.NO_ERROR));
    });
};

app.setMenuTitle = function (commandId, title, callback) {
    assert(commandId && typeof commandId === "string", "commandId must be a string");
    assert(title && typeof title === "string", "title must be a string");
    process.nextTick(function () {
        var obj = _findMenuItemById(commandId);
        if (!obj) {
            return callback(app.ERR_NOT_FOUND);
        }
        obj.label = title;
        _refreshMenu(callback.bind(null, app.NO_ERROR));
    });
};
