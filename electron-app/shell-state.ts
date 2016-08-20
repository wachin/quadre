import * as _ from "lodash";

const state = {
    socketServer: {
        state: "ERR_NODE_NOT_YET_STARTED",
        port: null
    }
};

export function get(key) { return _.get(state, key); }

export function set(key, value) { return _.set(state, key, value); }
