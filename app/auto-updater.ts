import * as os from "os";
import { app, autoUpdater, ipcMain } from "electron";
import { getLogger, isDev } from "./utils";

const log = getLogger("auto-updater");
export const UPDATE_SERVER_HOST = "brackets-electron-nuts.herokuapp.com";

function notify(window: Electron.BrowserWindow, title: string, message: string) {
    window.webContents.send("notify", title, message);
}

export default class AppUpdater {
    constructor(window: Electron.BrowserWindow) {
        if (isDev()) {
            log.info(`isDev() true, auto-updater disabled`);
            return;
        }

        const version = app.getVersion();
        const feedUrl = `https://${UPDATE_SERVER_HOST}/update/${os.platform()}/${version}`;
        autoUpdater.setFeedURL(feedUrl);

        autoUpdater.addListener("update-available", (event: any) => {
            log.info("A new update is available");
        });
        autoUpdater.addListener(
            "update-downloaded",
            (event: any, releaseNotes: string, releaseName: string, releaseDate: string, updateURL: string) => {
                notify(
                    window,
                    "A new update is ready to install",
                    `Version ${releaseName} is downloaded and will be automatically installed on Quit`
                );
            }
        );
        autoUpdater.addListener("error", (error: any) => {
            log.error(error);
        });
        autoUpdater.addListener("checking-for-update", (event: any) => {
            log.info("checking-for-update");
        });
        autoUpdater.addListener("update-not-available", () => {
            log.info("update-not-available");
        });
        ipcMain.on("brackets-app-ready", () => {
            autoUpdater.checkForUpdates();
        });
    }
}
