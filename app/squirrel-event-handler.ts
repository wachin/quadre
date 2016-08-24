import { app } from "electron";
import { spawn } from "child_process";
import * as logger from "./logger";
import * as path from "path";

const log = logger.get("squirrel-event-handler");

function run(args: string[], done: Function): void {
    const updateExe = path.resolve(path.dirname(process.execPath), "..", "Update.exe");
    log.info(`Spawning '${updateExe}' with args '${args}'`);
    spawn(updateExe, args, { detached: true })
        .on("close", done);
}

export function handleStartupEvent(): boolean {
    if (process.platform !== "win32") {
        return false;
    }

    const cmd = process.argv[1];
    const target = path.basename(process.execPath);

    if (cmd === "--squirrel-install" || cmd === "--squirrel-updated") {
        log.info(`Processing squirrel command '${cmd}'`);
        run(["--createShortcut=" + target + ""], app.quit);
        return true;
    }

    if (cmd === "--squirrel-uninstall") {
        log.info(`Processing squirrel command '${cmd}'`);
        run(["--removeShortcut=" + target + ""], app.quit);
        return true;
    }

    if (cmd === "--squirrel-obsolete") {
        log.info(`Processing squirrel command '${cmd}'`);
        app.quit();
        return true;
    }

    return false;
}
