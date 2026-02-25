import { WebSocketServer } from "ws";
import * as Y from "yjs";
import { encodeStateVector } from "yjs";

const PORT = process.env.WS_PORT || 1234;
const docs = new Map();

function getOrCreateDoc(roomName) {
  if (!docs.has(roomName)) {
    const doc = new Y.Doc();
    docs.set(roomName, { doc, conns: new Set(), awareness: new Map() });
  }
  return docs.get(roomName);
}

const MSG_SYNC_STEP1 = 0;
const MSG_SYNC_STEP2 = 1;
const MSG_SYNC_UPDATE = 2;
const MSG_AWARENESS = 3;

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws, req) => {
  const roomName = req.url?.slice(1) || "default";
  const room = getOrCreateDoc(roomName);
  const { doc, conns } = room;

  conns.add(ws);
  console.log(`[${roomName}] client connected (${conns.size} total)`);

  const updateHandler = (update, origin) => {
    if (origin === ws) return;
    const msg = new Uint8Array(1 + update.length);
    msg[0] = MSG_SYNC_UPDATE;
    msg.set(update, 1);
    if (ws.readyState === ws.OPEN) ws.send(msg);
  };
  doc.on("update", updateHandler);

  const sendSyncStep1 = () => {
    const sv = encodeStateVector(doc);
    const msg = new Uint8Array(1 + sv.length);
    msg[0] = MSG_SYNC_STEP1;
    msg.set(sv, 1);
    ws.send(msg);
  };
  sendSyncStep1();

  ws.on("message", (data) => {
    const msg = new Uint8Array(data);
    const msgType = msg[0];
    const payload = msg.slice(1);

    switch (msgType) {
      case MSG_SYNC_STEP1: {
        const remoteStateVector = payload;
        const update = Y.encodeStateAsUpdate(doc, remoteStateVector);
        const resp = new Uint8Array(1 + update.length);
        resp[0] = MSG_SYNC_STEP2;
        resp.set(update, 1);
        ws.send(resp);
        break;
      }
      case MSG_SYNC_STEP2:
      case MSG_SYNC_UPDATE: {
        Y.applyUpdate(doc, payload, ws);
        break;
      }
      case MSG_AWARENESS: {
        for (const conn of conns) {
          if (conn !== ws && conn.readyState === conn.OPEN) {
            conn.send(msg);
          }
        }
        break;
      }
    }
  });

  ws.on("close", () => {
    doc.off("update", updateHandler);
    conns.delete(ws);
    console.log(`[${roomName}] client disconnected (${conns.size} remaining)`);
    if (conns.size === 0) {
      setTimeout(() => {
        const r = docs.get(roomName);
        if (r && r.conns.size === 0) {
          r.doc.destroy();
          docs.delete(roomName);
          console.log(`[${roomName}] room cleaned up`);
        }
      }, 60000);
    }
  });
});

console.log(`Yjs WebSocket server running on ws://localhost:${PORT}`);
