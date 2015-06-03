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

#ifndef LIVE_BROWSER_PREVIEW_H_
#define LIVE_BROWSER_PREVIEW_H_

#include "nan.h"
#include <string>
#include <vector>

#ifdef _WIN32
    // MAX_PATH is only 260 chars which really isn't big enough for really long unc pathnames
    //  so use this constant instead which accounts for some really long pathnames
    #define MAX_UNC_PATH 4096
#endif

namespace LiveBrowserMgr{
    int  OpenLiveBrowser(const std::string &argURL, bool enableRemoteDebugging, const std::string &appSupportDirectory);
    void CloseLiveBrowser(const v8::FunctionCallbackInfo<v8::Value>& callbackFunction);
}

#endif  // LIVE_BROWSER_PREVIEW_H_
