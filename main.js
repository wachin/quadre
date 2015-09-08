define(function (require, exports, module) {
  'use strict';

  // Get our Brackets modules
  var _ = brackets.getModule('thirdparty/lodash');
  var FileSystemImpl = brackets.getModule('filesystem/FileSystem')._FileSystem;
  var ProjectManager = brackets.getModule('project/ProjectManager');
  var PreferencesManager = brackets.getModule('preferences/PreferencesManager');
  var PackageJson = JSON.parse(require('text!./package.json'));
  var StateManager = PreferencesManager.stateManager;

  // Default excludes
  var defaultExcludeList = [
    '/.git/',
    '/dist/',
    '/bower_components/',
    '/node_modules/'
  ];

  // Get the preferences for this extension
  var preferences = PreferencesManager.getExtensionPrefs(PackageJson.name);
  preferences.definePreference('excludeList', 'array', defaultExcludeList);

  // projectRoot & projectPath
  var excludeList = null;
  var projectPath = null;

  // Check if the extension has been updated
  if (PackageJson.version !== StateManager.get(PackageJson.name + '.version')) {
    StateManager.set(PackageJson.name + '.version', PackageJson.version);
    preferences.set('excludeList', defaultExcludeList);
  }

  function toRegexp(str) {
    if (typeof str !== 'string') { str = str.toString(); }
    // https://github.com/sindresorhus/escape-string-regexp/blob/master/index.js
    str = str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
    // if starts with slash, make it possible start of the string too
    if (str[0] === '/') { str = '(^|/)' + str.slice(1); }
    // if ends with slash, make it possible end of the string too
    if (str.slice(-1) === '/') { str = str.slice(0, -1) + '(/|$)'; }
    return str;
  }

  function fetchVariables() {
    excludeList = preferences.get('excludeList', preferences.CURRENT_PROJECT);
    excludeList = excludeList.map(toRegexp);
    var projectRoot = ProjectManager.getProjectRoot();
    projectPath = projectRoot ? projectRoot.fullPath : null;
  }

  function clearVariables() {
    excludeList = null;
    projectPath = null;
  }

  // attach events
  ProjectManager.on('projectOpen', fetchVariables);
  ProjectManager.on('beforeProjectClose', clearVariables);

  // Filter itself
  var _oldFilter = FileSystemImpl.prototype._indexFilter;
  FileSystemImpl.prototype._indexFilter = function (path, name) {

    if (!excludeList || !projectPath) {
      fetchVariables();
      if (!excludeList || !projectPath) {
        return _oldFilter.apply(this, arguments);
      }
    }

    var relativePath = path.slice(projectPath.length);

    var excluded = _.any(excludeList, function (toMatch) {
      return relativePath.match(toMatch) != null;
    });

    return excluded ? false : _oldFilter.apply(this, arguments);
  };

});
