// crypto.js — Ed25519 helpers using tweetnacl
import nacl from 'tweetnacl';
import {
  decodeUTF8,
  encodeUTF8,
  encodeBase64,
  decodeBase64
} from 'tweetnacl-util';

export function generateKeypair() {
  const kp = nacl.sign.keyPair();
  return {
    publicKey: encodeBase64(kp.publicKey),
    secretKey: encodeBase64(kp.secretKey),
  };
}

export function signMessage(secretKeyB64, message) {
  const secretKey = decodeBase64(secretKeyB64);
  const msg = typeof message === 'string' ? message : JSON.stringify(message);
  const msgUint8 = decodeUTF8(msg);
  const sig = nacl.sign.detached(msgUint8, secretKey);
  return encodeBase64(sig);
}

export function verifyMessage(publicKeyB64, message, sigB64) {
  const publicKey = decodeBase64(publicKeyB64);
  const msg = typeof message === 'string' ? message : JSON.stringify(message);
  const msgUint8 = decodeUTF8(msg);
  const sig = decodeBase64(sigB64);
  return nacl.sign.detached.verify(msgUint8, sig, publicKey);
}
