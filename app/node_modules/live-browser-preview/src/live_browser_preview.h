#ifndef SRC_RUNAS_H_
#define SRC_RUNAS_H_

#include <string>
#include <sstream>
#include <vector>

#ifdef _WIN32
// MAX_PATH is only 260 chars which really isn't big enough for really long unc pathnames
//  so use this constant instead which accounts for some really long pathnames
#define MAX_UNC_PATH 4096

#define ExtensionString std::wstring
std::wstring towstring(std::string & stdStr);
#else
#define ExtensionString std::string
#endif

namespace LiveBrowserMgr{
    int OpenLiveBrowser(ExtensionString argURL, bool enableRemoteDebugging, ExtensionString appSupportDirectory);
}

#endif  // SRC_RUNAS_H_
