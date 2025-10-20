
import hashlib
from typing import List

def sha256(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()

class MerkleTree:
    def __init__(self, leaves: List[bytes]):
        if not leaves:
            raise ValueError("Cannot create Merkle tree with no leaves.")
        self.leaves = [sha256(l) for l in leaves]
        self.levels = [self.leaves]
        self._build_tree()

    def _build_tree(self):
        level = self.leaves
        while len(level) > 1:
            next_level = []
            for i in range(0, len(level), 2):
                left = level[i]
                right = level[i + 1] if i + 1 < len(level) else left
                next_level.append(sha256(left + right))
            self.levels.append(next_level)
            level = next_level

    def root(self) -> bytes:
        return self.levels[-1][0]

    def get_proof(self, index: int):
        proof = []
        for level in self.levels[:-1]:
            pair_index = index ^ 1
            if pair_index < len(level):
                proof.append(level[pair_index])
            index //= 2
        return proof

    @staticmethod
    def verify_proof(leaf: bytes, proof: List[bytes], root: bytes) -> bool:
        computed = sha256(leaf)
        for p in proof:
            computed = sha256(computed + p)
        return computed == root


anchor/anchor_manager.py

import time
from .merkle import MerkleTree
from utils.blockchain import send_anchor_tx  # assumes Phase1 anchoring utils

class AnchorManager:
    def __init__(self, batch_size=100, anchor_interval=60):
        self.batch_size = batch_size
        self.anchor_interval = anchor_interval
        self.buffer = []
        self.last_anchor = time.time()

    def add_packet(self, packet: bytes):
        self.buffer.append(packet)
        if len(self.buffer) >= self.batch_size:
            self.anchor_batch()

    def tick(self):
        if time.time() - self.last_anchor >= self.anchor_interval and self.buffer:
            self.anchor_batch()

    def anchor_batch(self):
        tree = MerkleTree([p for p in self.buffer])
        root = tree.root()
        txid = send_anchor_tx(root.hex())
        print(f"[ANCHOR] Root {root.hex()} anchored on-chain via tx {txid}")
        self.buffer.clear()
        self.last_anchor = time.time()
        return root, txid
