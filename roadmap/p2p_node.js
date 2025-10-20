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
