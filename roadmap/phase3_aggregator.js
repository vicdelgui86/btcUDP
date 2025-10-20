/ File: src/phase3/aggregator.js
// Example aggregator that integrates with a node's packet store.
// The node must expose store.getUnanchoredPackets() that returns array of Buffers
// and store.markAnchored(packetId, txid) to mark them.

import { AnchorManager } from './anchor_manager.js';

export class Aggregator {
  constructor(node, options = {}) {
    this.node = node;
    this.anchorManager = new AnchorManager({
      batchSize: options.batchSize || 64,
      anchorInterval: options.anchorInterval || 60,
      anchorCallback: options.anchorCallback, // pass-through
    });
    this.pollInterval = options.pollInterval || 5000; // ms
    this._timer = null;
  }

  start() {
    this.anchorManager.startAutoTick();
    this._timer = setInterval(() => this._poll(), this.pollInterval);
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this.anchorManager.stopAutoTick();
  }

  async _poll() {
    // get unanchored packets from node.store (user-provided)
    if (!this.node || !this.node.store || typeof this.node.store.getUnanchoredPackets !== 'function') return;
    const packets = await this.node.store.getUnanchoredPackets(); // array of { id, data: Buffer }
    for (const p of packets) {
      await this.anchorManager.addPacket(p.data);
      // mark anchored optimistically; in production wait for tx success
      if (this.node.store.markAnchored) this.node.store.markAnchored(p.id, null);
    }
  }
}
