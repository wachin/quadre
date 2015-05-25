#include "nan.h"
using namespace v8;

#include "live_browser_preview.h"

namespace {

NAN_METHOD(OpenLiveBrowser) {
    
    NanScope();
    
    if (!args[0]->IsString() )
        return NanThrowTypeError("Bad argument");
    
    std::string urlString (*String::Utf8Value(args[0]));
    bool enableRemoteDebugging = args[1]->BooleanValue();
    std::string appSupportDirectory (*String::Utf8Value(args[2]));
    
    //bool enableRemoteDebugging = 
    NanReturnValue( NanNew<Integer>(LiveBrowserMgr::OpenLiveBrowser(towstring(urlString), enableRemoteDebugging, towstring(appSupportDirectory) ) ) );
    
}

void Init(Handle<Object> exports) {
  NODE_SET_METHOD(exports, "openLiveBrowser", OpenLiveBrowser);
}

}  // namespace

NODE_MODULE(live_browser_preview, Init)
