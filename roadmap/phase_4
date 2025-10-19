Phase 4: Cross-Node Consensus & Monitoring 

This phase is intended to add:
1) Cross-node consensus & conflict resolution
  - Ensure multiple nodes agree on the order of packets before anchoring.
  - Detect and resolve forks or inconsistent packet sequences.

2) Advanced network metrics & monitoring
  - Track packet propagation latency, anchor success/failure, and node health.
  - Optional dashboards or Prometheus/Grafana integration.

3)Optimized gas & cost management for anchors
  - Adaptive batch sizes depending on network load.
  - Compression or delta-merkle techniques to reduce anchor size.

4) Optional integration with multiple chains
  - Anchor roots to Bitcoin, Stacks, or EVM chains dynamically.

5) Enhanced security & trust layers
  - Node whitelisting, reputation scores, or on-chain identity binding.

Essentially, Phase 4 moves from basic batch anchoring to a fully decentralized, resilient, and optimized network where nodes can safely anchor packets even in the presence of faults or malicious peers.


Project Structure Additions
btcUDP/
 ├── phase4/
 │   ├── consensus.js       # Consensus & conflict resolution engine
 │   ├── monitor.js         # Node health & metrics
 │   ├── scheduler.js       # Adaptive batch scheduling for anchors
 │   └── network_utils.js   # Helpers for cross-node communication & status


Project Structure Additions
// Network helpers for Phase 4: query node status, propagate updates
import fetch from 'node-fetch';

export async function getNodeStatus(url) {
  try {
    const res = await fetch(`${url}/status`);
    if (!res.ok) throw new Error(`Status request failed: ${res.status}`);
    return await res.json(); // { lastHash, pendingPackets, nodeId, uptime }
  } catch (e) {
    console.error('getNodeStatus error:', e.message);
    return null;
  }
}

export async function broadcastUpdate(peers, update) {
  for (const peer of peers) {
    try {
      await fetch(`${peer}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
    } catch (e) {
      console.warn(`Failed to send update to ${peer}: ${e.message}`);
    }
  }
}


phase4/consensus.js
// Consensus engine for cross-node agreement on packet order
export class ConsensusEngine {
  constructor(node, peers = []) {
    this.node = node;
    this.peers = peers; // array of peer URLs
    this.conflicts = [];
  }

  async syncStatus() {
    const statuses = [];
    for (const peer of this.peers) {
      const status = await this.node.network.getNodeStatus(peer);
      if (status) statuses.push(status);
    }
    return statuses;
  }

  detectConflicts(statuses) {
    const localHash = this.node.lastHash.toString('hex');
    for (const s of statuses) {
      if (s.lastHash !== localHash) {
        this.conflicts.push({ nodeId: s.nodeId, lastHash: s.lastHash });
      }
    }
    return this.conflicts.length > 0;
  }

  resolveConflicts() {
    // simple resolution: longest chain / most packets wins
    if (this.conflicts.length === 0) return null;
    const sorted = this.conflicts.sort((a, b) => b.pendingPackets - a.pendingPackets);
    const winnerHash = sorted[0].lastHash;
    console.log('Consensus resolved. Adopting root hash:', winnerHash);
    this.node.lastHash = Buffer.from(winnerHash, 'hex');
    this.conflicts = [];
    return winnerHash;
  }

  async runConsensusCycle() {
    const statuses = await this.syncStatus();
    if (this.detectConflicts(statuses)) {
      this.resolveConflicts();
    }
  }
}

phase4/monitor.js
// Simple monitoring: tracks packet propagation, node uptime, anchor success
export class NodeMonitor {
  constructor(node) {
    this.node = node;
    this.metrics = {
      packetsReceived: 0,
      packetsAnchored: 0,
      lastAnchorTs: null,
      uptime: process.uptime(),
      conflictsDetected: 0
    };
  }

  packetReceived() { this.metrics.packetsReceived += 1; }
  packetAnchored() {
    this.metrics.packetsAnchored += 1;
    this.metrics.lastAnchorTs = Date.now();
  }
  conflictDetected() { this.metrics.conflictsDetected += 1; }

  report() { return { ...this.metrics, uptime: process.uptime() }; }

  log() {
    console.log('[Monitor]', this.report());
  }
}


phase4/scheduler.js
// Adaptive batch scheduling based on network conditions
export class AnchorScheduler {
  constructor(anchorManager, consensusEngine, monitor) {
    this.anchorManager = anchorManager;
    this.consensusEngine = consensusEngine;
    this.monitor = monitor;
    this.interval = 5000; // check every 5s
    this.timer = null;
  }

  start() {
    this.timer = setInterval(async () => {
      // Run consensus first
      if (this.consensusEngine) await this.consensusEngine.runConsensusCycle();
      // Adjust batch interval dynamically
      const pending = this.anchorManager.buffer.length;
      if (pending > this.anchorManager.batchSize / 2) {
        await this.anchorManager._anchorBatch();
        if (this.monitor) this.monitor.packetAnchored();
      }
    }, this.interval);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }
}



