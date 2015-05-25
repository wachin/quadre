{
  'target_defaults': {
    'conditions': [
      ['OS=="win"', {
        'msvs_disabled_warnings': [
          4530,  # C++ exception handler used, but unwind semantics are not enabled
          4506,  # no definition for inline function
        ],
      }],
    ],
  },
  'targets': [
    {
      'target_name': 'live-browser-preview',
      'sources': [
        'src/main.cc',
      ],
      'include_dirs': [
        '<!(node -e "require(\'nan\')")'
      ],
      'conditions': [
        ['OS=="win"', {
          'sources': [
            'src/live_browser_preview_win.cc',
          ],
          'defines': [
            'UNICODE',
          ],
          'libraries': [
            '-lole32.lib',
            '-lshell32.lib',
            '-lpsapi.lib',
          ],
        }],
        ['OS=="mac"', {
          'sources': [
            'src/live_browser_preview_mac.mm',
          ],
          'libraries': [
              '$(SDKROOT)/System/Library/Frameworks/AppKit.framework',
              '$(SDKROOT)/System/Library/Frameworks/Foundation.framework',
              '$(SDKROOT)/System/Library/Frameworks/ScriptingBridge.framework',
              '$(SDKROOT)/System/Library/Frameworks/Security.framework',
          ],
        }],
        ['OS not in ["mac", "win"]', {
          'sources': [
            'src/live_browser_preview_posix.cc',
          ],
        }],
      ],
    }
  ]
}
