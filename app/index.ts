import { handleStartupEvent } from "./squirrel-event-handler";

if (!handleStartupEvent()) {
    require("./shell");
}
