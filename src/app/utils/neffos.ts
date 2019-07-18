// Make it compatible to run with browser and inside nodejs
// the good thing is that the node's WebSocket module has the same API as the browser's one,
// so all works and minimum changes were required to achieve that result.
// See the `genWait()` too.
const isBrowser = (typeof window !== 'undefined');
var _fetch: any = (typeof fetch !== 'undefined') ? fetch : undefined;
if (!isBrowser) {
    WebSocket = require('ws');
    _fetch = require('node-fetch');
} else {
    WebSocket = window["WebSocket"];
}

/* The WSData is just a string type alias. */
type WSData = string;
/* The OnNamespaceConnect is the event name that it's fired on before namespace connect. */
const OnNamespaceConnect = "_OnNamespaceConnect";
/* The OnNamespaceConnected is the event name that it's fired on after namespace connect. */
const OnNamespaceConnected = "_OnNamespaceConnected";
/* The OnNamespaceDisconnect is the event name that it's fired on namespace disconnected. */
const OnNamespaceDisconnect = "_OnNamespaceDisconnect";
/* The OnRoomJoin is the event name that it's fired on before room join. */
const OnRoomJoin = "_OnRoomJoin";
/* The OnRoomJoined is the event name that it's fired on after room join. */
const OnRoomJoined = "_OnRoomJoined";
/* The OnRoomLeave is the event name that it's fired on before room leave. */
const OnRoomLeave = "_OnRoomLeave";
/* The OnRoomLeft is the event name that it's fired on after room leave. */
const OnRoomLeft = "_OnRoomLeft";
/* The OnAnyEvent is the event name that it's fired, if no incoming event was registered, it's a "wilcard". */
const OnAnyEvent = "_OnAnyEvent";
/* The OnNativeMessage is the event name, which if registered on empty ("") namespace
   it accepts native messages(Message.Body and Message.IsNative is filled only). */
const OnNativeMessage = "_OnNativeMessage";

const ackBinary = 'M'; // see `onopen`, comes from client to server at startup.
// see `handleAck`.
const ackIDBinary = 'A';// comes from server to client after ackBinary and ready as a prefix, the rest message is the conn's ID.
const ackNotOKBinary = 'H'; // comes from server to client if `Server#OnConnected` errored as a prefix, the rest message is the error text.

const waitIsConfirmationPrefix = '#';
const waitComesFromClientPrefix = '$';

/* The isSystemEvent reports whether the "event" is a system event;
connect, connected, disconnect, room join, room joined, room leave, room left. */
function isSystemEvent(event: string): boolean {
    switch (event) {
        case OnNamespaceConnect:
        case OnNamespaceConnected:
        case OnNamespaceDisconnect:
        case OnRoomJoin:
        case OnRoomJoined:
        case OnRoomLeave:
        case OnRoomLeft:
            return true;
        default:
            return false;
    }
}

function isEmpty(s: any): boolean {
    if (s === undefined) {
        return true
    }

    if (s === null) {
        return true
    }

    if (s == "" || typeof s === 'string' || s instanceof String) {
        return s.length === 0 || s === "";
    }

    if (s instanceof Error) {
        return isEmpty(s.message);
    }

    return false;
}

/* The Message is the structure which describes the icoming data (and if `Conn.Write` is manually used to write). */
class Message {
    wait: string;
    /* The Namespace that this message sent to. */
    Namespace: string;
    /* The Room that this message sent to. */
    Room: string;
    /* The Event that this message sent to. */
    Event: string;
    /* The actual body of the incoming data. */
    Body: WSData;
    /* The Err contains any message's error if defined and not empty.
       server-side and client-side can return an error instead of a message from inside event callbacks. */
    Err: Error;

    isError: boolean;
    isNoOp: boolean;

    isInvalid: boolean;
    /* The IsForced if true then it means that this is not an incoming action but a force action.
       For example when websocket connection lost from remote the OnNamespaceDisconnect `Message.IsForced` will be true */
    IsForced: boolean;
    /* The IsLocal reprots whether an event is sent by the client-side itself, i.e when `connect` call on `OnNamespaceConnect` event the `Message.IsLocal` will be true,
       server-side can force-connect a client to connect to a namespace as well in this case the `IsLocal` will be false. */
    IsLocal: boolean;
    /* The IsNative reports whether the Message is websocket native messages, only Body is filled. */
    IsNative: boolean;

    /* The SetBinary can be filled to true if the client must send this message using the Binary format message.
	   This field is not filled on sending/receiving. */
    // SetBinary: boolean;

    isConnect(): boolean {
        return this.Event == OnNamespaceConnect || false;
    }

    isDisconnect(): boolean {
        return this.Event == OnNamespaceDisconnect || false;
    }


    isRoomJoin(): boolean {
        return this.Event == OnRoomJoin || false;
    }


    isRoomLeft(): boolean {
        return this.Event == OnRoomLeft || false;
    }

    isWait(): boolean {
        if (isEmpty(this.wait)) {
            return false;
        }

        if (this.wait[0] == waitIsConfirmationPrefix) {
            return true;
        }

        return this.wait[0] == waitComesFromClientPrefix || false;
    }

    /* unmarshal method returns this Message's `Body` as an object,
       equivalent to the Go's `neffos.Message.Unmarshal` method.
       It can be used inside an event's callbacks.
       See library-level `marshal` function too. */
    unmarshal(): any {
        return JSON.parse(this.Body);
    }
}

/* marshal takes an object and returns its serialized to string form, equivalent to the Go's `neffos.Marshal`.
   It can be used on `emit` methods.   
   See `Message.unmarshal` method too. */
function marshal(obj: any): string {
    return JSON.stringify(obj);
}

/* Obsiously, the below should match the server's side. */
const messageSeparator = ';';
const messageFieldSeparatorReplacement = "@%!semicolon@%!";
const validMessageSepCount = 7;
const trueString = "1";
const falseString = "0";

const escapeRegExp = new RegExp(messageSeparator, "g");
function escapeMessageField(s: string): string {
    if (isEmpty(s)) {
        return "";
    }

    return s.replace(escapeRegExp, messageFieldSeparatorReplacement);
}


const unescapeRegExp = new RegExp(messageFieldSeparatorReplacement, "g");
function unescapeMessageField(s: string): string {
    if (isEmpty(s)) {
        return "";
    }

    return s.replace(unescapeRegExp, messageSeparator);
}

class replyError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'replyError';
        Error.captureStackTrace(this, replyError);

        // Set the prototype explicitly,
        // see `isReply`'s comments for more information.
        Object.setPrototypeOf(this, replyError.prototype);
    }
}

/* reply function is a helper for nsConn.Emit(incomignMsg.Event, newBody)
   it can be used as a return value of any MessageHandlerFunc. */
function reply(body: WSData): Error {
    return new replyError(body);
}

function isReply(err: Error): boolean {

    // unfortunately this doesn't work like normal ES6,
    // typescript has an issue:
    // https://github.com/Microsoft/TypeScript/issues/22585
    // https://github.com/Microsoft/TypeScript/issues/13965
    // hack but doesn't work on IE 10 and prior, we can adapt it
    // because the library itself is designed for modern browsers instead.
    //
    // https://github.com/Microsoft/TypeScript/wiki/FAQ#why-doesnt-extending-built-ins-like-error-array-and-map-work
    return (err instanceof replyError);
}

function serializeMessage(msg: Message): WSData {
    if (msg.IsNative && isEmpty(msg.wait)) {
        return msg.Body;
    }

    let isErrorString = falseString;
    let isNoOpString = falseString;
    let body = msg.Body || "";

    if (!isEmpty(msg.Err)) {
        body = msg.Err.message;
        if (!isReply(msg.Err)) {
            isErrorString = trueString;
        }
    }

    if (msg.isNoOp) {
        isNoOpString = trueString;
    }

    return [
        msg.wait || "",
        escapeMessageField(msg.Namespace),
        escapeMessageField(msg.Room),
        escapeMessageField(msg.Event),
        isErrorString,
        isNoOpString,
        body].join(messageSeparator);
}

// behaves like Go's SplitN, default javascript's does not return the remainder and we need this for the dts[6]
function splitN(s: string, sep: string, limit: number): Array<string> {
    if (limit == 0) return [s];
    var arr = s.split(sep, limit);
    if (arr.length == limit) {
        let curr = arr.join(sep) + sep;
        arr.push(s.substr(curr.length));
        return arr;
    } else {
        return [s];
    }
}

// <wait>;
// <namespace>;
// <room>;
// <event>;
// <isError(0-1)>;
// <isNoOp(0-1)>;
// <body||error_message>
function deserializeMessage(data: WSData, allowNativeMessages: boolean): Message {
    var msg: Message = new Message();
    if (data.length == 0) {
        msg.isInvalid = true;
        return msg;
    }

    let dts = splitN(data, messageSeparator, validMessageSepCount - 1);
    if (dts.length != validMessageSepCount) {
        if (!allowNativeMessages) {
            msg.isInvalid = true;
        } else {
            msg.Event = OnNativeMessage;
            msg.Body = data;
        }

        return msg;
    }

    msg.wait = dts[0];
    msg.Namespace = unescapeMessageField(dts[1]);
    msg.Room = unescapeMessageField(dts[2]);
    msg.Event = unescapeMessageField(dts[3]);
    msg.isError = dts[4] == trueString || false;
    msg.isNoOp = dts[5] == trueString || false;

    let body = dts[6];
    if (!isEmpty(body)) {
        if (msg.isError) {
            msg.Err = new Error(body);
        } else {
            msg.Body = body;
        }
    } else {
        msg.Body = "";
    }

    msg.isInvalid = false;
    msg.IsForced = false;
    msg.IsLocal = false;
    msg.IsNative = (allowNativeMessages && msg.Event == OnNativeMessage) || false;
    // msg.SetBinary = false;
    return msg;
}

function genWait(): string {
    if (!isBrowser) {
        let hrTime = process.hrtime();
        return waitComesFromClientPrefix + hrTime[0] * 1000000000 + hrTime[1];
    } else {
        let now = window.performance.now();
        return waitComesFromClientPrefix + now.toString();
    }
}

function genWaitConfirmation(wait: string): string {
    return waitIsConfirmationPrefix + wait;
}

function genEmptyReplyToWait(wait: string): string {
    return wait + messageSeparator.repeat(validMessageSepCount - 1);
}

/* The Room describes a connected connection to a room,
   emits messages with the `Message.Room` filled to the specific room
   and `Message.Namespace` to the underline `NSConn`'s namespace. */
class Room {
    nsConn: NSConn;
    name: string;

    constructor(ns: NSConn, roomName: string) {
        this.nsConn = ns;
        this.name = roomName;
    }

    /* The emit method sends a message to the server with its `Message.Room` filled to this specific room
       and `Message.Namespace` to the underline `NSConn`'s namespace. */
    emit(event: string, body: WSData): boolean {
        let msg = new Message();
        msg.Namespace = this.nsConn.namespace;
        msg.Room = this.name;
        msg.Event = event;
        msg.Body = body;
        return this.nsConn.conn.write(msg);
    }

    /* The leave method sends a local and server room leave signal `OnRoomLeave`
       and if succeed it fires the OnRoomLeft` event. */
    leave(): Promise<Error> {
        let msg = new Message();
        msg.Namespace = this.nsConn.namespace;
        msg.Room = this.name;
        msg.Event = OnRoomLeave;
        return this.nsConn.askRoomLeave(msg);
    }
}

/* The NSConn describes a connected connection to a specific namespace,
   it emits with the `Message.Namespace` filled and it can join to multiple rooms.
   A single Conn can be connected to one or more namespaces,
   each connected namespace is described by this class. */
class NSConn {
    /* The conn property refers to the main `Conn` constructed by the `dial` function. */
    conn: Conn;
    namespace: string;
    events: Events;
    /* The rooms property its the map of the connected namespace's joined rooms. */
    rooms: Map<string, Room>;

    constructor(conn: Conn, namespace: string, events: Events) {
        this.conn = conn;
        this.namespace = namespace;
        this.events = events;
        this.rooms = new Map<string, Room>();
    }

    /* The emit method sends a message to the server with its `Message.Namespace` filled to this specific namespace. */
    emit(event: string, body: WSData): boolean {
        let msg = new Message();
        msg.Namespace = this.namespace;
        msg.Event = event;
        msg.Body = body;
        return this.conn.write(msg);
    }

    /* See `Conn.ask`. */
    ask(event: string, body: WSData): Promise<Message> {
        let msg = new Message();
        msg.Namespace = this.namespace;
        msg.Event = event;
        msg.Body = body;
        return this.conn.ask(msg);
    }
    /* The joinRoom method can be used to join to a specific room, rooms are dynamic.
       Returns a `Room` or an error. */
    async joinRoom(roomName: string): Promise<Room> {
        return await this.askRoomJoin(roomName);
    }

    /* The room method returns a joined `Room`. */
    room(roomName: string): Room {
        return this.rooms.get(roomName);
    }

    // Rooms(): Room[] {
    //     let rooms = new Array<Room>(this.rooms.size);
    //     this.rooms.forEach((room) => {
    //         rooms.push(room);
    //     })
    //     return rooms;
    // }

    /* The leaveAll method sends a leave room signal to all rooms and fires the `OnRoomLeave` and `OnRoomLeft` (if no error occurred) events. */
    async leaveAll(): Promise<Error> {
        let leaveMsg = new Message();
        leaveMsg.Namespace = this.namespace;
        leaveMsg.Event = OnRoomLeft;
        leaveMsg.IsLocal = true;

        this.rooms.forEach(async (value, roomName) => {
            leaveMsg.Room = roomName;
            try {
                await this.askRoomLeave(leaveMsg);
            } catch (err) {
                return err;
            }
        })

        return null;
    }

    forceLeaveAll(isLocal: boolean) {
        let leaveMsg = new Message();
        leaveMsg.Namespace = this.namespace;
        leaveMsg.Event = OnRoomLeave;
        leaveMsg.IsForced = true;
        leaveMsg.IsLocal = isLocal;

        this.rooms.forEach((value, roomName) => {
            leaveMsg.Room = roomName;
            fireEvent(this, leaveMsg);

            this.rooms.delete(roomName);

            leaveMsg.Event = OnRoomLeft;
            fireEvent(this, leaveMsg);

            leaveMsg.Event = OnRoomLeave;
        });
    }

    /* The disconnect method sends a disconnect signal to the server and fires the `OnNamespaceDisconnect` event. */
    disconnect(): Promise<Error> {
        let disconnectMsg = new Message();
        disconnectMsg.Namespace = this.namespace;
        disconnectMsg.Event = OnNamespaceDisconnect;
        return this.conn.askDisconnect(disconnectMsg);
    }


    askRoomJoin(roomName: string): Promise<Room> {
        return new Promise(async (resolve, reject) => {
            let room = this.rooms.get(roomName);
            if (room !== undefined) {
                resolve(room);
                return;
            }

            let joinMsg = new Message();
            joinMsg.Namespace = this.namespace;
            joinMsg.Room = roomName;
            joinMsg.Event = OnRoomJoin;
            joinMsg.IsLocal = true;

            try {
                await this.conn.ask(joinMsg);
            } catch (err) {
                reject(err);
                return;
            }

            let err = fireEvent(this, joinMsg);
            if (!isEmpty(err)) {
                reject(err);
                return;
            }

            room = new Room(this, roomName);
            this.rooms.set(roomName, room);

            joinMsg.Event = OnRoomJoined;
            fireEvent(this, joinMsg);
            resolve(room);
        });
    }

    async askRoomLeave(msg: Message): Promise<Error> {
        if (!this.rooms.has(msg.Room)) {
            return ErrBadRoom;
        }

        try {
            await this.conn.ask(msg)
        } catch (err) {
            return err;
        }

        let err = fireEvent(this, msg);
        if (!isEmpty(err)) {
            return err;
        }

        this.rooms.delete(msg.Room);

        msg.Event = OnRoomLeft;
        fireEvent(this, msg);
        return null;
    }

    replyRoomJoin(msg: Message): void {
        if (isEmpty(msg.wait) || msg.isNoOp) {
            return;
        }

        if (!this.rooms.has(msg.Room)) {
            let err = fireEvent(this, msg);
            if (!isEmpty(err)) {
                msg.Err = err;
                this.conn.write(msg);
                return;
            }

            this.rooms.set(msg.Room, new Room(this, msg.Room));

            msg.Event = OnRoomJoined;
            fireEvent(this, msg);
        }

        this.conn.writeEmptyReply(msg.wait);
    }

    replyRoomLeave(msg: Message): void {
        if (isEmpty(msg.wait) || msg.isNoOp) {
            return;
        }

        if (!this.rooms.has(msg.Room)) {
            this.conn.writeEmptyReply(msg.wait);
            return;
        }

        fireEvent(this, msg);

        this.rooms.delete(msg.Room);
        this.conn.writeEmptyReply(msg.wait);

        msg.Event = OnRoomLeft;
        fireEvent(this, msg);
    }
}


/* The MessageHandlerFunc is the definition type of the events' callback.
   Its error can be written to the other side on specific events,
   i.e on `OnNamespaceConnect` it will abort a remote namespace connection.
   See examples for more. */
type MessageHandlerFunc = (c: NSConn, msg: Message) => Error;


type Events = Map<string, MessageHandlerFunc>
type Namespaces = Map<string, Events>;

function fireEvent(ns: NSConn, msg: Message): Error {
    if (ns.events.has(msg.Event)) {
        return ns.events.get(msg.Event)(ns, msg);
    }

    if (ns.events.has(OnAnyEvent)) {
        return ns.events.get(OnAnyEvent)(ns, msg);
    }

    return null;
}


function isNull(obj: any): boolean {
    return (obj === null || obj === undefined || typeof obj === 'undefined')
}

function resolveNamespaces(obj: any, reject: (reason?: any) => void): Namespaces {
    if (isNull(obj)) {
        if (!isNull(reject)) {
            reject("connHandler is empty.");
        }
        return null;
    }

    let namespaces = new Map<string, Map<string, MessageHandlerFunc>>();

    // 1. if contains function instead of a string key then it's Events otherwise it's Namespaces.
    // 2. if contains a mix of functions and keys then ~put those functions to the namespaces[""]~ it is NOT valid.

    let events: Events = new Map<string, MessageHandlerFunc>();
    // const isMessageHandlerFunc = (value: any): value is MessageHandlerFunc => true;

    let totalKeys: number = 0;
    Object.keys(obj).forEach(function (key, index) {
        totalKeys++;
        let value = obj[key];
        // if (isMessageHandlerFunc(value)) {
        if (value instanceof Function) {
            // console.log(key + " event probably contains a message handler: ", value)
            events.set(key, value)
        } else if (value instanceof Map) {
            // console.log(key + " is a namespace map which contains the following events: ", value)
            namespaces.set(key, value);
        } else {
            // it's an object, convert it to a map, it's events.
            // console.log(key + " is an object of: ", value);
            let objEvents = new Map<string, MessageHandlerFunc>();
            Object.keys(value).forEach(function (objKey, objIndex) {
                // console.log("set event: " + objKey + " of value: ", value[objKey])
                objEvents.set(objKey, value[objKey]);
            });
            namespaces.set(key, objEvents)
        }
    });

    if (events.size > 0) {
        if (totalKeys != events.size) {
            if (!isNull(reject)) {
                reject("all keys of connHandler should be events, mix of namespaces and event callbacks is not supported " + events.size + " vs total " + totalKeys);
            }
            return null;
        }
        namespaces.set("", events);
    }

    // console.log(namespaces);
    return namespaces;
}

function getEvents(namespaces: Namespaces, namespace: string): Events {
    if (namespaces.has(namespace)) {
        return namespaces.get(namespace);
    }

    return null;
}

type waitingMessageFunc = (msg: Message) => void;

/* This is the prefix that Options.header function is set to a url parameter's key in order to serve to parse it as header.
 The server's `URLParamAsHeaderPrefix` must match.
 Note that on the Nodejs side this is entirely optional, nodejs and go client support custom headers without url parameters parsing. */
const URLParamAsHeaderPrefix = "X-Websocket-Header-"


interface Headers {
    [key: string]: any;
}

/* Options contains optional fields. Can be passed on the `dial` function. */
interface Options {
    // If nodejs then let it pass as it's;
    // As CoreOptions (from nodejs request module):
    // https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/request/index.d.ts#L143
    headers?: Headers;
    //
    protocols?: string[];
    // if > 0 then it enables reconnection feature
    // and it tries every "x" milliseconds of this `reconnect` field. 
    reconnect?: number;
}

function parseHeadersAsURLParameters(headers: Headers, url: string): string {
    if (isNull(headers)) {
        return url;
    }

    for (let key in headers) {
        if (headers.hasOwnProperty(key)) {
            let value = headers[key];
            key = encodeURIComponent(URLParamAsHeaderPrefix + key); value = encodeURIComponent(value);

            const part = key + "=" + value;
            url = (url.indexOf("?") != -1 ?
                url.split("?")[0] + "?" + part + "&" + url.split("?")[1] :
                (url.indexOf("#") != -1 ? url.split("#")[0] + "?" + part + "#" + url.split("#")[1] : url + '?' + part));
        }
    }

    return url;
}

/* The dial function returns a neffos client, a new `Conn` instance.
   First parameter is the endpoint, i.e ws://localhost:8080/echo,
   the second parameter can be any object of the form of:
   namespace: {eventName: eventHandler, eventName2: ...} or {eventName: eventHandler}.
   Example Code:
    var conn = await neffos.dial("ws://localhost:8080/echo", {
      default: { // "default" namespace.
        _OnNamespaceConnected: function (ns, msg) {
          console.log("connected to namespace: " + msg.Namespace);
        },
        _OnNamespaceDisconnect: function (ns, msg) {
          console.log("disconnected from namespace: " + msg.Namespace);
        },
        _OnRoomJoined: function (ns, msg) {
          console.log("joined to room: " + msg.Room);
        },
        _OnRoomLeft: function (ns, msg) {
          console.log("left from room: " + msg.Room);
        },
        chat: function (ns, msg) { // "chat" event.
          let prefix = "Server says: ";
          if (msg.Room !== "") {
            prefix = msg.Room + " >> ";
          }
          console.log(prefix + msg.Body);
        }
      }
    });

    var nsConn = await conn.connect("default");
    nsConn.emit("chat", "Hello from client side!");
    See https://github.com/kataras/neffos.js/tree/master/_examples for more.
*/
function dial(endpoint: string, connHandler: any, options?: Options | any): Promise<Conn> {
    return _dial(endpoint, connHandler, 0, options);
}

// this header key should match the server.ServeHTTP's.
const websocketReconnectHeaderKey = 'X-Websocket-Reconnect';

function _dial(endpoint: string, connHandler: any, tries: number, options?: Options | any): Promise<Conn> {
    if (isBrowser && endpoint.indexOf("/") == 0) {
        // if is running from browser and endpoint starts with /
        // lets try to fix it, useful when developers changing environments and servers.
        const scheme = document.location.protocol == "https:" ? "wss" : "ws";
        const port = document.location.port ? ":" + document.location.port : "";
        endpoint = scheme+"://"+document.location.hostname+port+endpoint;
    }

    if (endpoint.indexOf("ws") == -1) {
        endpoint = "ws://" + endpoint;
    }

    return new Promise((resolve, reject) => {
        if (!WebSocket) {
            reject("WebSocket is not accessible through this browser.");
        }


        let namespaces = resolveNamespaces(connHandler, reject);
        if (isNull(namespaces)) {
            return;
        }


        if (isNull(options)) {
            options = {};
        }

        if (isNull(options.headers)) {
            options.headers = {};
        }

        const reconnectEvery: number = (options.reconnect) ? options.reconnect : 0;

        if (tries > 0 && reconnectEvery > 0) {
            //     options.headers = {
            //         [websocketReconnectHeaderKey]: tries.toString()
            //     };
            options.headers[websocketReconnectHeaderKey] = tries.toString();
        } else if (!isNull(options.headers[websocketReconnectHeaderKey])) /* against tricks */ {
            delete options.headers[websocketReconnectHeaderKey];
        }

        const ws = makeWebsocketConnection(endpoint, options)
        let conn = new Conn(ws, namespaces);
        conn.reconnectTries = tries;

        ws.binaryType = "arraybuffer";
        ws.onmessage = ((evt: MessageEvent) => {
            let err = conn.handle(evt);
            if (!isEmpty(err)) {
                reject(err);
                return;
            }

            if (conn.isAcknowledged()) {
                resolve(conn);
            }
        });
        ws.onopen = ((evt: Event) => {
            // let b = new Uint8Array(1)
            // b[0] = 1;
            // this.conn.send(b.buffer);
            ws.send(ackBinary);
        });
        ws.onerror = ((err: Event) => {
            // if (err.type !== undefined && err.type == "error" && (ws.readyState == ws.CLOSED || ws.readyState == ws.CLOSING)) {
            //     // for any case, it should never happen.
            //     return;
            // }
            conn.close();
            reject(err);
        });
        ws.onclose = ((evt: Event): any => {
            if (conn.isClosed()) {
                // reconnection is NOT allowed when:
                // 1. server force-disconnect this client.
                // 2. client disconnects itself manually.
                // We check those two ^ with conn.isClosed().
                // console.log("manual disconnect.")
            } else {
                // disable all previous event callbacks.
                ws.onmessage = undefined;
                ws.onopen = undefined;
                ws.onerror = undefined;
                ws.onclose = undefined;

                if (reconnectEvery <= 0) {
                    conn.close();
                    return null;
                }

                // get the connected namespaces before .close clears.
                let previouslyConnectedNamespacesNamesOnly = new Map<string, Array<string>>() // connected namespaces[key] -> [values]joined rooms;
                conn.connectedNamespaces.forEach((nsConn: NSConn, name: string) => {
                    let previouslyJoinedRooms = new Array<string>();
                    if (!isNull(nsConn.rooms) && nsConn.rooms.size > 0) {
                        nsConn.rooms.forEach((roomConn, roomName) => {
                            previouslyJoinedRooms.push(roomName);
                        });
                    }
                    previouslyConnectedNamespacesNamesOnly.set(name, previouslyJoinedRooms);
                })

                conn.close();

                whenResourceOnline(endpoint, reconnectEvery, (tries: number) => {
                    _dial(endpoint, connHandler, tries, options).then((newConn: Conn) => {
                        if (isNull(resolve) || resolve.toString() == "function () { [native code] }") {
                            // Idea behind the below:
                            // If the original promise was in try-catch statement instead of .then and .catch callbacks
                            // then this block will be called however, we don't have a way
                            // to guess the user's actions in a try block, so we at least,
                            //  we will try to reconnect to the previous namespaces automatically here.

                            previouslyConnectedNamespacesNamesOnly.forEach((joinedRooms, name) => {

                                let whenConnected = (joinedRooms: string[]): ((newNSConn: NSConn) => void) => {
                                    return (newNSConn: NSConn) => {
                                        joinedRooms.forEach((roomName: string) => {
                                            newNSConn.joinRoom(roomName);
                                        });
                                    };
                                };

                                newConn.connect(name).then(whenConnected(joinedRooms));
                            })

                            return;
                        }

                        resolve(newConn);
                    }).catch(reject);
                });
            }


            return null;
        });
    });
}

function makeWebsocketConnection(endpoint: string, options?: Options | any) {
    if (isBrowser) {
        if (!isNull(options)) {
            if (options.headers) {
                endpoint = parseHeadersAsURLParameters(options.headers, endpoint);
            }

            if (options.protocols) {
                return new WebSocket(endpoint, options.protocols);
            } else {
                return new WebSocket(endpoint)
            }
        }
    }

    return new WebSocket(endpoint, options)
}

function whenResourceOnline(endpoint: string, checkEvery: number, notifyOnline: (tries: number) => void) {
    // Don't fire webscoket requests just yet.
    // We check if the HTTP endpoint is alive with a simple fetch, if it is alive then we notify the caller
    // to proceed with a websocket request. That way we can notify the server-side how many times
    // this client was trying to reconnect as well.
    // Note:
    // Chrome itself is emitting net::ERR_CONNECTION_REFUSED and the final Bad Request messages to the console on network failures on fetch,
    // there is no way to block them programmatically, we could do a console.clear but this will clear any custom logging the end-dev may has too.

    let endpointHTTP = endpoint.replace(/(ws)(s)?\:\/\//, "http$2://");

    // counts and sends as header the previous failures (if any) and the succeed last one.
    let tries = 1;

    const fetchOptions = { method: 'HEAD', mode: 'no-cors' };

    let check = (): void => {
        // Note:
        // We do not fire a try immediately after the disconnection as most developers will expect.
        _fetch(endpointHTTP, fetchOptions).then(() => {
            notifyOnline(tries);
        }).catch(() => { // on network failures.
            // if (err !== undefined && err.toString() !== "TypeError: Failed to fetch") {
            //     console.log(err);
            // }
            tries++;
            setTimeout(() => {
                check();
            }, checkEvery)
        });
    };

    setTimeout(check, checkEvery)
}

const ErrInvalidPayload = new Error("invalid payload");
const ErrBadNamespace = new Error("bad namespace");
const ErrBadRoom = new Error("bad room");
const ErrClosed = new Error("use of closed connection");
const ErrWrite = new Error("write closed");

/* The isCloseError function reports whether incoming error is received because of server shutdown. */
function isCloseError(err: Error): boolean {
    if (err && !isEmpty(err.message)) {
        return err.message.indexOf("[-1] write closed") >= 0;
    }

    return false;
}

/* The Conn class contains the websocket connection and the neffos communication functionality.
   Its `connect` will return a new `NSConn` instance, each connection can connect to one or more namespaces.
   Each `NSConn` can join to multiple rooms. */
class Conn {
    private conn: WebSocket;
    /* If > 0 then this connection is the result of a reconnection,
       see `wasReconnected()` too. */
    reconnectTries: number;

    private _isAcknowledged: boolean;
    private allowNativeMessages: boolean;
    /* ID is the generated connection ID from the server-side, all connected namespaces(`NSConn` instances)
      that belong to that connection have the same ID. It is available immediately after the `dial`. */
    ID: string;
    private closed: boolean;
    private waitServerConnectNotifiers: Map<string, () => void>;

    private queue: WSData[];
    private waitingMessages: Map<string, waitingMessageFunc>;
    private namespaces: Namespaces;
    connectedNamespaces: Map<string, NSConn>; // export it.

    // private isConnectingProcesseses: string[]; // if elem exists then any receive of that namespace is locked until `askConnect` finished.

    constructor(conn: WebSocket, namespaces: Namespaces) {
        this.conn = conn;
        this.reconnectTries = 0;

        this._isAcknowledged = false;
        this.namespaces = namespaces
        let hasEmptyNS = namespaces.has("");
        this.allowNativeMessages = hasEmptyNS && namespaces.get("").has(OnNativeMessage);
        this.queue = new Array<string>();
        this.waitingMessages = new Map<string, waitingMessageFunc>();
        this.connectedNamespaces = new Map<string, NSConn>();
        // this.isConnectingProcesseses = new Array<string>();
        this.closed = false;

        // this.conn.onclose = ((evt: Event): any => {
        //     this.close();
        //     return null;
        // });
    }

    /* The wasReconnected method reports whether the current connection is the result of a reconnection.
       To get the numbers of total retries see the `reconnectTries` field. */
    wasReconnected(): boolean {
        return this.reconnectTries > 0;
    }

    isAcknowledged(): boolean {
        return this._isAcknowledged;
    }

    handle(evt: MessageEvent): Error {
        if (!this._isAcknowledged) {
            // if (evt.data instanceof ArrayBuffer) {
            // new Uint8Array(evt.data)
            let err = this.handleAck(evt.data);
            if (err == undefined) {
                this._isAcknowledged = true
                this.handleQueue();
            } else {
                this.conn.close();
            }
            return err;
        }

        return this.handleMessage(evt.data);
    }

    private handleAck(data: WSData): Error {
        let typ = data[0];
        switch (typ) {
            case ackIDBinary:
                // let id = dec.decode(data.slice(1));
                let id = data.slice(1);
                this.ID = id;
                break;
            case ackNotOKBinary:
                // let errorText = dec.decode(data.slice(1));
                let errorText = data.slice(1);
                return new Error(errorText);
            default:
                this.queue.push(data);
                return null;
        }
    }

    private handleQueue(): void {
        if (this.queue == undefined || this.queue.length == 0) {
            return;
        }

        this.queue.forEach((item, index) => {
            this.queue.splice(index, 1);
            this.handleMessage(item);
        });
    }

    private handleMessage(data: WSData): Error {
        let msg = deserializeMessage(data, this.allowNativeMessages)
        if (msg.isInvalid) {
            return ErrInvalidPayload
        }

        if (msg.IsNative && this.allowNativeMessages) {
            let ns = this.namespace("")
            return fireEvent(ns, msg);
        }

        if (msg.isWait()) {
            let cb = this.waitingMessages.get(msg.wait);
            if (cb != undefined) {
                cb(msg);
                return;
            }
        }

        const ns = this.namespace(msg.Namespace);

        switch (msg.Event) {
            case OnNamespaceConnect:
                this.replyConnect(msg);
                break;
            case OnNamespaceDisconnect:
                this.replyDisconnect(msg);
                break;
            case OnRoomJoin:
                if (ns !== undefined) {
                    ns.replyRoomJoin(msg);
                    break;
                }
            case OnRoomLeave:
                if (ns !== undefined) {
                    ns.replyRoomLeave(msg);
                    break;
                }
            default:
                // this.checkWaitForNamespace(msg.Namespace);
                if (ns === undefined) {
                    return ErrBadNamespace;
                }
                msg.IsLocal = false;
                const err = fireEvent(ns, msg);
                if (!isEmpty(err)) {
                    // write any error back to the server.
                    msg.Err = err;
                    this.write(msg);
                    return err;
                }
        }

        return null;
    }

    /* The connect method returns a new connected to the specific "namespace" `NSConn` instance or an error. */
    connect(namespace: string): Promise<NSConn> {
        return this.askConnect(namespace);
    }

    /* waitServerConnect method blocks until server manually calls the connection's `Connect`
       on the `Server#OnConnected` event. */
    waitServerConnect(namespace: string): Promise<NSConn> {
        if (isNull(this.waitServerConnectNotifiers)) {
            this.waitServerConnectNotifiers = new Map<string, () => void>();
        }

        return new Promise(async (resolve, reject) => {
            this.waitServerConnectNotifiers.set(namespace, () => {
                this.waitServerConnectNotifiers.delete(namespace);
                resolve(this.namespace(namespace));
            })
        });
    }

    /* The namespace method returns an already connected `NSConn`. */
    namespace(namespace: string): NSConn {
        return this.connectedNamespaces.get(namespace)
    }

    private replyConnect(msg: Message): void {
        if (isEmpty(msg.wait) || msg.isNoOp) {
            return;
        }

        let ns = this.namespace(msg.Namespace);
        if (ns !== undefined) {
            this.writeEmptyReply(msg.wait);
            return;
        }

        let events = getEvents(this.namespaces, msg.Namespace)
        if (isNull(events)) {
            msg.Err = ErrBadNamespace;
            this.write(msg);
            return;
        }

        ns = new NSConn(this, msg.Namespace, events);

        this.connectedNamespaces.set(msg.Namespace, ns);
        this.writeEmptyReply(msg.wait);

        msg.Event = OnNamespaceConnected;
        fireEvent(ns, msg);

        if (!isNull(this.waitServerConnectNotifiers) && this.waitServerConnectNotifiers.size > 0) {
            if (this.waitServerConnectNotifiers.has(msg.Namespace)) {
                this.waitServerConnectNotifiers.get(msg.Namespace)();
            }
        }
    }

    private replyDisconnect(msg: Message): void {
        if (isEmpty(msg.wait) || msg.isNoOp) {
            return;
        }

        let ns = this.namespace(msg.Namespace);
        if (ns === undefined) {
            this.writeEmptyReply(msg.wait);
            return;
        }

        ns.forceLeaveAll(true);

        this.connectedNamespaces.delete(msg.Namespace);

        this.writeEmptyReply(msg.wait);

        fireEvent(ns, msg);
    }

    /* The ask method writes a message to the server and blocks until a response or an error received. */
    ask(msg: Message): Promise<Message> {
        return new Promise((resolve, reject) => {
            if (this.isClosed()) {
                reject(ErrClosed);
                return;
            }

            msg.wait = genWait();

            this.waitingMessages.set(msg.wait, ((receive: Message): void => {
                if (receive.isError) {
                    reject(receive.Err);
                    return;
                }
                resolve(receive);
            }));

            if (!this.write(msg)) {
                reject(ErrWrite);
                return;
            }
        });
    }

    // private addConnectProcess(namespace: string) {
    //     this.isConnectingProcesseses.push(namespace);
    // }

    // private removeConnectProcess(namespace: string) {
    //     let idx = this.isConnectingProcesseses.findIndex((value: string, index: number, obj) => { return value === namespace || false; });
    //     if (idx !== -1) {
    //         this.isConnectingProcesseses.splice(idx, 1);
    //     }
    // }

    private askConnect(namespace: string): Promise<NSConn> {
        return new Promise(async (resolve, reject) => {
            let ns = this.namespace(namespace);
            if (ns !== undefined) { // it's already connected.
                resolve(ns);
                return;
            }

            let events = getEvents(this.namespaces, namespace);
            if (isNull(events)) {
                reject(ErrBadNamespace);
                return;
            }

            // this.addConnectProcess(namespace);
            let connectMessage = new Message()
            connectMessage.Namespace = namespace;
            connectMessage.Event = OnNamespaceConnect;
            connectMessage.IsLocal = true;

            ns = new NSConn(this, namespace, events);
            let err = fireEvent(ns, connectMessage);
            if (!isEmpty(err)) {
                // this.removeConnectProcess(namespace);
                reject(err);
                return;
            }

            try {
                await this.ask(connectMessage);
            } catch (err) {
                reject(err);
                return;
            }

            this.connectedNamespaces.set(namespace, ns);

            connectMessage.Event = OnNamespaceConnected;
            fireEvent(ns, connectMessage);
            resolve(ns);
        });
    }

    async askDisconnect(msg: Message): Promise<Error> {
        let ns = this.namespace(msg.Namespace);
        if (ns === undefined) { // it's already connected.
            return ErrBadNamespace;
        }

        try {
            await this.ask(msg);
        } catch (err) {
            return err
        }

        ns.forceLeaveAll(true);

        this.connectedNamespaces.delete(msg.Namespace);

        msg.IsLocal = true;
        return fireEvent(ns, msg);
    }

    /* The isClosed method reports whether this connection is closed. */
    isClosed(): boolean {
        return this.closed // || this.conn.readyState == this.conn.CLOSED || false;
    }

    /* The write method writes a message to the server and reports whether the connection is still available. */
    write(msg: Message): boolean {
        if (this.isClosed()) {
            return false;
        }

        if (!msg.isConnect() && !msg.isDisconnect()) {
            // namespace pre-write check.
            let ns = this.namespace(msg.Namespace);

            if (ns === undefined) {
                return false;
            }

            // room per-write check.
            if (!isEmpty(msg.Room) && !msg.isRoomJoin() && !msg.isRoomLeft()) {
                if (!ns.rooms.has(msg.Room)) {
                    // tried to send to a not joined room.
                    return false;
                }
            }
        }


        // if (msg.SetBinary) {
        //     if (!("TextEncoder" in window)) {
        //         throw new Error("this browser does not support Text Encoding/Decoding...");
        //     }

        //     (msg.Body as unknown) = new TextEncoder().encode(msg.Body);
        // }
        // this.conn.send(serializeMessage(msg));
        //
        // var data:string|Uint8Array = serializeMessage(msg)
        // if (msg.SetBinary) {
        //     if (!("TextEncoder" in window)) {
        //         throw new Error("this browser does not support Text Encoding/Decoding...");
        //     }

        //     data = new TextEncoder().encode(data);
        // }
        // this.conn.send(data);

        this.conn.send(serializeMessage(msg));
        return true;
    }

    writeEmptyReply(wait: string): void {
        this.conn.send(genEmptyReplyToWait(wait));
    }

    /* The close method will force-disconnect from all connected namespaces and force-leave from all joined rooms
       and finally will terminate the underline websocket connection. After this method call the `Conn` is not usable anymore, a new `dial` call is required. */
    close(): void {
        if (this.closed) {
            return;
        }

        let disconnectMsg = new Message();
        disconnectMsg.Event = OnNamespaceDisconnect;
        disconnectMsg.IsForced = true;
        disconnectMsg.IsLocal = true;

        this.connectedNamespaces.forEach((ns) => {
            ns.forceLeaveAll(true);

            disconnectMsg.Namespace = ns.namespace;
            fireEvent(ns, disconnectMsg);
            this.connectedNamespaces.delete(ns.namespace);
        })

        this.waitingMessages.clear();

        this.closed = true;

        if (this.conn.readyState === this.conn.OPEN) {
            this.conn.close();
        }
    }
}

(function () {
    // interface Neffos {
    //     dial(...)
    // }


    // const neffos: Neffos = {
    //    dial:dial,
    // }


    const neffos = {
        // main functions.
        dial: dial,
        isSystemEvent: isSystemEvent,
        // constants (events).
        OnNamespaceConnect: OnNamespaceConnect,
        OnNamespaceConnected: OnNamespaceConnected,
        OnNamespaceDisconnect: OnNamespaceDisconnect,
        OnRoomJoin: OnRoomJoin,
        OnRoomJoined: OnRoomJoined,
        OnRoomLeave: OnRoomLeave,
        OnRoomLeft: OnRoomLeft,
        OnAnyEvent: OnAnyEvent,
        OnNativeMessage: OnNativeMessage,
        // classes.
        Message: Message,
        Room: Room,
        NSConn: NSConn,
        Conn: Conn,
        // errors.
        ErrInvalidPayload: ErrInvalidPayload,
        ErrBadNamespace: ErrBadNamespace,
        ErrBadRoom: ErrBadRoom,
        ErrClosed: ErrClosed,
        ErrWrite: ErrWrite,
        isCloseError: isCloseError,
        reply: reply,
        marshal: marshal
    }

    if (typeof exports !== 'undefined') {
        exports = neffos;
        module.exports = neffos
    } else {
        var root = typeof self == 'object' && self.self === self && self ||
            typeof global == 'object' && global.global === global && global;

        // as a browser global.
        root["neffos"] = neffos;
    }
}());