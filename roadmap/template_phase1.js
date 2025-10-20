// File: src/client/nano_header.js
import crypto from 'crypto';

// Utility functions for encoding/decoding nano-ledger headers
export function computeHash(data) {
  const hash = crypto.createHash('blake2b512').update(data).digest();
  return hash.subarray(0, 8); // first 8 bytes (64 bits)
}

export function encodeHeader(prevHash, critical = false, payload) {
  const payloadHash = computeHash(payload);
  const header = Buffer.alloc(17); // 8 bytes hash + 8 bytes prev + 1 byte flag

  payloadHash.copy(header, 0);
  prevHash.copy(header, 8);
  header.writeUInt8(critical ? 1 : 0, 16);

  return Buffer.concat([header, payload]);
}

export function decodeHeader(buffer) {
  const hash = buffer.subarray(0, 8);
  const prev = buffer.subarray(8, 16);
  const critical = buffer.readUInt8(16) === 1;
  const payload = buffer.subarray(17);

  return { hash, prev, critical, payload };
}

export function verifyPacket(buffer, expectedPrev) {
  const { hash, prev, payload } = decodeHeader(buffer);
  const recalculated = computeHash(payload);
  const validHash = recalculated.equals(hash);
  const validPrev = prev.equals(expectedPrev);
  return { validHash, validPrev, hash };
}

// File: src/client/sender.js
import dgram from 'dgram';
import { encodeHeader, computeHash } from './nano_header.js';
import fs from 'fs';

const client = dgram.createSocket('udp4');
const HOST = '127.0.0.1';
const PORT = 5000;

let prevHash = Buffer.alloc(8, 0); // initial prev = 0x00

export async function sendPacket(message, critical = false) {
  const payload = Buffer.from(message);
  const packet = encodeHeader(prevHash, critical, payload);

  return new Promise((resolve, reject) => {
    client.send(packet, 0, packet.length, PORT, HOST, (err) => {
      if (err) return reject(err);
      prevHash = computeHash(payload);
      console.log(`Sent: ${message}`);
      resolve();
    });

    (async () => {
  const messages = ['hello', 'world', 'from', 'btcUDP'];
  for (const msg of messages) {
    await sendPacket(msg);
  }
  client.close();
})();
  });
}
