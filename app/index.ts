#!/usr/bin/env electron

import { handleStartupEvent } from "./squirrel-event-handler";

if (!handleStartupEvent()) {
    require("./main");
}
