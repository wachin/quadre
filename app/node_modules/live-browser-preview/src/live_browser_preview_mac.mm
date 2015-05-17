#include <Cocoa/Cocoa.h>
#include <sys/sysctl.h>

#include "live_browser_preview.h"

#include <errno.h>
#include <fcntl.h>
#include <Security/Authorization.h>
#include <sys/wait.h>

#include "GoogleChrome.h"

typedef int int32;
typedef std::string ExtensionString;

static const int NO_ERROR                   = 0;
static const int ERR_UNKNOWN                = 1;
static const int ERR_NOT_FOUND              = 3;;

static const int ERR_PID_NOT_FOUND          = -9999; // negative int to avoid confusion with real PIDs

@interface ChromeWindowsTerminatedObserver : NSObject
- (void)appTerminated:(NSNotification *)note;
- (void)timeoutTimer:(NSTimer*)timer;
@end

// App ID for either Chrome or Chrome Canary (commented out)
NSString *const appId = @"com.google.Chrome";
//NSString *const appId = @"com.google.Chrome.canary";

// Live Development browser debug paramaters
int const debugPort = 9222;
NSString* debugPortCommandlineArguments = [NSString stringWithFormat:@"--remote-debugging-port=%d", debugPort];
NSString* debugProfilePath;// = @"--user-data-dir=/Users/prashant/Library/Application Support/Bracketron/cef_data/live-dev-profile";
    
/*[NSString stringWithFormat:@"--user-data-dir=/var/root/Library/Application Support/Bracketron/cef_data/live-dev-profile", ClientApp::AppGetSupportDirectory().ToString().c_str()];*/

// Extracted & Modified from https://gist.github.com/nonowarn/770696
int32 GetArgvFromProcessID(int pid, NSString **argv)
{
    int    mib[3], argmax, nargs, c = 0;
    size_t    size;
    char    *procargs, *sp, *np, *cp;
    int show_args = 1;

    mib[0] = CTL_KERN;
    mib[1] = KERN_ARGMAX;

    size = sizeof(argmax);
    if (sysctl(mib, 2, &argmax, &size, NULL, 0) == -1) {
        goto ERROR_A;
    }

    /* Allocate space for the arguments. */
    procargs = (char *)malloc(argmax);
    if (procargs == NULL) {
        goto ERROR_A;
    }


    /*
     * Make a sysctl() call to get the raw argument space of the process.
     * The layout is documented in start.s, which is part of the Csu
     * project.  In summary, it looks like:
     *
     * /---------------\ 0x00000000
     * :               :
     * :               :
     * |---------------|
     * | argc          |
     * |---------------|
     * | arg[0]        |
     * |---------------|
     * :               :
     * :               :
     * |---------------|
     * | arg[argc - 1] |
     * |---------------|
     * | 0             |
     * |---------------|
     * | env[0]        |
     * |---------------|
     * :               :
     * :               :
     * |---------------|
     * | env[n]        |
     * |---------------|
     * | 0             |
     * |---------------| <-- Beginning of data returned by sysctl() is here.
     * | argc          |
     * |---------------|
     * | exec_path     |
     * |:::::::::::::::|
     * |               |
     * | String area.  |
     * |               |
     * |---------------| <-- Top of stack.
     * :               :
     * :               :
     * \---------------/ 0xffffffff
     */
    mib[0] = CTL_KERN;
    mib[1] = KERN_PROCARGS2;
    mib[2] = pid;

    size = (size_t)argmax;
    if (sysctl(mib, 3, procargs, &size, NULL, 0) == -1) {
        goto ERROR_B;
    }

    memcpy(&nargs, procargs, sizeof(nargs));
    cp = procargs + sizeof(nargs);

    /* Skip the saved exec_path. */
    for (; cp < &procargs[size]; cp++) {
        if (*cp == '\0') {
            /* End of exec_path reached. */
            break;
        }
    }
    if (cp == &procargs[size]) {
        goto ERROR_B;
    }

    /* Skip trailing '\0' characters. */
    for (; cp < &procargs[size]; cp++) {
        if (*cp != '\0') {
            /* Beginning of first argument reached. */
            break;
        }
    }
    if (cp == &procargs[size]) {
        goto ERROR_B;
    }
    /* Save where the argv[0] string starts. */
    sp = cp;

    /*
     * Iterate through the '\0'-terminated strings and convert '\0' to ' '
     * until a string is found that has a '=' character in it (or there are
     * no more strings in procargs).  There is no way to deterministically
     * know where the command arguments end and the environment strings
     * start, which is why the '=' character is searched for as a heuristic.
     */
    for (np = NULL; c < nargs && cp < &procargs[size]; cp++) {
        if (*cp == '\0') {
            c++;
            if (np != NULL) {
                /* Convert previous '\0'. */
                *np = ' ';
            } else {
                /* *argv0len = cp - sp; */
            }
            /* Note location of current '\0'. */
            np = cp;

            if (!show_args) {
                /*
                 * Don't convert '\0' characters to ' '.
                 * However, we needed to know that the
                 * command name was terminated, which we
                 * now know.
                 */
                break;
            }
        }
    }

    /*
     * sp points to the beginning of the arguments/environment string, and
     * np should point to the '\0' terminator for the string.
     */
    if (np == NULL || np == sp) {
        /* Empty or unterminated string. */
        goto ERROR_B;
    }

    *argv = [NSString stringWithCString:sp encoding:NSUTF8StringEncoding];

    /* Clean up. */
    free(procargs);

    return NO_ERROR;

ERROR_B:
    free(procargs);
ERROR_A:
    return ERR_UNKNOWN;
}


NSRunningApplication* GetLiveBrowserApp(NSString *bundleId, int debugPort)
{

    NSArray* appList = [NSRunningApplication runningApplicationsWithBundleIdentifier: bundleId];

    // Search list of running apps with bundleId + debug port
    for (NSRunningApplication* currApp in appList) {

        int PID = [currApp processIdentifier];
        NSString* args = nil;

        // Check for process arguments
        if (GetArgvFromProcessID(PID, &args) != NO_ERROR) {
            continue;
        }

        // Check debug port (e.g. --remote-debugging-port=9222)
        if ([args rangeOfString:debugPortCommandlineArguments].location != NSNotFound) {
            return currApp;
        }
    }
    return nil;
}

namespace LiveBrowserMgr {

// LiveBrowser helper functions
//NSRunningApplication* GetLiveBrowserApp(NSString *bundleId, int debugPort);



///////////////////////////////////////////////////////////////////////////////
// LiveBrowserMgrMac

class LiveBrowserMgrMac
{
public:
    static LiveBrowserMgrMac* GetInstance();
    static void Shutdown();

    bool IsChromeRunning();
    void CheckForChromeRunning();
    void CheckForChromeRunningTimeout();
    
    void SetWorkspaceNotifications();
    void RemoveWorkspaceNotifications();

    void CloseLiveBrowserKillTimers();
    void CloseLiveBrowserFireCallback(int valToSend);

    ChromeWindowsTerminatedObserver* GetTerminateObserver() { return m_chromeTerminateObserver; }
    //CefRefPtr<CefProcessMessage> GetCloseCallback() { return m_closeLiveBrowserCallback; }
    NSRunningApplication* GetLiveBrowser() { return GetLiveBrowserApp(appId, debugPort); }
    int GetLiveBrowserPid() { return m_liveBrowserPid; }
    
    void SetCloseTimeoutTimer(NSTimer* closeLiveBrowserTimeoutTimer)
            { m_closeLiveBrowserTimeoutTimer = closeLiveBrowserTimeoutTimer; }
    void SetTerminateObserver(ChromeWindowsTerminatedObserver* chromeTerminateObserver)
            { m_chromeTerminateObserver = chromeTerminateObserver; }
    //void SetCloseCallback(CefRefPtr<CefProcessMessage> response)
    //        { m_closeLiveBrowserCallback = response; }
    //void SetBrowser(CefRefPtr<CefBrowser> browser)
    //        { m_browser = browser; }
    void SetLiveBrowserPid(int pid)
            { m_liveBrowserPid = pid; }

private:
    
    // private so this class cannot be instantiated externally
    LiveBrowserMgrMac();
    virtual ~LiveBrowserMgrMac();

    NSTimer*                            m_closeLiveBrowserTimeoutTimer;
    //CefRefPtr<CefProcessMessage>        m_closeLiveBrowserCallback;
    //CefRefPtr<CefBrowser>               m_browser;
    ChromeWindowsTerminatedObserver*    m_chromeTerminateObserver;
    int                                 m_liveBrowserPid;
    
    static LiveBrowserMgrMac*           s_instance;
};


LiveBrowserMgrMac::LiveBrowserMgrMac()
    : m_closeLiveBrowserTimeoutTimer(nil)
    , m_chromeTerminateObserver(nil)
    , m_liveBrowserPid(ERR_PID_NOT_FOUND)
{
}

LiveBrowserMgrMac::~LiveBrowserMgrMac()
{
    if (s_instance)
        s_instance->CloseLiveBrowserKillTimers();

    RemoveWorkspaceNotifications();
}

LiveBrowserMgrMac* LiveBrowserMgrMac::GetInstance()
{
    if (!s_instance)
        s_instance = new LiveBrowserMgrMac();

    return s_instance;
}

void LiveBrowserMgrMac::Shutdown()
{
    delete s_instance;
    s_instance = NULL;
}

bool LiveBrowserMgrMac::IsChromeRunning()
{
    return GetLiveBrowser() ? true : false;
}

void LiveBrowserMgrMac::CloseLiveBrowserKillTimers()
{
    if (m_closeLiveBrowserTimeoutTimer) {
        [m_closeLiveBrowserTimeoutTimer invalidate];
        [m_closeLiveBrowserTimeoutTimer release];
        m_closeLiveBrowserTimeoutTimer = nil;
    }
}

void LiveBrowserMgrMac::CloseLiveBrowserFireCallback(int valToSend)
{
    #if 0
    // kill the timers
    CloseLiveBrowserKillTimers();

    // Stop listening for ws shutdown notifications
    RemoveWorkspaceNotifications();

    // Prepare response
    if (m_closeLiveBrowserCallback && m_browser) {

        CefRefPtr<CefListValue> responseArgs = m_closeLiveBrowserCallback->GetArgumentList();

        // Set common response args (callbackId and error)
        responseArgs->SetInt(1, valToSend);

        // Send response
        m_browser->SendProcessMessage(PID_RENDERER, m_closeLiveBrowserCallback);
    }
    
    // Clear state
    m_closeLiveBrowserCallback = NULL;
    m_browser = NULL;
    #endif
}

void LiveBrowserMgrMac::CheckForChromeRunning()
{
    if (IsChromeRunning())
        return;
    
    // Unset the LiveBrowser pid
    m_liveBrowserPid = ERR_PID_NOT_FOUND;

    // Fire callback to browser
    CloseLiveBrowserFireCallback(NO_ERROR);
}

void LiveBrowserMgrMac::CheckForChromeRunningTimeout()
{
    int retVal = (IsChromeRunning() ? ERR_UNKNOWN : NO_ERROR);
    
    //notify back to the app
    CloseLiveBrowserFireCallback(retVal);
}

void LiveBrowserMgrMac::SetWorkspaceNotifications()
{
    if (!GetTerminateObserver()) {
        //register an observer to watch for the app terminations
        SetTerminateObserver([[ChromeWindowsTerminatedObserver alloc] init]);

        [[[NSWorkspace sharedWorkspace] notificationCenter]
         addObserver:GetTerminateObserver()
         selector:@selector(appTerminated:)
         name:NSWorkspaceDidTerminateApplicationNotification
         object:nil
         ];
    }
}

void LiveBrowserMgrMac::RemoveWorkspaceNotifications()
{
    if (m_chromeTerminateObserver) {
        [[[NSWorkspace sharedWorkspace] notificationCenter] removeObserver:m_chromeTerminateObserver];
        [m_chromeTerminateObserver release];
        m_chromeTerminateObserver = nil;
    }
}

LiveBrowserMgrMac* LiveBrowserMgrMac::s_instance = NULL;

// Forward declarations for functions defined later in this file
int32 ConvertNSErrorCode(NSError* error, bool isReading);
GoogleChromeApplication* GetGoogleChromeApplicationWithPid(int PID)
{
    try {
        // Ensure we have a valid process id before invoking ScriptingBridge.
        // We need this because negative pids (e.g ERR_PID_NOT_FOUND) will not
        // throw an exception, but rather will return a non-nil junk object
        // that causes Brackets to hang on close
        GoogleChromeApplication* app = PID < 0 ? nil : [SBApplication applicationWithProcessIdentifier:PID];

        // Second check before returning
        return [app respondsToSelector:@selector(name)] && [app.name isEqualToString:@"Google Chrome"] ? app : nil;
    }
    catch (...) {
        return nil;
    }
}

int OpenLiveBrowser(ExtensionString argURL, bool enableRemoteDebugging, ExtensionString appSupportDirectory)
{
    debugProfilePath = [NSString stringWithFormat:@"--user-data-dir=%s/live-dev-profile", appSupportDirectory.c_str()];
    
#if DEBUG_SHOW_PARAMS_IN_MESSAGE_BOX
    NSString *alertMsg = [NSString stringWithFormat:@"%s %d %s %@", argURL.c_str(), enableRemoteDebugging, appSupportDirectory.c_str(), debugProfilePath];
    
    NSAlert *alert = [[NSAlert alloc] init];
    [alert addButtonWithTitle:@"OK"];
    [alert addButtonWithTitle:@"Cancel"];
    [alert setMessageText:@"alertMsg"];
    [alert setInformativeText:alertMsg];
    [alert setAlertStyle:NSWarningAlertStyle];
    [alert runModal];
    [alert release];
#endif
    
    LiveBrowserMgrMac* liveBrowserMgr = LiveBrowserMgrMac::GetInstance();

    // Parse the arguments
    NSString *urlString = [NSString stringWithUTF8String:argURL.c_str()];
    
    // Find instances of the Browser
    NSRunningApplication* liveBrowser = liveBrowserMgr->GetLiveBrowser();
    
    // Get the corresponding chromeApp scriptable browser object
    GoogleChromeApplication* chromeApp = !liveBrowser ? nil : GetGoogleChromeApplicationWithPid([liveBrowser processIdentifier]);

    // Launch Browser
    if (!chromeApp) {
        NSURL* appURL = [[NSWorkspace sharedWorkspace] URLForApplicationWithBundleIdentifier:appId];
        if( !appURL ) {
            return ERR_NOT_FOUND; //Chrome not installed
        }

        // Create the configuration dictionary for launching with custom parameters.
        NSArray *parameters = [NSArray arrayWithObjects:
                      @"--no-first-run",
                      @"--no-default-browser-check",
                      debugPortCommandlineArguments,
                      debugProfilePath,
                      urlString,
                      nil];

        NSDictionary* appConfig = [NSDictionary dictionaryWithObject:parameters forKey:NSWorkspaceLaunchConfigurationArguments];
        NSUInteger launchOptions = NSWorkspaceLaunchDefault | NSWorkspaceLaunchNewInstance;

        liveBrowser = [[NSWorkspace sharedWorkspace] launchApplicationAtURL:appURL options:launchOptions configuration:appConfig error:nil];
        if (!liveBrowser) {
            return ERR_UNKNOWN;
        }

        liveBrowserMgr->SetLiveBrowserPid([liveBrowser processIdentifier]);
        liveBrowserMgr->SetWorkspaceNotifications();

        return NO_ERROR;
    }

    [liveBrowser activateWithOptions:NSApplicationActivateIgnoringOtherApps];

    // Check for existing tab with url already loaded
    for (GoogleChromeWindow* chromeWindow in [chromeApp windows]) {
        for (GoogleChromeTab* tab in [chromeWindow tabs]) {
            if ([tab.URL isEqualToString:urlString]) {
                // Found and open tab with url already loaded
                return NO_ERROR;
            }
        }
    }

    // Tell the Browser to load the url
    GoogleChromeWindow* chromeWindow = [[chromeApp windows] objectAtIndex:0];
    if (!chromeWindow || [[chromeWindow tabs] count] == 0) {
        // Create new Window
        GoogleChromeWindow* chromeWindow = [[[chromeApp classForScriptingClass:@"window"] alloc] init];
        [[chromeApp windows] addObject:chromeWindow];
        chromeWindow.activeTab.URL = urlString;
        [chromeWindow release];
    } else {
        // Create new Tab
        GoogleChromeTab* chromeTab = [[[chromeApp classForScriptingClass:@"tab"] alloc] initWithProperties:@{@"URL": urlString}];
        [[chromeWindow tabs] addObject:chromeTab];
        [chromeTab release];
    }

    return NO_ERROR;
}

    
}

@implementation ChromeWindowsTerminatedObserver

- (void) appTerminated:(NSNotification *)note
{
    // Not Chrome? Not interested.
    if ( ![[[note userInfo] objectForKey:@"NSApplicationBundleIdentifier"] isEqualToString:appId] ) {
        return;
    }

    // Not LiveBrowser instance? Not interested.
    if ( ![[[note userInfo] objectForKey:@"NSApplicationProcessIdentifier"] isEqualToNumber:[NSNumber numberWithInt:LiveBrowserMgr::LiveBrowserMgrMac::GetInstance()->GetLiveBrowserPid()]] ) {
        return;
    }

    LiveBrowserMgr::LiveBrowserMgrMac::GetInstance()->CheckForChromeRunning();
}

- (void) timeoutTimer:(NSTimer*)timer
{
    LiveBrowserMgr::LiveBrowserMgrMac::GetInstance()->CheckForChromeRunningTimeout();
}

@end
