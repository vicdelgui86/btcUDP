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
