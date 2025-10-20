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
