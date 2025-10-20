File/Module Structure

/src
  /client
    sender.js
    receiver.js
    nano_header.js   // header encode/decode, hashing
  /contract
    nano-ledger.clar  // clarity contract
/tests
  nano_header.test.js
  integration.test.js
/README.md
/CHANGELOG.md

And update package.json scripts:

"scripts": {
  "test": "mocha tests/**/*.test.js",
  "start:sender": "node src/client/sender.js",
  "start:receiver": "node src/client/receiver.js"
}
