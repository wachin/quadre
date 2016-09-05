/* eslint-disable */

export interface NodeConnectionRequestMessage {
    id: number;
    domain: string;
    command: string;
    parameters: any[];
}

export interface NodeConnectionResponseMessage {
    id: number;
    domain: string;
    event: string;
    message: any;
    parameters: any[];
    response: any;
    stack: string;
}
