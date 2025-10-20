// File: src/client/stacks_anchor.js
import fetch from 'node-fetch';
import {
  AnchorMode,
  makeContractCall,
  broadcastTransaction,
  uintCV,
  bufferCV,
  PostConditionMode,
} from '@stacks/transactions';
import { StacksTestnet } from '@stacks/network';

// Simple helper to anchor packet hash to a deployed Clarity contract
// NOTE: for Phase 1 this uses a single private key to sign transactions.
// In production, never hard-code private keys; use secure key management.

const NETWORK = new StacksTestnet();
const CONTRACT_ADDRESS = process.env.STACKS_CONTRACT_ADDRESS || 'SP000000000000000000002Q6VF78';
const CONTRACT_NAME = process.env.STACKS_CONTRACT_NAME || 'nano-ledger';
const SENDER_PRIVATE_KEY = process.env.SENDER_PRIVATE_KEY || '';

export async function anchorOnChain(hashBuf, prevBuf) {
  if (!SENDER_PRIVATE_KEY) throw new Error('SENDER_PRIVATE_KEY not set');

  // convert buffers to uint CVs or buffers depending on the contract's expected types
  // Here contract expects two uints; we convert 8-byte buffers to big-endian uint
  function bufToUint(buf) {
    // Node BigInt from buffer (big-endian)
    let bn = 0n;
    for (const b of buf) {
      bn = (bn << 8n) + BigInt(b);
    }
    return bn.toString();
  }

  const hashUint = uintCV(Number(BigInt(bufToUint(hashBuf))));
  const prevUint = uintCV(Number(BigInt(bufToUint(prevBuf))));

  const txOptions = {
    contractAddress: CONTRACT_ADDRESS,
    contractName: CONTRACT_NAME,
    functionName: 'anchor',
    functionArgs: [hashUint, prevUint],
    senderKey: SENDER_PRIVATE_KEY,
    network: NETWORK,
    postConditionMode: PostConditionMode.Allow,
    anchorMode: AnchorMode.Any,
  };

  const tx = await makeContractCall(txOptions);
  const res = await broadcastTransaction(tx, NETWORK);
  return res;
}
