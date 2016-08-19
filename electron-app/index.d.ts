// define global object extensions
declare namespace NodeJS  {
    interface Global {
        // TODO: better define appshell (brackets) global object
        appshell: any;
        brackets: any;
        electron: Electron.ElectronMainAndRenderer;
        node: {
            process: NodeJS.Process;
            require: NodeRequire;
            module: NodeModule;
            __filename: string;
            __dirname: string;
        };
    }
}
