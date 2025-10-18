1-Click Deploy)

#!/bin/bash
# Deploy to Stacks Testnet
clarinet integrate  # Test contracts
clarinet deploy --yes  # Deploy nano-ledger & pos-retry
echo "🚀 Deployed! Fund with testnet STX: https://explorer.stacks.co/?chain=testnet"
npm run test
