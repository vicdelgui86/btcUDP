(LIVE Demo)

const BlockUDP = require('../src/core/blockudp');
const udp = new BlockUDP();

udp.send("headshot", true);  // Critical
udp.send("movement", false);

// Simulate Cheat Check
setTimeout(async () => {
  const replay = udp.chain[0];
  const valid = await udp.verify(replay);
  if (!valid) {
    // Slash on Stacks
    await udp.network.callPublicFn({
      contract: 'pos-retry',
      function: 'slash-cheater',
      args: [ClarityValue.principal('cheater-principal')]
    });
    console.log("🚨 CHEATER BANNED ON STACKS IN 0.8ms!");
  }
}, 800);
