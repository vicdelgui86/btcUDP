Phase 3 goals:
- Aggregate packets into Merkle trees.
- Generate Merkle proofs per packet.
- Anchor only the Merkle root on-chain (Stacks or Bitcoin).
- Allow verification that a given packet belongs to an anchored batch.


Project structure additions

btcUDP/
 ├── anchor/
 │   ├── __init__.py
 │   ├── merkle.py          # Merkle tree + proof generation
 │   ├── anchor_manager.py  # Collects batches and anchors roots
 ├── node/
 │   ├── aggregator.py      # Coordinates batch creation across peers
 │   └── verifier.py        # Verifies inclusion proofs
 └── config.py              # Add phase3 options


anchor/merkle.py

import hashlib
from typing import List

def sha256(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()

class MerkleTree:
    def __init__(self, leaves: List[bytes]):
        if not leaves:
            raise ValueError("Cannot create Merkle tree with no leaves.")
        self.leaves = [sha256(l) for l in leaves]
        self.levels = [self.leaves]
        self._build_tree()

    def _build_tree(self):
        level = self.leaves
        while len(level) > 1:
            next_level = []
            for i in range(0, len(level), 2):
                left = level[i]
                right = level[i + 1] if i + 1 < len(level) else left
                next_level.append(sha256(left + right))
            self.levels.append(next_level)
            level = next_level

    def root(self) -> bytes:
        return self.levels[-1][0]

    def get_proof(self, index: int):
        proof = []
        for level in self.levels[:-1]:
            pair_index = index ^ 1
            if pair_index < len(level):
                proof.append(level[pair_index])
            index //= 2
        return proof

    @staticmethod
    def verify_proof(leaf: bytes, proof: List[bytes], root: bytes) -> bool:
        computed = sha256(leaf)
        for p in proof:
            computed = sha256(computed + p)
        return computed == root


anchor/anchor_manager.py

import time
from .merkle import MerkleTree
from utils.blockchain import send_anchor_tx  # assumes Phase1 anchoring utils

class AnchorManager:
    def __init__(self, batch_size=100, anchor_interval=60):
        self.batch_size = batch_size
        self.anchor_interval = anchor_interval
        self.buffer = []
        self.last_anchor = time.time()

    def add_packet(self, packet: bytes):
        self.buffer.append(packet)
        if len(self.buffer) >= self.batch_size:
            self.anchor_batch()

    def tick(self):
        if time.time() - self.last_anchor >= self.anchor_interval and self.buffer:
            self.anchor_batch()

    def anchor_batch(self):
        tree = MerkleTree([p for p in self.buffer])
        root = tree.root()
        txid = send_anchor_tx(root.hex())
        print(f"[ANCHOR] Root {root.hex()} anchored on-chain via tx {txid}")
        self.buffer.clear()
        self.last_anchor = time.time()
        return root, txid


node/aggregator.py

import threading
import time
from anchor.anchor_manager import AnchorManager

class Aggregator(threading.Thread):
    def __init__(self, node, batch_size=100, interval=60):
        super().__init__(daemon=True)
        self.node = node
        self.manager = AnchorManager(batch_size, interval)
        self.running = True

    def run(self):
        while self.running:
            packets = self.node.store.get_unanchored_packets()
            for p in packets:
                self.manager.add_packet(p.data)
                self.node.store.mark_anchored(p.id)
            self.manager.tick()
            time.sleep(5)

    def stop(self):
        self.running = False


node/verifier.py

from anchor.merkle import MerkleTree

def verify_packet_inclusion(packet_data: bytes, proof, merkle_root: bytes) -> bool:
    """Check if the packet is part of a known anchored Merkle root."""
    return MerkleTree.verify_proof(packet_data, proof, merkle_root)


config.py additions

PHASE3 = {
    "batch_size": 100,
    "anchor_interval": 60,  # seconds
}


Example integration

from node.aggregator import Aggregator

if ENABLE_PHASE3:
    aggregator = Aggregator(node, batch_size=PHASE3["batch_size"], interval=PHASE3["anchor_interval"])
    aggregator.start()



// File: src/phase3/merkle.js
// Simple Merkle Tree implementation (binary, left-right concatenation, SHA256)
import crypto from 'crypto';

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest();
}

export class MerkleTree {
  constructor(leaves /* array of Buffer */) {
    if (!Array.isArray(leaves) || leaves.length === 0) {
      throw new Error('MerkleTree requires non-empty leaves array');
    }
    // store original leaves (not hashed) for proof convenience
    this.leaves = leaves.map((l) => Buffer.from(l));
    this.levels = [];
    this._build();
  }

  _build() {
    // bottom level: hash of each leaf
    let level = this.leaves.map((l) => sha256(l));
    this.levels.push(level);
    while (level.length > 1) {
      const next = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = i + 1 < level.length ? level[i + 1] : left;
        next.push(sha256(Buffer.concat([left, right])));
      }
      this.levels.push(next);
      level = next;
    }
  }

  root() {
    const top = this.levels[this.levels.length - 1];
    return top[0];
  }

  /*
    returns proof as array of { position: 'left'|'right', hash: Buffer }
    proof for leaf at index i
  */
  getProof(index) {
    if (index < 0 || index >= this.leaves.length) {
      throw new Error('Invalid leaf index');
    }
    const proof = [];
    for (let levelIndex = 0; levelIndex < this.levels.length - 1; levelIndex++) {
      const level = this.levels[levelIndex];
      const isRightNode = index % 2 === 1;
      const pairIndex = isRightNode ? index - 1 : index + 1;
      if (pairIndex < level.length) {
        proof.push({
          position: isRightNode ? 'left' : 'right',
          hash: level[pairIndex],
        });
      } else {
        // when no pair (odd count), sibling is the same node; include it (convention)
        proof.push({
          position: isRightNode ? 'left' : 'right',
          hash: level[index],
        });
      }
      index = Math.floor(index / 2);
    }
    return proof;
  }

  static verifyProof(leafBuffer, proof, rootBuffer) {
    let computed = sha256(Buffer.from(leafBuffer));
    for (const step of proof) {
      if (!step || !step.hash || !step.position) return false;
      if (step.position === 'left') {
        computed = sha256(Buffer.concat([step.hash, computed]));
      } else {
        computed = sha256(Buffer.concat([computed, step.hash]));
      }
    }
    return computed.equals(rootBuffer);
  }
}


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


// File: src/phase3/aggregator.js
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


// File: src/phase3/verifier.js
// Convenience helpers to verify inclusion proofs and check anchor roots.

import fs from 'fs';
import path from 'path';
import { MerkleTree } from './merkle.js';

const ANCHORS_FILE = path.resolve(process.cwd(), 'anchors.json');

export function loadAnchors() {
  try {
    return JSON.parse(fs.readFileSync(ANCHORS_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

/**
 * verifyInclusion:
 *  - packetBuffer: Buffer (raw packet bytes that were in a Merkle leaf)
 *  - proof: array of { position: 'left'|'right', hash: hex-string }
 *  - rootHex: hex string of merkle root
 *
 * returns boolean
 */
export function verifyInclusion(packetBuffer, proof, rootHex) {
  const proofFormatted = proof.map((p) => ({ position: p.position, hash: Buffer.from(p.hash, 'hex') }));
  const rootBuf = Buffer.from(rootHex, 'hex');
  return MerkleTree.verifyProof(packetBuffer, proofFormatted, rootBuf);
}


// File: cli/retrieve_anchor.js
// CLI: retrieve anchor roots and info from local anchors.json or from a Stacks API (if configured).
// Usage: node cli/retrieve_anchor.js <txid>
// if no txid provided, prints list of all anchors.

import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const ANCHORS_FILE = path.resolve(process.cwd(), 'anchors.json');
const STACKS_API_URL = process.env.STACKS_API_URL || ''; // e.g. https://stacks-node-api.testnet.stacks.co

function readAnchorsLocal() {
  try {
    return JSON.parse(fs.readFileSync(ANCHORS_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

async function fetchTx(txid) {
  if (!STACKS_API_URL) throw new Error('STACKS_API_URL not configured');
  const url = `${STACKS_API_URL}/extended/v1/tx/${txid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch tx ${txid}: ${res.status} ${res.statusText}`);
  return res.json();
}

(async () => {
  const arg = process.argv[2];
  if (!arg) {
    const anchors = readAnchorsLocal();
    console.log('Local anchors:', anchors);
    process.exit(0);
  }
  const txid = arg;
  const anchors = readAnchorsLocal();
  if (anchors[txid]) {
    console.log('Local anchor record:', anchors[txid]);
  } else {
    console.log(`No local record for ${txid}`);
  }
  if (STACKS_API_URL) {
    try {
      const tx = await fetchTx(txid);
      console.log('Remote tx:', tx);
    } catch (e) {
      console.error('Remote fetch failed:', e.message);
    }
  } else {
    console.log('STACKS_API_URL not set; skipping remote fetch.');
  }
})();


// File: cli/verify_inclusion.js
// CLI: verify that a packet belongs to anchored merkle root.
// Usage:
//   node cli/verify_inclusion.js <packet-file> <root-hex> <proof-json-file>
//
// proof-json-file should contain JSON array like:
// [ { "position":"left", "hash":"af..." }, { "position":"right", "hash":"bb..." } ]

import fs from 'fs';
import path from 'path';
import { verifyInclusion } from '../src/phase3/verifier.js';

(async () => {
  const [,, packetPath, rootHex, proofPath] = process.argv;
  if (!packetPath || !rootHex || !proofPath) {
    console.error('Usage: node cli/verify_inclusion.js <packet-file> <root-hex> <proof-json-file>');
    process.exit(2);
  }
  const packet = fs.readFileSync(path.resolve(process.cwd(), packetPath));
  const proof = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), proofPath), 'utf8'));
  const ok = verifyInclusion(packet, proof, rootHex);
  console.log('Inclusion verification:', ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
})();


// OPTIONAL: File: src/phase3/stacks_anchor_adapter.js
// (example) an adapter to anchor a root on Stacks via @stacks/transactions
// This file is optional — provided as a template. You can wire it as the anchorCallback
// in AnchorManager (pass anchorCallback: anchorRootOnStacks).
//
// NOTE: using @stacks/transactions requires proper values and a deployed Clarity contract
// with a function like (anchor-root (root (buff 32))) or similar.
// This template shows how to call a contract function with a buffer argument.

import { makeContractCall, broadcastTransaction, bufferCV, standardPrincipalCV, AnchorMode, PostConditionMode } from '@stacks/transactions';
import { StacksTestnet } from '@stacks/network';

const NETWORK = new StacksTestnet();
const CONTRACT_ADDRESS = process.env.STACKS_CONTRACT_ADDRESS;
const CONTRACT_NAME = process.env.STACKS_CONTRACT_NAME;
const SENDER_PRIVATE_KEY = process.env.SENDER_PRIVATE_KEY;

export async function anchorRootOnStacks(rootHex) {
  if (!SENDER_PRIVATE_KEY) throw new Error('SENDER_PRIVATE_KEY not set');
  if (!CONTRACT_ADDRESS || !CONTRACT_NAME) throw new Error('Contract config missing');

  // convert hex to buffer CV
  const rootBuf = Buffer.from(rootHex, 'hex');
  const rootCV = bufferCV(rootBuf);

  const txOptions = {
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'anchor-root',
    functionArgs: [rootCV],
    senderKey: SENDER_PRIVATE_KEY,
    network: NETWORK,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
  };
  const tx = await makeContractCall(txOptions);
  const res = await broadcastTransaction(tx, NETWORK);
  // res contains txid or error
  if (res && res.txid) return res.txid;
  // if different shape, return fallback
  return res;
}


# Example: wiring Phase 3 into your node startup (pseudo-code)
# (not a file, just minimal usage example)
import { AnchorManager } from './src/phase3/anchor_manager.js';
import { anchorRootOnStacks } from './src/phase3/stacks_anchor_adapter.js'; // optional

const manager = new AnchorManager({
  batchSize: 128,
  anchorInterval: 120,
  anchorCallback: anchorRootOnStacks // or omit to use mock local anchor
});
manager.startAutoTick();

// when your node processes packets:
manager.addPacket(packetBuffer);

// To verify:
node cli/retrieve_anchor.js <txid>
node cli/verify_inclusion.js path/to/packet.bin <root-hex> path/to/proof.json






