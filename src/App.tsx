import { useState, useEffect, useRef } from 'react'
import { useAccount, useConnect, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useBalance } from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { sdk } from '@farcaster/miniapp-sdk'
import './App.css'

// Extend Window interface for ethereum
declare global {
  interface Window {
    ethereum?: any
  }
}

// Contract addresses
const PIXEL_PONY_ADDRESS = '0x2B4652Bd6149E407E3F57190E25cdBa1FC9d37d8'
const PONY_TOKEN_ADDRESS = '0x6ab297799335E7b0f60d9e05439Df156cf694Ba7'

// ABIs
const PIXEL_PONY_ABI = [
  {
    inputs: [
      { name: '_horseId', type: 'uint256' },
      { name: '_amount', type: 'uint256' }
    ],
    name: 'placeBetAndRace',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'getGameStats',
    outputs: [
      { name: 'totalRacesCount', type: 'uint256' },
      { name: 'totalTicketsCount', type: 'uint256' },
      { name: 'jackpotAmount', type: 'uint256' },
      { name: 'jackpotNumbers', type: 'uint256[4]' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'baseFeeAmount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'raceId', type: 'uint256' },
      { indexed: true, name: 'player', type: 'address' },
      { indexed: false, name: 'horseId', type: 'uint256' },
      { indexed: false, name: 'winners', type: 'uint256[3]' },
      { indexed: false, name: 'payout', type: 'uint256' },
      { indexed: false, name: 'won', type: 'bool' }
    ],
    name: 'RaceExecuted',
    type: 'event'
  }
] as const

const PONY_TOKEN_ABI = [
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const

const BET_AMOUNTS = [
  { label: '10B', value: parseEther('10000000000') },
  { label: '25B', value: parseEther('25000000000') },
  { label: '50B', value: parseEther('50000000000') }
]

function formatPony(num: string): string {
  const absNum = Math.abs(parseFloat(num))
  if (absNum >= 1e12) return (absNum / 1e12).toFixed(1) + 'T'
  if (absNum >= 1e9) return (absNum / 1e9).toFixed(1) + 'B'
  if (absNum >= 1e6) return (absNum / 1e6).toFixed(1) + 'M'
  if (absNum >= 1e3) return (absNum / 1e3).toFixed(1) + 'K'
  return absNum.toFixed(2)
}

function App() {
  const { address, isConnected } = useAccount()
  const { connectors, connect } = useConnect()
  const { writeContract, data: hash, isPending: isWritePending, reset: resetWrite } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash })
  const publicClient = usePublicClient()

  const [selectedHorse, setSelectedHorse] = useState<number | null>(null)
  const [selectedBet, setSelectedBet] = useState<bigint | null>(null)
  const [statusMessage, setStatusMessage] = useState('Pick your pony and bet amount, then hit RACE!')
  const [isApproved, setIsApproved] = useState(false)
  const [showTrack, setShowTrack] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [raceResult, setRaceResult] = useState<{ won: boolean; winners: number[]; payout: string } | null>(null)
  const [ethBalance, setEthBalance] = useState('0')
  const [ponyBalance, setPonyBalance] = useState('0')
  const [isRacing, setIsRacing] = useState(false)
  const [raceHash, setRaceHash] = useState<`0x${string}` | null>(null)
  const [showWalletWarning, setShowWalletWarning] = useState(false)
  const trackInnerRef = useRef<HTMLDivElement>(null)

  // Initialize Farcaster SDK
  useEffect(() => {
    const initSdk = async () => {
      try {
        const context = await sdk.context
        console.log('Farcaster SDK context:', context)
        await sdk.actions.ready()
      } catch (error) {
        console.error('SDK initialization error:', error)
      }
    }
    initSdk()
  }, [])

  // Auto-connect on mount and check wallet type
  useEffect(() => {
    const checkWallet = async () => {
      if (!isConnected && connectors.length > 0) {
        connect({ connector: connectors[0] })
      }

      // Check if using native Farcaster wallet
      if (isConnected && window.ethereum) {
        const provider = window.ethereum as any
        const isNativeWallet = !provider.isMetaMask && !provider.isCoinbaseWallet && !provider.isWalletConnect
        if (isNativeWallet) {
          setShowWalletWarning(true)
        }
      }
    }
    checkWallet()
  }, [isConnected, connectors, connect])

  // Read jackpot
  const { data: gameStats, refetch: refetchJackpot } = useReadContract({
    address: PIXEL_PONY_ADDRESS,
    abi: PIXEL_PONY_ABI,
    functionName: 'getGameStats'
  })

  // Read ETH balance
  const { data: ethBalanceData, refetch: refetchEthBalance } = useBalance({
    address: address,
    query: { enabled: !!address }
  })

  // Read PONY balance
  const { data: ponyBalanceData, refetch: refetchPonyBalance } = useReadContract({
    address: PONY_TOKEN_ADDRESS,
    abi: PONY_TOKEN_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address }
  })

  // Read base fee
  const { data: baseFee } = useReadContract({
    address: PIXEL_PONY_ADDRESS,
    abi: PIXEL_PONY_ABI,
    functionName: 'baseFeeAmount'
  })

  // Read allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: PONY_TOKEN_ADDRESS,
    abi: PONY_TOKEN_ABI,
    functionName: 'allowance',
    args: address && selectedBet ? [address, PIXEL_PONY_ADDRESS] : undefined,
    query: { enabled: !!address && selectedBet !== null }
  })

  // Check if approved whenever allowance or selectedBet changes
  useEffect(() => {
    if (allowance && selectedBet) {
      setIsApproved(allowance >= selectedBet)
    } else {
      setIsApproved(false)
    }
  }, [allowance, selectedBet])

  // Update balances
  useEffect(() => {
    if (ethBalanceData) {
      setEthBalance(parseFloat(formatEther(ethBalanceData.value)).toFixed(4))
    }
  }, [ethBalanceData])

  useEffect(() => {
    if (ponyBalanceData) {
      setPonyBalance(formatPony(formatEther(ponyBalanceData)))
    }
  }, [ponyBalanceData])

  // Jackpot display
  const jackpotDisplay = gameStats
    ? (parseFloat(formatEther(gameStats[2])) / 1e9).toFixed(2) + 'B'
    : 'Loading...'

  const selectHorse = (horseId: number) => {
    setSelectedHorse(horseId)
    updateStatus()
  }

  const selectBet = (amount: bigint) => {
    setSelectedBet(amount)
    setIsApproved(false)
    updateStatus()
  }

  const updateStatus = () => {
    if (selectedHorse !== null && selectedBet !== null) {
      const betDisplay = formatPony(formatEther(selectedBet))
      setStatusMessage(`Ready! Pony #${selectedHorse + 1} with ${betDisplay} PONY bet. Click STEP 1 to approve!`)
    }
  }

  const handleApprove = async () => {
    if (!selectedBet) return
    try {
      setStatusMessage('💰 Approving PONY tokens...')
      writeContract({
        address: PONY_TOKEN_ADDRESS,
        abi: PONY_TOKEN_ABI,
        functionName: 'approve',
        args: [PIXEL_PONY_ADDRESS, selectedBet]
      })
    } catch (error) {
      console.error('Approval error:', error)
      setStatusMessage('❌ Approval failed')
    }
  }

  const handleRace = async () => {
    if (selectedHorse === null || !selectedBet || !baseFee || isRacing) return
    try {
      setStatusMessage('🏁 Starting race...')
      setIsRacing(true)
      setShowTrack(true)

      writeContract({
        address: PIXEL_PONY_ADDRESS,
        abi: PIXEL_PONY_ABI,
        functionName: 'placeBetAndRace',
        args: [BigInt(selectedHorse), selectedBet],
        value: baseFee
      })
    } catch (error) {
      console.error('Race error:', error)
      setStatusMessage('❌ Race failed')
      setShowTrack(false)
      setIsRacing(false)
    }
  }

  // Separate approval and race transaction handling
  useEffect(() => {
    if (!hash || isConfirming || isWritePending) return

    // Check if this is an approval or race transaction
    if (isApproved && raceHash === hash) {
      // This is a race transaction that just confirmed
      return
    }

    if (!isApproved) {
      // This is an approval transaction
      refetchAllowance()
      setStatusMessage('✅ Approved! Now click STEP 2: RACE!')
    }
  }, [hash, isConfirming, isWritePending, isApproved, raceHash, refetchAllowance])

  // Handle race transaction confirmation and fetch results
  useEffect(() => {
    const handleRaceComplete = async () => {
      if (!isConfirmed || !hash || !publicClient || !address) return
      if (!isRacing || raceHash !== hash) return

      try {
        console.log('🏁 Race transaction confirmed! Hash:', hash)
        setStatusMessage('✅ Transaction confirmed! Starting countdown...')

        // 5 second countdown
        for (let i = 5; i > 0; i--) {
          setStatusMessage(`🏁 Race starting in ${i}...`)
          await new Promise(resolve => setTimeout(resolve, 1000))
        }

        setStatusMessage('🏁 AND THEY\'RE OFF!')

        // Get the transaction receipt to find the block number
        const receipt = await publicClient.getTransactionReceipt({ hash })
        console.log('📦 Transaction receipt:', receipt)

        // Wait a moment for block to be indexed
        await new Promise(resolve => setTimeout(resolve, 1000))

        // Fetch the race event from the transaction block
        const logs = await publicClient.getLogs({
          address: PIXEL_PONY_ADDRESS,
          event: PIXEL_PONY_ABI[3], // RaceExecuted event
          fromBlock: receipt.blockNumber,
          toBlock: receipt.blockNumber
        })

        console.log('📜 Found logs:', logs)

        // Find the event for this specific transaction
        const raceEvent = logs.find((log: any) =>
          log.transactionHash === hash
        )

        console.log('🎯 Race event for our transaction:', raceEvent)

        if (raceEvent && raceEvent.args) {
          const { winners, payout, won } = raceEvent.args as any

          console.log('🏆 Winners:', winners)
          console.log('💰 Payout:', payout)
          console.log('🎉 Won:', won)

          // Animate the race
          await animateRace(winners.map((w: bigint) => Number(w)))

          // Show results
          setRaceResult({
            won,
            winners: winners.map((w: bigint) => Number(w)),
            payout: formatEther(payout)
          })
          setShowResult(true)
          setStatusMessage(won ? '🎉 You won!' : '😢 Better luck next time!')
        } else {
          console.error('❌ Could not find race event')
          setStatusMessage('⚠️ Race complete but results not found. Check your balance!')
          setTimeout(() => {
            setShowTrack(false)
            setIsRacing(false)
          }, 5000)
        }

        // Refresh balances
        refetchJackpot()
        refetchPonyBalance()
        refetchEthBalance()

        // Reset race state
        setIsRacing(false)
        setRaceHash(null)
        setIsApproved(false)
        resetWrite()
      } catch (error) {
        console.error('❌ Error in race handler:', error)
        setStatusMessage('⚠️ Error loading race results. Check console!')
        setTimeout(() => {
          setShowTrack(false)
          setIsRacing(false)
          setRaceHash(null)
        }, 5000)
      }
    }

    handleRaceComplete()
  }, [isConfirmed, hash, publicClient, address, isRacing, raceHash, refetchJackpot, refetchPonyBalance, refetchEthBalance, resetWrite])

  // Track when we start a race transaction
  useEffect(() => {
    if (hash && isRacing && !raceHash) {
      setRaceHash(hash)
    }
  }, [hash, isRacing, raceHash])

  // Animate race
  const animateRace = (winners: number[]): Promise<void> => {
    return new Promise((resolve) => {
      console.log('🎬 Starting race animation...')
      console.log('🏆 Winners to highlight:', winners)

      const trackInner = trackInnerRef.current
      if (!trackInner) {
        console.error('❌ Track ref not found!')
        resolve()
        return
      }

      console.log('📏 Track inner element:', trackInner)
      const trackWidth = trackInner.offsetWidth - 60
      console.log('📏 Track width:', trackWidth)
      const duration = 5000

      // Generate speeds
      const horseSpeeds = Array(16).fill(0).map(() => 0.5 + Math.random() * 0.5)
      winners.forEach((winnerId, index) => {
        if (index === 0) horseSpeeds[winnerId] = 1.2
        else if (index === 1) horseSpeeds[winnerId] = 1.1
        else if (index === 2) horseSpeeds[winnerId] = 1.0
      })

      console.log('🏇 Horse speeds:', horseSpeeds)

      const startTime = Date.now()
      const finishPosition = trackWidth

      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / duration, 1)

        for (let i = 0; i < 16; i++) {
          const horse = document.getElementById(`racer-${i}`)
          if (!horse) {
            if (i === 0) console.warn(`⚠️ Horse racer-${i} element not found!`)
            continue
          }

          const speed = horseSpeeds[i]
          const easeProgress = 1 - Math.pow(1 - progress, 2)
          const position = 25 + (finishPosition - 25) * easeProgress * speed

          horse.style.left = position + 'px'

          if (easeProgress >= 0.95 && winners.includes(i)) {
            horse.classList.add('winner')
          }
        }

        if (progress >= 1) {
          console.log('🏁 Race animation complete!')
          clearInterval(interval)
          setTimeout(resolve, 1000)
        }
      }, 50)
    })
  }

  const closeTrack = () => {
    setShowTrack(false)
  }

  const closeResult = () => {
    setShowResult(false)
    setShowTrack(false)
    refetchJackpot()
    refetchPonyBalance()
    refetchEthBalance()
  }

  const canApprove = selectedHorse !== null && selectedBet !== null && address && !isApproved && !isRacing
  const canRace = isApproved && !isWritePending && !isRacing

  return (
    <div className="container">
      {/* Header */}
      <div className="header">
        <img src="/logo.png" alt="Pixel Ponies Logo" />
        <div className="tagline">16 PIXELATED PONIES RACING ON-CHAIN FOR NO REASON</div>
        <div className="wallet-info">
          {isConnected && address
            ? `${address.slice(0, 6)}...${address.slice(-4)} | Base`
            : 'Connecting wallet...'}
        </div>
        {isConnected && address && (
          <div className="balance-info">
            <span>💰 {ethBalance || '0.0000'} ETH</span>
            <span>🐴 {ponyBalance || '0'} PONY</span>
          </div>
        )}
      </div>

      {/* Jackpot Display */}
      <div className="jackpot-display">
        <div className="jackpot-label">💰 JACKPOT 💰</div>
        <div className="jackpot-amount">{jackpotDisplay}</div>
        <div style={{ fontSize: '8px', marginTop: '5px' }}>PONY</div>
      </div>

      {/* Wallet Warning */}
      {showWalletWarning && (
        <div className="status-message" style={{
          background: '#fff3cd',
          border: '2px solid #ffc107',
          color: '#856404'
        }}>
          ⚠️ <strong>Native Farcaster Wallet Detected</strong><br/>
          The built-in Farcaster wallet has limited support for transactions.<br/>
          <strong>Please connect an external wallet</strong> (MetaMask, Coinbase Wallet, etc.) to race.<br/>
          <br/>
          <small>Know how to fix this? We'd love your help! Contact us with suggestions.</small>
          <br/>
          <button
            onClick={() => setShowWalletWarning(false)}
            style={{
              marginTop: '10px',
              padding: '8px 16px',
              background: '#ffc107',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontSize: '10px'
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Status Message */}
      <div className="status-message">{statusMessage}</div>

      {/* Horse Selection */}
      <div className="horse-grid">
        {Array.from({ length: 16 }, (_, i) => {
          const spriteNum = (i % 30) + 1
          return (
            <div
              key={i}
              className={`horse-card ${selectedHorse === i ? 'selected' : ''}`}
              onClick={() => selectHorse(i)}
            >
              <img src={`/sprites/${spriteNum}.png`} className="horse-sprite" alt={`Pony ${i + 1}`} />
              <div className="horse-number">#{i + 1}</div>
            </div>
          )
        })}
      </div>

      {/* Bet Selection */}
      <div className="bet-section">
        <div className="bet-label">SELECT BET AMOUNT</div>
        <div className="bet-buttons">
          {BET_AMOUNTS.map((bet) => (
            <button
              key={bet.label}
              className={`bet-btn ${selectedBet === bet.value ? 'active' : ''}`}
              onClick={() => selectBet(bet.value)}
            >
              {bet.label}
            </button>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <button className="race-btn" onClick={handleApprove} disabled={!canApprove || isWritePending}>
        {isApproved ? '✅ APPROVED!' : '💰 STEP 1: APPROVE PONY'}
      </button>
      <button className="race-btn" onClick={handleRace} disabled={!canRace}>
        🏁 STEP 2: RACE!
      </button>

      {/* Race Track */}
      <div className={`track-container ${showTrack ? 'active' : ''}`}>
        <div className="track-inner" ref={trackInnerRef}>
          <button className="track-close" onClick={closeTrack}>
            ✕ CLOSE
          </button>
          <div className="finish-line"></div>
          <div>
            {Array.from({ length: 16 }, (_, i) => {
              const spriteNum = (i % 30) + 1
              return (
                <div key={i} className="track-lane">
                  <span className="lane-number">#{i + 1}</span>
                  <img
                    id={`racer-${i}`}
                    src={`/sprites/${spriteNum}.png`}
                    className={`horse-racer ${i === selectedHorse ? 'player-horse' : ''}`}
                    alt={`Racer ${i + 1}`}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Result Modal */}
      <div className={`result-modal ${showResult ? 'active' : ''}`}>
        <div className="result-content">
          <div className="result-emoji">{raceResult?.won ? '🎉' : '😢'}</div>
          <div className="result-title">{raceResult?.won ? 'YOU WON!' : 'TRY AGAIN!'}</div>
          <div className="result-details">
            {raceResult && (
              <>
                <div>Your Pony: #{selectedHorse !== null ? selectedHorse + 1 : '?'}</div>
                <div>Winners: {raceResult.winners.map((w) => `#${w + 1}`).join(', ')}</div>
                {raceResult.won && (
                  <div style={{ marginTop: '10px', fontSize: '16px', color: '#ffeb3b' }}>
                    +{formatPony(raceResult.payout)} PONY
                  </div>
                )}
              </>
            )}
          </div>
          <button className="close-btn" onClick={closeResult}>
            RACE AGAIN
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
