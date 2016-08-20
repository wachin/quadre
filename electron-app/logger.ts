const { log, error } = console; // tslint:disable-line

export function get(name: string) {
    return {
        info: (...msgs) => log(name, ...msgs),
        error: (...msgs) => error(name, ...msgs)
    };
}
