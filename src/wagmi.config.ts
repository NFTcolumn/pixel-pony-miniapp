import { createConfig, http } from 'wagmi'
import { base } from 'wagmi/chains'
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector'
import { injected } from 'wagmi/connectors'

// Detect if we're in Farcaster environment
const isFarcaster = typeof window !== 'undefined' && (window as any).frameContext !== undefined

export const config = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(),
  },
  connectors: isFarcaster
    ? [farcasterMiniApp()]
    : [
        injected({ target: 'metaMask' }),
        farcasterMiniApp() // Keep this as fallback
      ]
})
