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
