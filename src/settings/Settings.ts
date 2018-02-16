import MainViewFactory = require("view/MainViewFactory");
import { SettingsView } from "settings/SettingsView";

/*
 * Creates an image view object and adds it to the specified pane
 * @param {!File} file - the file to create an image of
 * @param {!Pane} pane - the pane in which to host the view
 * @return {jQuery.Promise}
 */
function _createSettingsView(file, pane) {
    let view = pane.getViewForPath(file.fullPath);

    if (view) {
        pane.showView(view);
    } else {
        view = new SettingsView(file, pane.$content);
        pane.addView(view, true);
    }
    return $.Deferred().resolve().promise();
}

/*
 * Initialization, register our view factory
 */
MainViewFactory.registerViewFactory({
    canOpenFile(fullPath) {
        return fullPath.endsWith(".settings");
    },
    openFile(file, pane) {
        return _createSettingsView(file, pane);
    }
});
