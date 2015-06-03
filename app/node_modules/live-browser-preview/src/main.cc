/*
 * Copyright (c) 2015 Adobe Systems Incorporated. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

#include "live_browser_preview.h"

using namespace v8;

NAN_METHOD(OpenLiveBrowser) {
    
    NanScope();
    
    if (!args[0]->IsString() )
        return NanThrowTypeError("Bad argument");
    
    std::string urlString (*String::Utf8Value(args[0]));
    bool enableRemoteDebugging = args[1]->BooleanValue();
    std::string appSupportDirectory (*String::Utf8Value(args[2]));
    
    NanReturnValue( NanNew<Integer>(LiveBrowserMgr::OpenLiveBrowser(urlString, enableRemoteDebugging, appSupportDirectory) ) );
    
}

NAN_METHOD(CloseLiveBrowser) {
  NanScope();

    if (!args[0]->IsFunction())
        return NanThrowTypeError("Function required");

    LiveBrowserMgr::CloseLiveBrowser(args);

    NanReturnUndefined();
}
    
void Init(Handle<Object> exports) {
  NODE_SET_METHOD(exports, "openLiveBrowser", OpenLiveBrowser);
  NODE_SET_METHOD(exports, "closeLiveBrowser", CloseLiveBrowser);
}

NODE_MODULE(live_browser_preview, Init)
