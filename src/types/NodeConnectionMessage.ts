/* eslint-disable */

export interface NodeConnectionMessage {
    id: number;
    domain: string;
    event: string;
    message: any;
    parameters: any[];
    response: any;
    stack: string;
}

export default NodeConnectionMessage;
