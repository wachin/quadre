const { log, warn, error } = console; // tslint:disable-line

export function get(name: string) {
    return {
        info: (...msgs: string[]) => log(`[${name}]`, ...msgs),
        warn: (...msgs: string[]) => warn(`[${name}]`, ...msgs),
        error: (...msgs: string[]) => error(`[${name}]`, ...msgs)
    };
}
