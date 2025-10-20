// File: src/client/receiver.js
import dgram from 'dgram';
import { verifyPacket } from './nano_header.js';

const server = dgram.createSocket('udp4');
const PORT = 5000;
let expectedPrev = Buffer.alloc(8, 0);

server.on('message', (msg, rinfo) => {
  const { validHash, validPrev, hash } = verifyPacket(msg, expectedPrev);

  if (validHash && validPrev) {
    console.log(`✔ Packet valid from ${rinfo.address}:${rinfo.port}`);
    expectedPrev = hash;
  } else {
    console.warn(`⚠ Invalid packet detected (hash or prev mismatch)`);
  }
});

server.bind(PORT, () => console.log(`Receiver listening on port ${PORT}`));
