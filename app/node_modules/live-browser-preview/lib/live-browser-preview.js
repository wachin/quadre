(function() {
  var live_browser = require('../build/Release/live-browser-preview.node');

  module.exports = function(command, args, enableRemoteDebugging, appSupportDir) {
    return live_browser.openLiveBrowser(command, args, enableRemoteDebugging, appSupportDir);
  };

}).call(this);
