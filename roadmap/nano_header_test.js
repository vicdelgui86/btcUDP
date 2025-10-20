// File: tests/nano_header.test.js
import assert from 'assert';
import { encodeHeader, decodeHeader, verifyPacket } from '../src/client/nano_header.js';

const prev = Buffer.alloc(8, 1);
const payload = Buffer.from('testdata');
const packet = encodeHeader(prev, false, payload);

const { hash, prev: decodedPrev } = decodeHeader(packet);
assert(decodedPrev.equals(prev));

const verification = verifyPacket(packet, prev);
assert(verification.validHash === true);

console.log('✅ All nano_header tests passed.');
