Brackets File Tree Exclude
===============

Brackets extension for excluding folders and files from the file tree, find in files, and quick open. This means that the files will be completely invisible to Brackets (and thnakfully not count against the 30,000 file limit). 

This is great for cache folders, distribution/build folders and files, and those package manager folders like `node_modules` and `bower_components`.

This is an updated version of Glenn Ruehle's now defunkt plugin - [exclude-folders](https://github.com/gruehle/exclude-folders).

Install
---------------

1. Launch Brackets
2. Select _File > Extension Manager..._ or click the Lego icon in the toolbar
3. Search for `File Tree Exclude`

If a manual install is more your thing (or it's missing from the registry):

1. Click the "Install from URL..." button
2. Paste (or enter) `https://github.com/JonathanWolfe/file-tree-exclude.git` and click "Install"

Configure
---------------

Exclusions are defined globally by default inside the Brackets preferences file (_Debug > Open preferences file_).

Append or edit your configuration options there. (See below for example of defaults)

**Or on a per project basis:**

Create a `.brackets.json` in project root (it may already exist) and add your settings there.

Note:
---------------

**Project config completely redefine exclusion rules from global config.**

Configuration defaults
---------------

```JSON
{
	"jwolfe.file-tree-exclude.list": [
		"node_modules",
        "bower_components",
        ".git",
        "dist",
        "vendor"
    ]
}
```

How it Matches
---------------
Matches are done via the default matching system in Brackets along with [Minimatch](https://github.com/isaacs/minimatch) with the `dot` and `matchBase` options.
