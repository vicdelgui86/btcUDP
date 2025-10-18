const btcUDP = require('../src/core/blockudp');
test('0.8ms latency on Stacks', async () => {
  const udp = new btcUDP();
  const start = Date.now();
  await udp.send("test");
  expect(Date.now() - start).toBeLessThan(1);
});
