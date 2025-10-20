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
