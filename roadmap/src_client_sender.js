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
  });
}

(async () => {
  const messages = ['hello', 'world', 'from', 'btcUDP'];
  for (const msg of messages) {
    await sendPacket(msg);
  }
  client.close();
})();
