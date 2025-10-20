from anchor.merkle import MerkleTree

def verify_packet_inclusion(packet_data: bytes, proof, merkle_root: bytes) -> bool:
    """Check if the packet is part of a known anchored Merkle root."""
    return MerkleTree.verify_proof(packet_data, proof, merkle_root)


config.py additions

PHASE3 = {
    "batch_size": 100,
    "anchor_interval": 60,  # seconds
}


Example integration

from node.aggregator import Aggregator

if ENABLE_PHASE3:
    aggregator = Aggregator(node, batch_size=PHASE3["batch_size"], interval=PHASE3["anchor_interval"])
    aggregator.start()
