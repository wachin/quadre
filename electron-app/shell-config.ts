import * as _ from "lodash";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as utils from "./utils";
import { app } from "electron";

const CONFIG_PATH = path.resolve(utils.convertWindowsPathToUnixPath(app.getPath("userData")), "shell-config.json");
let config: {};

if (!process.env.TMPDIR && !process.env.TMP && !process.env.TEMP) {
    process.env.TMPDIR = process.env.TMP = process.env.TEMP = os.tmpdir();
}

try {
    config = fs.readJsonSync(CONFIG_PATH);
} catch (err) {
    if (err.code === "ENOENT") {
        config = fs.readJsonSync(path.resolve(__dirname, "default-shell-config.json"));
        fs.ensureDirSync(path.dirname(CONFIG_PATH));
        fs.writeJsonSync(CONFIG_PATH, config);
    } else if (err.name === "SyntaxError") {
        throw new Error("File is not a valid json: " + CONFIG_PATH);
    } else {
        throw err;
    }
}

export function save() {
    fs.writeJson(CONFIG_PATH, config);
}

export function saveSync() {
    fs.writeJsonSync(CONFIG_PATH, config);
}

export function get(key: string): any {
    return _.get(config, key);
}

export function getNumber(key: string): number {
    const result = get(key);
    if (typeof result !== "number") {
        throw new Error(`getNumber -> not-a-number: ${result}`);
    }
    return result;
}

export function set(key: string, value: any): any {
    return _.set(config, key, value);
}
