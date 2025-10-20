Add a small helper src/p2p/run_node.js to parse env vars and start the node, and optionally run a small demo sender that injects some packets.


E2E test for P2P sync

import assert from 'assert';
import { P2PNode } from '../src/p2p/p2p_node.js';
import { encodeHeader, computeHash } from '../src/client/nano_header.js';

(async () => {
  const nodeA = new P2PNode({ nodeId: 'A', peers: [{host:'127.0.0.1', port: 7001}], localPort: 7000 });
  const nodeB = new P2PNode({ nodeId: 'B', peers: [{host:'127.0.0.1', port: 7000}], localPort: 7001 });

  await nodeA.start();
  await nodeB.start();

  // create a packet on A and add to store (simulate send + anchor)
  let prev = Buffer.alloc(8, 0);
  const payload = Buffer.from('p2p-demo');
  const packet = encodeHeader(prev, false, payload);
  nodeA.addPacket(packet);

  // wait for gossip (ANNOUNCE every 3s)
  await new Promise(r => setTimeout(r, 3500));

  // allow time for request/response
  await new Promise(r => setTimeout(r, 2000));

  const hashHex = packet.subarray(0,8).toString('hex');
  assert(nodeB.packetStore.has(hashHex), 'Node B should have received packet from A');

  nodeA.stop();
  nodeB.stop();
  console.log('✅ P2P sync e2e test passed');
})();
