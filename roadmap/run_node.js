// run_node.js — simple runner to start a P2P node
import { P2PNode } from './p2p_node.js';
import { generateKeypair } from './crypto.js';

const PORT = process.env.PORT || 7000;
const PEERS = process.env.PEERS ? process.env.PEERS.split(',') : [];

const keys = process.env.NODE_SECRET_KEY
  ? { publicKey: process.env.NODE_PUBLIC_KEY, secretKey: process.env.NODE_SECRET_KEY }
  : generateKeypair();

const node = new P2PNode({ port: PORT, peers: PEERS });
node.setKeys(keys);
node.start();

setInterval(() => node.announce(), 10000);


// e2e_p2p_signed.test.js — end-to-end P2P sync with Ed25519 signatures
import { P2PNode } from '../src/p2p/p2p_node.js';
import { generateKeypair } from '../src/p2p/crypto.js';

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const nodeAKeys = generateKeypair();
  const nodeBKeys = generateKeypair();

  const nodeA = new P2PNode({ port: 7000, peers: ['127.0.0.1:7001'] });
  const nodeB = new P2PNode({ port: 7001, peers: ['127.0.0.1:7000'] });

  nodeA.setKeys(nodeAKeys);
  nodeB.setKeys(nodeBKeys);

  nodeA.start();
  nodeB.start();

  const hash = 'abcd'.repeat(8); // fake hash
  const payload = Buffer.from('Hello signed P2P!');
  nodeA.addPacket(hash, payload);

  let received = false;
  nodeB.on('packet', (h, p) => {
    if (h === hash && p.toString() === 'Hello signed P2P!') {
      received = true;
      console.log('✅ P2P signed sync e2e test passed');
    }
  });

  nodeA.announce();
  await delay(3000);
  if (!received) {
    console.error('❌ Test failed: no packet received');
    process.exit(1);
  } else {
    process.exit(0);
  }
})();


docker compose

version: '3.8'
services:
  node1:
    build: .
    command: ["node", "src/p2p/run_node.js"]
    environment:
      - PORT=7000
      - PEERS=127.0.0.1:7001,127.0.0.1:7002
    network_mode: "host"

  node2:
    build: .
    command: ["node", "src/p2p/run_node.js"]
    environment:
      - PORT=7001
      - PEERS=127.0.0.1:7000,127.0.0.1:7002
    network_mode: "host"

  node3:
    build: .
    command: ["node", "src/p2p/run_node.js"]
    environment:
      - PORT=7002
      - PEERS=127.0.0.1:7000,127.0.0.1:7001
    network_mode: "host"
