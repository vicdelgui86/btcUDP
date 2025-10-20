

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
