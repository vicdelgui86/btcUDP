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
