import threading
import time
from anchor.anchor_manager import AnchorManager

class Aggregator(threading.Thread):
    def __init__(self, node, batch_size=100, interval=60):
        super().__init__(daemon=True)
        self.node = node
        self.manager = AnchorManager(batch_size, interval)
        self.running = True

    def run(self):
        while self.running:
            packets = self.node.store.get_unanchored_packets()
            for p in packets:
                self.manager.add_packet(p.data)
                self.node.store.mark_anchored(p.id)
            self.manager.tick()
            time.sleep(5)

    def stop(self):
        self.running = False
