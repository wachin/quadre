/* eslint no-undef:0 */

declare module "electron-localshortcut" {

  export function register(window: Electron.BrowserWindow, accelerator: string, callback: Function): void;

  export function unregisterAll(window: Electron.BrowserWindow): void;

}
