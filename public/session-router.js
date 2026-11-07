const networkMode=Boolean(window.ARENA_SERVER);
const activeSession=networkMode?networkSession:localSession;
const send=message=>activeSession.send(message);
const start=type=>activeSession.start(type);
const connect=()=>activeSession.connect();
const pauseSession=paused=>activeSession.pauseSession(paused);
const endLocal=finished=>localSession.endLocal(finished);
