Multi-Node Sync (overview)
Goal: let multiple UDP nodes keep each other up to date about the latest nano-ledger packets and request missing packets for repair.

Key ideas
- Each node maintains:
  - lastHash for its own chain
  - a small packet store (in-memory) of recent packets (index by hash hex)
- Periodically each node ANNOUNCEs its lastHash to peers.
- On receiving an ANNOUNCE, a peer compares announced lastHash with its local lastHash. If it is behind (or missing the announced hash), it sends a REQUEST for the missing hash.
- The node with the packet responds with RESPONSE containing the serialized packet (base64).
- Nodes verify the packet with verifyPacket() before inserting it and updating their lastHash.

Tradeoffs / notes
- This is not a full consensus system — Phase-2 focuses on simple sync and repair.
- Uses JSON control envelopes (ANNOUNCE/REQUEST/RESPONSE), and encodes binary packet bodies in base64 for transport.
- Works well for small-scale networks. Later phases can add Merkle aggregation and more advanced gossip.

Files (code)

// p2p_node.js
import dgram from 'dgram';
import { computeHash, encodeHeader, decodeHeader, verifyPacket } from '../client/nano_header.js';

const MSG_TYPES = { ANNOUNCE: 'ANNOUNCE', REQUEST: 'REQUEST', RESPONSE: 'RESPONSE' };

/**
 * Simple P2P node using UDP for gossip + repair.
 * - peers: array of {host, port}
 * - localPort: UDP port to listen for p2p messages
 */
export class P2PNode {
  constructor({ nodeId, peers = [], localPort = 6000, packetStoreSize = 100 }) {
    this.nodeId = nodeId || `node-${Math.random().toString(16).slice(2,8)}`;
    this.peers = peers;
    this.localPort = localPort;
    this.socket = dgram.createSocket('udp4');
    this.lastHash = Buffer.alloc(8, 0);
    this.packetStore = new Map(); // map hexHash -> Buffer(packet)
    this.packetStoreSize = packetStoreSize;
    this.announceInterval = null;

    this._bindHandlers();
  }

  _bindHandlers() {
    this.socket.on('message', (msg, rinfo) => {
      try {
        const parsed = JSON.parse(msg.toString());
        if (!parsed || !parsed.type) return;
        switch (parsed.type) {
          case MSG_TYPES.ANNOUNCE: return this._onAnnounce(parsed, rinfo);
          case MSG_TYPES.REQUEST: return this._onRequest(parsed, rinfo);
          case MSG_TYPES.RESPONSE: return this._onResponse(parsed, rinfo);
          default: /* ignore */ return;
        }
      } catch (e) {
        // Possibly binary message (not p2p control), ignore
      }
    });
  }

  async start() {
    return new Promise((resolve) => {
      this.socket.bind(this.localPort, () => {
        console.log(`[P2P ${this.nodeId}] listening on ${this.localPort}`);
        // start periodic announce
        this.announceInterval = setInterval(() => this.announce(), 3000);
        resolve();
      });
    });
  }

  stop() {
    clearInterval(this.announceInterval);
    this.socket.close();
  }

  addPacket(packetBuffer) {
    // store the raw packet (header+payload)
    const hash = packetBuffer.subarray(0, 8).toString('hex');
    this.packetStore.set(hash, packetBuffer);
    // trim store
    if (this.packetStore.size > this.packetStoreSize) {
      const oldest = this.packetStore.keys().next().value;
      this.packetStore.delete(oldest);
    }
    // update lastHash
    this.lastHash = Buffer.from(hash, 'hex');
  }

  announce() {
    const msg = JSON.stringify({
      type: MSG_TYPES.ANNOUNCE,
      nodeId: this.nodeId,
      lastHash: this.lastHash.toString('hex'),
      ts: Date.now()
    });
    for (const p of this.peers) {
      this.socket.send(msg, p.port, p.host);
    }
  }

  _onAnnounce(parsed, rinfo) {
    const theirHash = Buffer.from(parsed.lastHash || '', 'hex');
    if (!theirHash || theirHash.length !== 8) return;
    // If we don't have theirHash and they are ahead, request it
    if (!this.packetStore.has(theirHash.toString('hex')) && !this.lastHash.equals(theirHash)) {
      // send request
      const req = JSON.stringify({
        type: MSG_TYPES.REQUEST,
        requester: this.nodeId,
        targetHash: theirHash.toString('hex')
      });
      // send back to announcer
      this.socket.send(req, rinfo.port, rinfo.address);
    }
  }

  _onRequest(parsed, rinfo) {
    const targetHex = parsed.targetHash;
    if (!targetHex) return;
    const packet = this.packetStore.get(targetHex);
    if (!packet) return;
    const resp = JSON.stringify({
      type: MSG_TYPES.RESPONSE,
      responder: this.nodeId,
      targetHash: targetHex,
      packetB64: packet.toString('base64')
    });
    this.socket.send(resp, rinfo.port, rinfo.address);
  }

  _onResponse(parsed, rinfo) {
    const b64 = parsed.packetB64;
    if (!b64) return;
    const packet = Buffer.from(b64, 'base64');
    // verify before adding
    const { validHash } = verifyPacket(packet, Buffer.alloc(8,0)); // We'll independently check prev in store chain
    if (!validHash) {
      console.warn(`[P2P ${this.nodeId}] received invalid packet from ${parsed.responder}`);
      return;
    }
    const hashHex = packet.subarray(0,8).toString('hex');
    if (!this.packetStore.has(hashHex)) {
      console.log(`[P2P ${this.nodeId}] received packet ${hashHex} from ${parsed.responder}`);
      this.packetStore.set(hashHex, packet);
      // optionally try to repair chain by checking prev pointers:
      const prev = packet.subarray(8,16).toString('hex');
      if (prev !== Buffer.alloc(8,0).toString('hex') && !this.packetStore.has(prev)) {
        // we are missing previous; request it
        const req = JSON.stringify({
          type: MSG_TYPES.REQUEST,
          requester: this.nodeId,
          targetHash: prev
        });
        // request from the same responder
        this.socket.send(req, rinfo.port, rinfo.address);
      } else {
        // if prev known or zeroed we can update lastHash
        this.lastHash = Buffer.from(hashHex, 'hex');
      }
    }
  }
}

Integration notes:
- addPacket(packetBuffer) should be called by your sender after sending a regular packet so the node can serve it to peers.
- announce() runs every 3s — tune as needed.


Docker / Compose adjustments
To test locally with 3 nodes, update docker-compose.test.yml or create a new compose with three sender/receiver containers exposing different P2P ports:

services:
  node1:
    build: .
    environment:
      - P2P_PORT=6001
      - PEERS=node2:6002,node3:6003
    command: node src/p2p/run_node.js node1

  node2:
    build: .
    environment:
      - P2P_PORT=6002
      - PEERS=node1:6001,node3:6003
    command: node src/p2p/run_node.js node2

  node3:
    build: .
    environment:
      - P2P_PORT=6003
      - PEERS=node1:6001,node2:6002
    command: node src/p2p/run_node.js node3

Add a small helper src/p2p/run_node.js to parse env vars and start the node, and optionally run a small demo sender that injects some packets.


E2E test for P2P sync

import assert from 'assert';
import { P2PNode } from '../src/p2p/p2p_node.js';
import { encodeHeader, computeHash } from '../src/client/nano_header.js';

(async () => {
  const nodeA = new P2PNode({ nodeId: 'A', peers: [{host:'127.0.0.1', port: 7001}], localPort: 7000 });
  const nodeB = new P2PNode({ nodeId: 'B', peers: [{host:'127.0.0.1', port: 7000}], localPort: 7001 });

  await nodeA.start();
  await nodeB.start();

  // create a packet on A and add to store (simulate send + anchor)
  let prev = Buffer.alloc(8, 0);
  const payload = Buffer.from('p2p-demo');
  const packet = encodeHeader(prev, false, payload);
  nodeA.addPacket(packet);

  // wait for gossip (ANNOUNCE every 3s)
  await new Promise(r => setTimeout(r, 3500));

  // allow time for request/response
  await new Promise(r => setTimeout(r, 2000));

  const hashHex = packet.subarray(0,8).toString('hex');
  assert(nodeB.packetStore.has(hashHex), 'Node B should have received packet from A');

  nodeA.stop();
  nodeB.stop();
  console.log('✅ P2P sync e2e test passed');
})();


// crypto.js — Ed25519 helpers using tweetnacl
import nacl from 'tweetnacl';
import {
  decodeUTF8,
  encodeUTF8,
  encodeBase64,
  decodeBase64
} from 'tweetnacl-util';

export function generateKeypair() {
  const kp = nacl.sign.keyPair();
  return {
    publicKey: encodeBase64(kp.publicKey),
    secretKey: encodeBase64(kp.secretKey),
  };
}

export function signMessage(secretKeyB64, message) {
  const secretKey = decodeBase64(secretKeyB64);
  const msg = typeof message === 'string' ? message : JSON.stringify(message);
  const msgUint8 = decodeUTF8(msg);
  const sig = nacl.sign.detached(msgUint8, secretKey);
  return encodeBase64(sig);
}

export function verifyMessage(publicKeyB64, message, sigB64) {
  const publicKey = decodeBase64(publicKeyB64);
  const msg = typeof message === 'string' ? message : JSON.stringify(message);
  const msgUint8 = decodeUTF8(msg);
  const sig = decodeBase64(sigB64);
  return nacl.sign.detached.verify(msgUint8, sig, publicKey);
}

// p2p_node.js — UDP-based gossip + repair node with Ed25519 authentication
import dgram from 'dgram';
import EventEmitter from 'events';
import { signMessage, verifyMessage } from './crypto.js';

const MSG_TYPES = {
  ANNOUNCE: 'ANNOUNCE',
  REQUEST: 'REQUEST',
  RESPONSE: 'RESPONSE',
};

export class P2PNode extends EventEmitter {
  constructor({ port, peers = [] }) {
    super();
    this.port = port;
    this.peers = peers;
    this.nodeId = `node-${port}`;
    this.lastHash = Buffer.alloc(32);
    this.keys = null;
    this.server = dgram.createSocket('udp4');
    this.packetStore = new Map();

    this.server.on('message', (msg, rinfo) => this._handleMessage(msg, rinfo));
  }

  setKeys(keys) {
    this.keys = keys;
  }

  start() {
    this.server.bind(this.port, () => {
      console.log(`✅ P2P node listening on ${this.port}`);
      this.announce();
    });
  }

  stop() {
    this.server.close();
  }

  addPacket(hashHex, payload) {
    this.packetStore.set(hashHex, payload);
    this.lastHash = Buffer.from(hashHex, 'hex');
  }

  _broadcast(obj) {
    const data = Buffer.from(JSON.stringify(obj));
    this.peers.forEach((peer) => {
      const [host, port] = peer.split(':');
      this.server.send(data, Number(port), host);
    });
  }

  announce() {
    const payload = {
      type: MSG_TYPES.ANNOUNCE,
      nodeId: this.nodeId,
      lastHash: this.lastHash.toString('hex'),
      ts: Date.now(),
      publicKey: this.keys?.publicKey,
    };
    const signature = this.keys ? signMessage(this.keys.secretKey, payload) : null;
    this._broadcast({ ...payload, signature });
  }

  _handleMessage(msg, rinfo) {
    try {
      const parsed = JSON.parse(msg.toString());
      if (!parsed.type) return;
      switch (parsed.type) {
        case MSG_TYPES.ANNOUNCE:
          return this._onAnnounce(parsed, rinfo);
        case MSG_TYPES.REQUEST:
          return this._onRequest(parsed, rinfo);
        case MSG_TYPES.RESPONSE:
          return this._onResponse(parsed, rinfo);
      }
    } catch (e) {
      console.warn('Invalid message received:', e);
    }
  }

  _onAnnounce(parsed, rinfo) {
    if (!parsed.signature || !parsed.publicKey) return;
    const ok = verifyMessage(parsed.publicKey, {
      type: parsed.type,
      nodeId: parsed.nodeId,
      lastHash: parsed.lastHash,
      ts: parsed.ts,
      publicKey: parsed.publicKey,
    }, parsed.signature);
    if (!ok) return console.warn('Invalid ANNOUNCE signature — ignoring');

    console.log(`📣 Announce from ${parsed.nodeId}: ${parsed.lastHash}`);
    // simulate gossip: request packet if missing
    if (!this.packetStore.has(parsed.lastHash)) {
      const req = {
        type: MSG_TYPES.REQUEST,
        nodeId: this.nodeId,
        wantHash: parsed.lastHash,
        ts: Date.now(),
        publicKey: this.keys?.publicKey,
      };
      const sig = signMessage(this.keys.secretKey, req);
      const msg = Buffer.from(JSON.stringify({ ...req, signature: sig }));
      this.server.send(msg, rinfo.port, rinfo.address);
    }
  }

  _onRequest(parsed, rinfo) {
    const ok = verifyMessage(parsed.publicKey, {
      type: parsed.type,
      nodeId: parsed.nodeId,
      wantHash: parsed.wantHash,
      ts: parsed.ts,
      publicKey: parsed.publicKey,
    }, parsed.signature);
    if (!ok) return console.warn('Invalid REQUEST signature');

    const payload = this.packetStore.get(parsed.wantHash);
    if (!payload) return;

    const resp = {
      type: MSG_TYPES.RESPONSE,
      nodeId: this.nodeId,
      hash: parsed.wantHash,
      payload: payload.toString('base64'),
      ts: Date.now(),
      publicKey: this.keys?.publicKey,
    };
    const sig = signMessage(this.keys.secretKey, resp);
    const msg = Buffer.from(JSON.stringify({ ...resp, signature: sig }));
    this.server.send(msg, rinfo.port, rinfo.address);
  }

  _onResponse(parsed) {
    const ok = verifyMessage(parsed.publicKey, {
      type: parsed.type,
      nodeId: parsed.nodeId,
      hash: parsed.hash,
      payload: parsed.payload,
      ts: parsed.ts,
      publicKey: parsed.publicKey,
    }, parsed.signature);
    if (!ok) return console.warn('Invalid RESPONSE signature');

    const payload = Buffer.from(parsed.payload, 'base64');
    this.packetStore.set(parsed.hash, payload);
    console.log(`📦 Received payload for ${parsed.hash} (${payload.length} bytes)`);
    this.emit('packet', parsed.hash, payload);
  }
}


// run_node.js — simple runner to start a P2P node
import { P2PNode } from './p2p_node.js';
import { generateKeypair } from './crypto.js';

const PORT = process.env.PORT || 7000;
const PEERS = process.env.PEERS ? process.env.PEERS.split(',') : [];

const keys = process.env.NODE_SECRET_KEY
  ? { publicKey: process.env.NODE_PUBLIC_KEY, secretKey: process.env.NODE_SECRET_KEY }
  : generateKeypair();

const node = new P2PNode({ port: PORT, peers: PEERS });
node.setKeys(keys);
node.start();

setInterval(() => node.announce(), 10000);


// e2e_p2p_signed.test.js — end-to-end P2P sync with Ed25519 signatures
import { P2PNode } from '../src/p2p/p2p_node.js';
import { generateKeypair } from '../src/p2p/crypto.js';

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const nodeAKeys = generateKeypair();
  const nodeBKeys = generateKeypair();

  const nodeA = new P2PNode({ port: 7000, peers: ['127.0.0.1:7001'] });
  const nodeB = new P2PNode({ port: 7001, peers: ['127.0.0.1:7000'] });

  nodeA.setKeys(nodeAKeys);
  nodeB.setKeys(nodeBKeys);

  nodeA.start();
  nodeB.start();

  const hash = 'abcd'.repeat(8); // fake hash
  const payload = Buffer.from('Hello signed P2P!');
  nodeA.addPacket(hash, payload);

  let received = false;
  nodeB.on('packet', (h, p) => {
    if (h === hash && p.toString() === 'Hello signed P2P!') {
      received = true;
      console.log('✅ P2P signed sync e2e test passed');
    }
  });

  nodeA.announce();
  await delay(3000);
  if (!received) {
    console.error('❌ Test failed: no packet received');
    process.exit(1);
  } else {
    process.exit(0);
  }
})();


docker compose

version: '3.8'
services:
  node1:
    build: .
    command: ["node", "src/p2p/run_node.js"]
    environment:
      - PORT=7000
      - PEERS=127.0.0.1:7001,127.0.0.1:7002
    network_mode: "host"

  node2:
    build: .
    command: ["node", "src/p2p/run_node.js"]
    environment:
      - PORT=7001
      - PEERS=127.0.0.1:7000,127.0.0.1:7002
    network_mode: "host"

  node3:
    build: .
    command: ["node", "src/p2p/run_node.js"]
    environment:
      - PORT=7002
      - PEERS=127.0.0.1:7000,127.0.0.1:7001
    network_mode: "host"









