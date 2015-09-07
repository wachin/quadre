define(function (require, exports, module) {
  'use strict';

  // Get our Brackets modules
  var _ = brackets.getModule('thirdparty/lodash');
  var FileSystemImpl = brackets.getModule('filesystem/FileSystem')._FileSystem;
  var ProjectManager = brackets.getModule('project/ProjectManager');
  var PreferencesManager = brackets.getModule('preferences/PreferencesManager');

  // Constants
  var MODULE_ID = 'zaggino.file-tree-exclude';

  // Default excludes
  var defaultExcludeList = [
    '^.git($|/)',
    '^dist($|/)',
    '^bower_components($|/)',
    '^node_modules($|/)'
  ];

  // Get the preferences for this extension
  var preferences = PreferencesManager.getExtensionPrefs(MODULE_ID);
  preferences.definePreference('excludeList', 'array', defaultExcludeList);

  // projectRoot & projectPath
  var excludeList = null;
  var projectRoot = null;
  var projectPath = null;

  function fetchVariables() {
    excludeList = preferences.get('excludeList', preferences.CURRENT_PROJECT);
    preferences.set('excludeList', excludeList);
    projectRoot = ProjectManager.getProjectRoot();
    projectPath = projectRoot.fullPath;
  }

  ProjectManager.on('projectOpen', fetchVariables);

  ProjectManager.on('beforeProjectClose', function () {
    excludeList = null;
    projectRoot = null;
    projectPath = null;
  });

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
