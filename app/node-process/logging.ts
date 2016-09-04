/* eslint-env node */

export const log = {
    info: (msg: string) => {
        process.send && process.send({ type: "log", level: "info", msg });
    },
    warn: (msg: string) => {
        process.send && process.send({ type: "log", level: "warn", msg });
    },
    error: (msg: string) => {
        process.send && process.send({ type: "log", level: "error", msg });
    }
};
console.log = (...args: any[]) => log.info(args.join(" "));
console.info = (...args: any[]) => log.info(args.join(" "));
console.warn = (...args: any[]) => log.warn(args.join(" "));
console.error = (...args: any[]) => log.error(args.join(" "));
