define(function (require, exports, module) {
    "use strict";

    const PreferencesManager = require("preferences/PreferencesManager");
    const Strings            = require("strings");

    PreferencesManager.definePreference("shell.blinkFeatures", "string", "", {
        description: Strings.DESCRIPTION_SHELL_BLINK_FEATURES
    });

    PreferencesManager.definePreference("shell.disableBlinkFeatures", "string", "", {
        description: Strings.DESCRIPTION_SHELL_DISABLE_BLINK_FEATURES
    });

    PreferencesManager.definePreference("shell.smoothScrolling", "boolean", true, {
        description: Strings.DESCRIPTION_SHELL_SMOOTH_SCROLLING
    });

});
