// File: src/phase3/merkle.js
// Simple Merkle Tree implementation (binary, left-right concatenation, SHA256)
import crypto from 'crypto';

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest();
}

export class MerkleTree {
  constructor(leaves /* array of Buffer */) {
    if (!Array.isArray(leaves) || leaves.length === 0) {
      throw new Error('MerkleTree requires non-empty leaves array');
    }
    // store original leaves (not hashed) for proof convenience
    this.leaves = leaves.map((l) => Buffer.from(l));
    this.levels = [];
    this._build();
  }

  _build() {
    // bottom level: hash of each leaf
    let level = this.leaves.map((l) => sha256(l));
    this.levels.push(level);
    while (level.length > 1) {
      const next = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = i + 1 < level.length ? level[i + 1] : left;
        next.push(sha256(Buffer.concat([left, right])));
      }
      this.levels.push(next);
      level = next;
    }
  }

  root() {
    const top = this.levels[this.levels.length - 1];
    return top[0];
  }

  /*
    returns proof as array of { position: 'left'|'right', hash: Buffer }
    proof for leaf at index i
  */
  getProof(index) {
    if (index < 0 || index >= this.leaves.length) {
      throw new Error('Invalid leaf index');
    }
    const proof = [];
    for (let levelIndex = 0; levelIndex < this.levels.length - 1; levelIndex++) {
      const level = this.levels[levelIndex];
      const isRightNode = index % 2 === 1;
      const pairIndex = isRightNode ? index - 1 : index + 1;
      if (pairIndex < level.length) {
        proof.push({
          position: isRightNode ? 'left' : 'right',
          hash: level[pairIndex],
        });
      } else {
        // when no pair (odd count), sibling is the same node; include it (convention)
        proof.push({
          position: isRightNode ? 'left' : 'right',
          hash: level[index],
        });
      }
      index = Math.floor(index / 2);
    }
    return proof;
  }

  static verifyProof(leafBuffer, proof, rootBuffer) {
    let computed = sha256(Buffer.from(leafBuffer));
    for (const step of proof) {
      if (!step || !step.hash || !step.position) return false;
      if (step.position === 'left') {
        computed = sha256(Buffer.concat([step.hash, computed]));
      } else {
        computed = sha256(Buffer.concat([computed, step.hash]));
      }
    }
    return computed.equals(rootBuffer);
  }
}
