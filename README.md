Brackets File Tree Exclude
===============

Brackets extension for excluding folders and files from the file tree, find in files, and quick open. This means that the files will be completely invisible to Brackets (and thnakfully not count against the 30,000 file limit). 

This is great for cache folders, distribution/build folders and files, and those package manager folders like `node_modules` and `bower_components`.

This is a rewritten version of Jon Wolfe's extension - [file-tree-exclude](https://github.com/JonathanWolfe/file-tree-exclude).

Install
---------------

1. Launch Brackets
2. Select _File > Extension Manager..._ or click the Lego icon in the toolbar
3. Search for `File Tree Exclude`

If a manual install is more your thing (or it's missing from the registry):

1. Click the "Install from URL..." button
2. Paste (or enter) `https://github.com/zaggino/file-tree-exclude.git` and click "Install"

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
	"brackets-file-tree-exclude.excludeList": [
		"^.git($|/)",
        "^dist($|/)",
        "^bower_components($|/)",
        "^node_modules($|/)"
    ]
}
```

How it Matches
---------------
Matches are done using JavaScript regexp's relatively to current project root.
