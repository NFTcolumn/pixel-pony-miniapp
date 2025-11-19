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

  // Auto-connect on mount
  useEffect(() => {
    if (!isConnected && connectors.length > 0) {
      connect({ connector: connectors[0] })
    }
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
      setStatusMessage('🏁 Sending race transaction...')
      setIsRacing(true)

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
        setStatusMessage('✅ Transaction confirmed! Animating race...')

        // Show track
        setShowTrack(true)

        // Get the transaction receipt to find the block number
        const receipt = await publicClient.getTransactionReceipt({ hash })
        console.log('📦 Transaction receipt:', receipt)

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

          const winnerIds = winners.map((w: bigint) => Number(w))

          // Animate the race with actual winners
          await animateRace(winnerIds)

          // Show results after animation completes
          setRaceResult({
            won,
            winners: winnerIds,
            payout: formatEther(payout)
          })
          setShowResult(true)

          // Hide track after showing result
          setTimeout(() => {
            setShowTrack(false)
          }, 1000)

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

  // Animate race - matching working test-race.html version
  const animateRace = (winners: number[]): Promise<void> => {
    return new Promise((resolve) => {
      console.log('🎬 Starting race animation...')
      console.log('🏆 Winners to highlight:', winners)

      const trackContainer = trackInnerRef.current
      if (!trackContainer) {
        console.error('❌ Track container not found!')
        resolve()
        return
      }

      const trackWidth = trackContainer.offsetWidth
      console.log('📏 Track width:', trackWidth)
      const duration = 6000 // Extended to 6 seconds so all horses can finish
      const startPosition = 35
      const finishPosition = trackWidth - 70 // Stop before the right edge
      const raceDistance = finishPosition - startPosition

      // Generate random speeds for each horse (1.0-1.2 for losers - fast enough to finish)
      const horseSpeeds = Array(16).fill(0).map(() => 1.0 + Math.random() * 0.2)

      // Make winners faster
      winners.forEach((winnerId, index) => {
        if (index === 0) horseSpeeds[winnerId] = 1.5 // 1st place
        else if (index === 1) horseSpeeds[winnerId] = 1.4 // 2nd place
        else if (index === 2) horseSpeeds[winnerId] = 1.3 // 3rd place
      })

      console.log('🏇 Horse speeds:', horseSpeeds)
      console.log('📏 Track width:', trackWidth, 'Race distance:', raceDistance)

      const startTime = Date.now()

      const animationInterval = setInterval(() => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / duration, 1)

        // Update each horse position
        for (let i = 0; i < 16; i++) {
          const horse = document.getElementById(`racer-${i}`)
          if (!horse) {
            if (i === 0) console.warn(`⚠️ Horse racer-${i} not found!`)
            continue
          }

          const speed = horseSpeeds[i]
          const easeProgress = 1 - Math.pow(1 - progress, 2) // Ease out
          const position = startPosition + (raceDistance * easeProgress * speed)

          // Clamp position to not go past finish line
          const clampedPosition = Math.min(position, finishPosition)
          horse.style.left = clampedPosition + 'px'

          // Add winner class near the end
          if (easeProgress >= 0.95 && winners.includes(i)) {
            horse.classList.add('winner')
          }
        }

        // Race finished
        if (progress >= 1) {
          clearInterval(animationInterval)
          console.log('🏁 Race animation complete!')

          // Show winner announcement
          const announcement = document.getElementById('raceAnnouncement')
          if (announcement && selectedHorse !== null) {
            const playerWon = winners.includes(selectedHorse)

            announcement.innerHTML = `
              🏆 RACE COMPLETE! 🏆<br>
              <div style="margin-top: 15px; font-size: 18px;">
                Winners:<br>
                🥇 Pony #${winners[0] + 1}<br>
                🥈 Pony #${winners[1] + 1}<br>
                🥉 Pony #${winners[2] + 1}
              </div>
              <div style="margin-top: 15px; font-size: 20px; color: ${playerWon ? '#4ade80' : '#f87171'};">
                ${playerWon ? '🎉 YOU WON! 🎉' : 'Better luck next time!'}
              </div>
            `
            announcement.style.display = 'block'
          }

          // Wait a moment before resolving
          setTimeout(resolve, 500)
        }
      }, 50) // Update every 50ms
    })
  }

  const closeTrack = () => {
    setShowTrack(false)
    const announcement = document.getElementById('raceAnnouncement')
    if (announcement) {
      announcement.style.display = 'none'
    }
  }

  const closeResult = () => {
    setShowResult(false)
    setShowTrack(false)
    const announcement = document.getElementById('raceAnnouncement')
    if (announcement) {
      announcement.style.display = 'none'
    }
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
          <div className="race-announcement" id="raceAnnouncement"></div>
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
