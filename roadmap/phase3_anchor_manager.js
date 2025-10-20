// File: src/phase3/anchor_manager.js
// Collect packets into batches, build Merkle tree, and anchor root.
// Anchors are recorded locally in anchors.json (txid -> { root, ts })
// The actual on-chain callback is pluggable via `anchorCallback(rootHex)`.

import fs from 'fs';
import path from 'path';
import { MerkleTree } from './merkle.js';

const ANCHORS_FILE = path.resolve(process.cwd(), 'anchors.json');

function readAnchors() {
  try {
    return JSON.parse(fs.readFileSync(ANCHORS_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function writeAnchors(obj) {
  fs.writeFileSync(ANCHORS_FILE, JSON.stringify(obj, null, 2), 'utf8');
}

export class AnchorManager {
  /**
   * options:
   *  - batchSize (number)
   *  - anchorInterval (seconds)
   *  - anchorCallback (async function(rootHex) => txid) optional
   */
  constructor(options = {}) {
    this.batchSize = options.batchSize || 64;
    this.anchorInterval = options.anchorInterval || 60;
    this.anchorCallback = options.anchorCallback || this._defaultAnchorCallback;
    this.buffer = []; // array of Buffer (raw packet)
    this._lastAnchorTs = 0;
    this._tickInterval = null;
  }

  addPacket(packetBuffer) {
    if (!Buffer.isBuffer(packetBuffer)) packetBuffer = Buffer.from(packetBuffer);
    this.buffer.push(packetBuffer);
    if (this.buffer.length >= this.batchSize) {
      return this._anchorBatch(); // immediate
    }
    return null;
  }

  startAutoTick() {
    if (this._tickInterval) return;
    this._tickInterval = setInterval(() => this._tick(), 1000 * 5);
  }

  stopAutoTick() {
    if (this._tickInterval) clearInterval(this._tickInterval);
    this._tickInterval = null;
  }

  async _tick() {
    const now = Date.now() / 1000;
    if (this.buffer.length > 0 && now - this._lastAnchorTs >= this.anchorInterval) {
      await this._anchorBatch();
    }
  }

  async _anchorBatch() {
    if (this.buffer.length === 0) return null;
    // Build merkle tree
    const leaves = this.buffer.slice();
    const tree = new MerkleTree(leaves);
    const root = tree.root(); // Buffer
    const rootHex = root.toString('hex');
    // call anchorCallback
    let txid = null;
    try {
      txid = await this.anchorCallback(rootHex);
    } catch (e) {
      // in case on-chain fails, don't drop buffer (or optionally retry)
      console.error('anchorCallback failed:', e);
      return null;
    }
    // record locally
    const anchors = readAnchors();
    anchors[txid] = {
      root: rootHex,
      ts: Math.floor(Date.now() / 1000),
      count: leaves.length,
    };
    writeAnchors(anchors);
    // clear buffer & update ts
    this.buffer = [];
    this._lastAnchorTs = Math.floor(Date.now() / 1000);
    return { rootHex, txid };
  }

  // default anchor callback just writes a mock txid (not on-chain)
  async _defaultAnchorCallback(rootHex) {
    const txid = 'mock-' + Date.now().toString(16);
    console.log(`[mock anchor] root ${rootHex} -> txid ${txid}`);
    return txid;
  }
}
