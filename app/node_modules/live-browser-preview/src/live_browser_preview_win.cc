
#include <windows.h>
#include <algorithm>
#include <CommDlg.h>
#include <Psapi.h>
#include <ShellAPI.h>
#include <ShlObj.h>
#include <Shlwapi.h>
#include <Shobjidl.h>
#include <stdio.h>
#include <sys/stat.h>
#include <string>

#include "live_browser_preview.h"

#define CLOSING_PROP L"CLOSING"
#define UNICODE_MINUS 0x2212
#define UNICODE_LEFT_ARROW 0x2190
#define UNICODE_DOWN_ARROW 0x2193

static const int ERR_UNKNOWN                = 1;
static const int ERR_INVALID_PARAMS         = 2;
static const int ERR_NOT_FOUND              = 3;
static const int ERR_CANT_READ              = 4;
static const int ERR_UNSUPPORTED_ENCODING   = 5;
static const int ERR_CANT_WRITE             = 6;
static const int ERR_OUT_OF_SPACE           = 7;
static const int ERR_NOT_FILE               = 8;
static const int ERR_NOT_DIRECTORY          = 9;
static const int ERR_FILE_EXISTS            = 10;
static const int ERR_BROWSER_NOT_INSTALLED  = 11;
static const int ERR_PID_NOT_FOUND          = -9999; // negative int to avoid confusion with real PIDs

// Forward declarations for functions at the bottom of this file

// Redraw timeout variables. See the comment above ScheduleMenuRedraw for details.
const DWORD kMenuRedrawTimeout = 100;
UINT_PTR redrawTimerId = NULL;


extern HINSTANCE hInst;
extern HACCEL hAccelTable;
extern std::wstring gFilesToOpen;

// constants
#define MAX_LOADSTRING 100

std::wstring towstring(std::string & stdStr)
{
    std::wstringstream ws;
    ws << stdStr.c_str();
    std::wstring wStr = ws.str();
    return wStr;
}

///////////////////////////////////////////////////////////////////////////////
// LiveBrowserMgrWin
namespace LiveBrowserMgr{

	int ConvertErrnoCode(int errorCode, bool isReading = true);
	int ConvertWinErrorCode(int errorCode, bool isReading = true);
	static std::wstring GetPathToLiveBrowser();
	static bool ConvertToShortPathName(std::wstring & path);
	time_t FiletimeToTime(FILETIME const& ft);

class LiveBrowserMgrWin
{
public:
    static LiveBrowserMgrWin* GetInstance();
    static void Shutdown();

    bool IsChromeWindow(HWND hwnd);
    bool IsAnyChromeWindowsRunning();
    
    //void CloseLiveBrowserKillTimers();
    //void CloseLiveBrowserFireCallback(int valToSend);

    static BOOL CALLBACK EnumChromeWindowsCallback(HWND hwnd, LPARAM userParam);
    
    //static void CloseLiveBrowserTimerCallback( HWND hwnd, UINT uMsg, UINT idEvent, DWORD dwTime);
    //static void CloseLiveBrowserAsyncCallback( HWND hwnd, UINT uMsg, ULONG_PTR dwData, LRESULT lResult );

    //CefRefPtr<CefProcessMessage> GetCloseCallback() { return m_closeLiveBrowserCallback; }
    UINT GetCloseHeartbeatTimerId() { return m_closeLiveBrowserHeartbeatTimerId; }
    UINT GetCloseTimeoutTimerId() { return m_closeLiveBrowserTimeoutTimerId; }

    /*void SetCloseCallback(CefRefPtr<CefProcessMessage> closeLiveBrowserCallback)
        { m_closeLiveBrowser= closeLiveBrowserCallback; }
    void SetBrowser(CefRefPtr<CefBrowser> browser)
        { m_browser = browser; }
    void SetCloseHeartbeatTimerId(UINT closeLiveBrowserHeartbeatTimerId)
        { m_closeLiveBrowserHeartbeatTimerId = closeLiveBrowserHeartbeatTimerId; }
    void SetCloseTimeoutTimerId(UINT closeLiveBrowserTimeoutTimerId)
        { m_closeLiveBrowserTimeoutTimerId = closeLiveBrowserTimeoutTimerId; }*/

private:
    // private so this class cannot be instantiated externally
    LiveBrowserMgrWin();
    virtual ~LiveBrowserMgrWin();

    UINT                            m_closeLiveBrowserHeartbeatTimerId;
    UINT                            m_closeLiveBrowserTimeoutTimerId;
    //CefRefPtr<CefProcessMessage>    m_closeLiveBrowserCallback;
    //CefRefPtr<CefBrowser>            m_browser;

    static LiveBrowserMgrWin* s_instance;
};

LiveBrowserMgrWin::LiveBrowserMgrWin()
    : m_closeLiveBrowserHeartbeatTimerId(0)
    , m_closeLiveBrowserTimeoutTimerId(0)
{
}

LiveBrowserMgrWin::~LiveBrowserMgrWin()
{
}

LiveBrowserMgrWin* LiveBrowserMgrWin::GetInstance()
{
    if (!s_instance)
        s_instance = new LiveBrowserMgrWin();
    return s_instance;
}

void LiveBrowserMgrWin::Shutdown()
{
    delete s_instance;
    s_instance = NULL;
}

bool LiveBrowserMgrWin::IsChromeWindow(HWND hwnd)
{
    if( !hwnd ) {
        return false;
    }

    //Find the path that opened this window
    DWORD processId = 0;
    ::GetWindowThreadProcessId(hwnd, &processId);

    HANDLE processHandle = ::OpenProcess( PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, FALSE, processId);
    if( !processHandle ) { 
        return false;
    }

    DWORD modulePathBufSize = MAX_UNC_PATH+1;
    WCHAR modulePathBuf[MAX_UNC_PATH+1];
    DWORD modulePathSize = ::GetModuleFileNameEx(processHandle, NULL, modulePathBuf, modulePathBufSize );
    ::CloseHandle(processHandle);
    processHandle = NULL;

    std::wstring modulePath(modulePathBuf, modulePathSize);

    //See if this path is the same as what we want to launch
    std::wstring appPath = GetPathToLiveBrowser();

    if( !ConvertToShortPathName(modulePath) || !ConvertToShortPathName(appPath) ) {
        return false;
    }

    if(0 != _wcsicmp(appPath.c_str(), modulePath.c_str()) ){
        return false;
    }

    //looks good
    return true;
}

struct EnumChromeWindowsCallbackData
{
    bool    closeWindow;
    int     numberOfFoundWindows;
};

BOOL CALLBACK LiveBrowserMgrWin::EnumChromeWindowsCallback(HWND hwnd, LPARAM userParam)
{
    if( !hwnd || !s_instance) {
        return FALSE;
    }

    EnumChromeWindowsCallbackData* cbData = reinterpret_cast<EnumChromeWindowsCallbackData*>(userParam);
    if(!cbData) {
        return FALSE;
    }

    if (!s_instance->IsChromeWindow(hwnd)) {
        return TRUE;
    }

    cbData->numberOfFoundWindows++;
    //This window belongs to the instance of the browser we're interested in, tell it to close
    if( cbData->closeWindow ) {
     //   ::SendMessageCallback(hwnd, WM_CLOSE, NULL, NULL, CloseLiveBrowserAsyncCallback, NULL);
    }

    return TRUE;
}

bool LiveBrowserMgrWin::IsAnyChromeWindowsRunning()
{
    EnumChromeWindowsCallbackData cbData = {0};
    cbData.numberOfFoundWindows = 0;
    cbData.closeWindow = false;
    ::EnumWindows(EnumChromeWindowsCallback, (LPARAM)&cbData);
    return( cbData.numberOfFoundWindows != 0 );
}

/*void LiveBrowserMgrWin::CloseLiveBrowserKillTimers()
{
    if (m_closeLiveBrowserHeartbeatTimerId) {
        ::KillTimer(NULL, m_closeLiveBrowserHeartbeatTimerId);
        m_closeLiveBrowserHeartbeatTimerId = 0;
    }

    if (m_closeLiveBrowserTimeoutTimerId) {
        ::KillTimer(NULL, m_closeLiveBrowserTimeoutTimerId);
        m_closeLiveBrowserTimeoutTimerId = 0;
    }
}

void LiveBrowserMgrWin::CloseLiveBrowserFireCallback(int valToSend)
{
    CefRefPtr<CefListValue> responseArgs = m_closeLiveBrowserCallback->GetArgumentList();
    
    // kill the timers
    CloseLiveBrowserKillTimers();
    
    // Set common response args (callbackId and error)
    responseArgs->SetInt(1, valToSend);
    
    // Send response
    m_browser->SendProcessMessage(PID_RENDERER, m_closeLiveBrowserCallback);
    
    // Clear state
    m_closeLiveBrowser= NULL;
    m_browser = NULL;
}

void LiveBrowserMgrWin::CloseLiveBrowserTimerCallback( HWND hwnd, UINT uMsg, UINT idEvent, DWORD dwTime)
{
    if( !s_instance ) {
        ::KillTimer(NULL, idEvent);
        return;
    }

    int retVal =  NO_ERROR;
    if( s_instance->IsAnyChromeWindowsRunning() )
    {
        retVal = ERR_UNKNOWN;
        //if this is the heartbeat timer, wait for another beat
        if (idEvent == s_instance->m_closeLiveBrowserHeartbeatTimerId) {
            return;
        }
    }

    //notify back to the app
    s_instance->CloseLiveBrowserFireCallback(retVal);
}

void LiveBrowserMgrWin::CloseLiveBrowserAsyncCallback( HWND hwnd, UINT uMsg, ULONG_PTR dwData, LRESULT lResult )
{
    if( !s_instance ) {
        return;
    }

    //If there are no more versions of chrome, then fire the callback
    if( !s_instance->IsAnyChromeWindowsRunning() ) {
        s_instance->CloseLiveBrowserFireCallback(NO_ERROR);
    }
    else if(s_instance->m_closeLiveBrowserHeartbeatTimerId == 0){
        //start a heartbeat timer to see if it closes after the message returned
        s_instance->m_closeLiveBrowserHeartbeatTimerId = ::SetTimer(NULL, 0, 30, CloseLiveBrowserTimerCallback);
    }
}
*/


LiveBrowserMgrWin* LiveBrowserMgrWin::s_instance = NULL;


static int SetInitialPathCallback(HWND hWnd, UINT uMsg, LPARAM lParam, LPARAM lpData)
{
    if (BFFM_INITIALIZED == uMsg && NULL != lpData)
    {
        SendMessage(hWnd, BFFM_SETSELECTION, TRUE, lpData);
    }

    return 0;
}

static std::wstring GetPathToLiveBrowser() 
{
    HKEY hKey;

    // First, look at the "App Paths" registry key for a "chrome.exe" entry. This only
    // checks for installs for all users. If Chrome is only installed for the current user,
    // we fall back to the code below.
    if (ERROR_SUCCESS == RegOpenKeyEx(
            HKEY_LOCAL_MACHINE, 
            L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe",
            0, KEY_READ, &hKey)) {
       wchar_t wpath[MAX_UNC_PATH] = {0};

        DWORD length = MAX_UNC_PATH;
        RegQueryValueEx(hKey, NULL, NULL, NULL, (LPBYTE)wpath, &length);
        RegCloseKey(hKey);

        return std::wstring(wpath);
    }

    // We didn't get an "App Paths" entry. This could be because Chrome was only installed for
    // the current user, or because Chrome isn't installed at all.
    // Look for Chrome.exe at C:\Users\{USERNAME}\AppData\Local\Google\Chrome\Application\chrome.exe
    TCHAR localAppPath[MAX_UNC_PATH] = {0};
    SHGetFolderPath(NULL, CSIDL_LOCAL_APPDATA, NULL, SHGFP_TYPE_CURRENT, localAppPath);
    std::wstring appPath(localAppPath);
    appPath += L"\\Google\\Chrome\\Application\\chrome.exe";
        
    return appPath;
}
    
static bool ConvertToShortPathName(std::wstring & path)
{
    DWORD shortPathBufSize = MAX_UNC_PATH+1;
    WCHAR shortPathBuf[MAX_UNC_PATH+1];
    DWORD finalShortPathSize = ::GetShortPathName(path.c_str(), shortPathBuf, shortPathBufSize);
    if( finalShortPathSize == 0 ) {
        return false;
    }
        
    path.assign(shortPathBuf, finalShortPathSize);
    return true;
}

int OpenLiveBrowser(ExtensionString argURL, bool enableRemoteDebugging, ExtensionString appSupportDirectory)
{
    std::wstring appPath = GetPathToLiveBrowser();
    std::wstring args = appPath;

    if (enableRemoteDebugging) {
        std::wstring profilePath(appSupportDirectory);
        profilePath += L"\\live-dev-profile";
        args += L" --user-data-dir=\"";
        args += profilePath;
        args += L"\" --no-first-run --no-default-browser-check --allow-file-access-from-files --remote-debugging-port=9222 ";
    } else {
        args += L" ";
    }
    args += argURL;

    // Args must be mutable
    int argsBufSize = args.length() +1;
    std::vector<WCHAR> argsBuf;
    argsBuf.resize(argsBufSize);
    wcscpy(&argsBuf[0], args.c_str());

    STARTUPINFO si = {0};
    si.cb = sizeof(si);
    PROCESS_INFORMATION pi = {0};

    // Launch cmd.exe and pass in the arguments
    if (!CreateProcess(NULL, &argsBuf[0], NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi)) {
        return ConvertWinErrorCode(GetLastError());
    }
        
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);

    return NO_ERROR;
}

// Maps errors from  WinError.h to the brackets error codes
// found in brackets_extensions.js
int ConvertWinErrorCode(int errorCode, bool isReading)
{
    switch (errorCode) {
    case NO_ERROR:
        return NO_ERROR;
    case ERROR_PATH_NOT_FOUND:
    case ERROR_FILE_NOT_FOUND:
        return ERR_NOT_FOUND;
    case ERROR_ACCESS_DENIED:
        return isReading ? ERR_CANT_READ : ERR_CANT_WRITE;
    case ERROR_WRITE_PROTECT:
        return ERR_CANT_WRITE;
    case ERROR_HANDLE_DISK_FULL:
        return ERR_OUT_OF_SPACE;
    case ERROR_ALREADY_EXISTS:
        return ERR_FILE_EXISTS;
    default:
        return ERR_UNKNOWN;
    }
}


/* void CloseLiveBrowser(CefRefPtr<CefBrowser> browser, CefRefPtr<CefProcessMessage> response)
{
    LiveBrowserMgrWin* liveBrowserMgr = LiveBrowserMgrWin::GetInstance();
    
    if (liveBrowserMgr->GetCloseCallback() != NULL) {
        // We can only handle a single async at a time. If there is already one that hasn't fired then
        // we kill it now and get ready for the next.
        liveBrowserMgr->CloseLiveBrowserFireCallback(ERR_UNKNOWN);
    }

    liveBrowserMgr->SetCloseCallback(response);
    liveBrowserMgr->SetBrowser(browser);

    EnumChromeWindowsCallbackData cbData = {0};

    cbData.numberOfFoundWindows = 0;
    cbData.closeWindow = true;
    ::EnumWindows(LiveBrowserMgrWin::EnumChromeWindowsCallback, (LPARAM)&cbData);

    if (cbData.numberOfFoundWindows == 0) {
        liveBrowserMgr->CloseLiveBrowserFireCallback(NO_ERROR);
    } else if (liveBrowserMgr->GetCloseCallback()) {
        // set a timeout for up to 10 seconds to close the browser
        liveBrowserMgr->SetCloseTimeoutTimerId( ::SetTimer(NULL, 0, 10 * 1000, LiveBrowserMgrWin::CloseLiveBrowserTimerCallback) );
    }
} */
}