import { useState, useEffect, useRef } from 'react'
import { useAccount, useConnect, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useBalance } from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { sdk } from '@farcaster/miniapp-sdk'
import './App.css'
import PIXEL_PONY_ABI_FULL from './PixelPonyABI.json'

// Extend Window interface for ethereum
declare global {
  interface Window {
    ethereum?: any
  }
}

// Contract addresses
const PIXEL_PONY_ADDRESS = '0x2B4652Bd6149E407E3F57190E25cdBa1FC9d37d8'
const PONY_TOKEN_ADDRESS = '0x6ab297799335E7b0f60d9e05439Df156cf694Ba7'

// Use the full ABI from the verified contract
const PIXEL_PONY_ABI = PIXEL_PONY_ABI_FULL

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
  const { isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash })
  const publicClient = usePublicClient()

  const [selectedHorse, setSelectedHorse] = useState<number | null>(null)
  const [selectedBet, setSelectedBet] = useState<bigint | null>(null)
  const [statusMessage, setStatusMessage] = useState('Pick your pony and bet amount, then hit RACE!')
  const [isApproved, setIsApproved] = useState(false)
  const [showTrack, setShowTrack] = useState(false)
  const [ethBalance, setEthBalance] = useState('0')
  const [ponyBalance, setPonyBalance] = useState('0')
  const [isRacing, setIsRacing] = useState(false)
  const [raceHash, setRaceHash] = useState<`0x${string}` | null>(null)
  const [approvalHash, setApprovalHash] = useState<`0x${string}` | null>(null)
  const [showPonyPopup, setShowPonyPopup] = useState(false)
  const trackInnerRef = useRef<HTMLDivElement>(null)
  const processedRaces = useRef<Set<string>>(new Set())

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

  // Auto-connect only in Farcaster environment
  useEffect(() => {
    const isFarcaster = (window as any).frameContext !== undefined
    if (!isConnected && connectors.length > 0 && isFarcaster) {
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

  // Log base fee for debugging
  useEffect(() => {
    if (baseFee && typeof baseFee === 'bigint') {
      console.log('💰 Base Fee from contract:', baseFee.toString(), 'wei')
      console.log('💰 Base Fee in ETH:', formatEther(baseFee))
    }
  }, [baseFee])

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
    if (ponyBalanceData !== undefined) {
      const balance = formatPony(formatEther(ponyBalanceData))
      setPonyBalance(balance)

      // Check if balance is 0 and show popup
      console.log('🔍 PONY Balance Data:', ponyBalanceData)
      console.log('🔍 Formatted Balance:', formatEther(ponyBalanceData))
      console.log('🔍 Address:', address)

      // Check if balance is 0 (both bigint 0n and numeric 0)
      if ((ponyBalanceData === 0n || parseFloat(formatEther(ponyBalanceData)) === 0) && address) {
        console.log('✅ Showing popup - balance is 0')
        setShowPonyPopup(true)
      }
    }
  }, [ponyBalanceData, address])

  // Jackpot display
  const jackpotDisplay = gameStats && Array.isArray(gameStats)
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
      setApprovalHash(null) // Reset approval hash
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

      console.log('🏇 Racing with params:')
      console.log('  - Horse ID:', selectedHorse)
      console.log('  - Bet Amount:', selectedBet.toString(), 'wei')
      console.log('  - Bet Amount (PONY):', formatEther(selectedBet))
      console.log('  - Base Fee (value):', baseFee?.toString(), 'wei')
      console.log('  - Base Fee (ETH):', baseFee ? formatEther(baseFee as bigint) : 'N/A')

      writeContract({
        address: PIXEL_PONY_ADDRESS,
        abi: PIXEL_PONY_ABI,
        functionName: 'placeBetAndRace',
        args: [BigInt(selectedHorse), selectedBet],
        value: baseFee as bigint
      })
    } catch (error) {
      console.error('Race error:', error)
      setStatusMessage('❌ Race failed')
      setShowTrack(false)
      setIsRacing(false)
    }
  }

  // Track approval transaction
  useEffect(() => {
    if (hash && !isRacing && !isApproved && !approvalHash) {
      console.log('📝 Tracking approval hash:', hash)
      setApprovalHash(hash)
    }
  }, [hash, isRacing, isApproved, approvalHash])

  // Handle approval confirmation
  useEffect(() => {
    if (!approvalHash || !isConfirmed || approvalHash !== hash) return

    console.log('✅ Approval confirmed! Refetching allowance...')
    setStatusMessage('⏳ Waiting for approval to update...')

    // Poll allowance until it's updated
    const checkAllowance = async () => {
      for (let i = 0; i < 15; i++) {
        await new Promise(resolve => setTimeout(resolve, 800))
        setStatusMessage(`⏳ Checking approval... (${i + 1}/15)`)
        const result = await refetchAllowance()
        console.log(`⏳ Checking allowance... attempt ${i + 1}/15, result:`, result.data?.toString())
        if (result.data && selectedBet && result.data >= selectedBet) {
          console.log('✅ Allowance updated!')
          setStatusMessage('✅ Approved! Now click STEP 2: RACE!')
          setApprovalHash(null)
          return
        }
      }
      console.log('⚠️ Approval polling timed out')
      setStatusMessage('⚠️ Approval confirmed but not detected. Click STEP 2 to try racing.')
      setApprovalHash(null)
    }

    checkAllowance()
  }, [approvalHash, isConfirmed, hash, refetchAllowance, selectedBet])

  // Handle race transaction confirmation and fetch results
  useEffect(() => {
    const handleRaceComplete = async () => {
      if (!isConfirmed || !hash || !publicClient || !address) {
        console.log('⏸️ Waiting for confirmation...', { isConfirmed, hash, publicClient: !!publicClient, address })
        return
      }
      if (!isRacing || raceHash !== hash) {
        console.log('⏸️ Not the right race...', { isRacing, raceHash, hash })
        return
      }

      // Prevent processing the same race twice
      if (processedRaces.current.has(hash)) {
        console.log('⏭️ Race already processed, skipping...')
        return
      }

      console.log('🎯 Processing race:', hash)
      processedRaces.current.add(hash)

      try {
        console.log('🏁 Race transaction confirmed! Hash:', hash)
        setStatusMessage('✅ Transaction confirmed! Animating race...')

        // Show track
        setShowTrack(true)

        // Wait for transaction receipt with retries
        console.log('⏳ Waiting for transaction receipt...')
        setStatusMessage('⏳ Waiting for blockchain confirmation...')
        let receipt = null
        let attempts = 0
        const maxAttempts = 30 // Wait up to ~15 seconds

        while (!receipt && attempts < maxAttempts) {
          try {
            receipt = await publicClient.getTransactionReceipt({ hash })
            console.log('✅ Receipt found!')
          } catch (err) {
            attempts++
            console.log(`⏳ Attempt ${attempts}/${maxAttempts} - waiting for receipt...`)
            setStatusMessage(`⏳ Confirming on blockchain... (${attempts}/${maxAttempts})`)
            await new Promise(resolve => setTimeout(resolve, 500)) // Wait 500ms between attempts
          }
        }

        if (!receipt) {
          throw new Error('Transaction receipt not found after waiting. Please check BaseScan.')
        }

        console.log('📦 Transaction receipt:', receipt)
        console.log('📦 Receipt status:', receipt.status)
        console.log('📦 Receipt logs:', receipt.logs)

        // Check if transaction was successful
        if (receipt.status !== 'success') {
          throw new Error('Transaction reverted or failed')
        }

        // Look for ALL logs from our contract
        const raceLogs = receipt.logs.filter((log: any) =>
          log.address.toLowerCase() === PIXEL_PONY_ADDRESS.toLowerCase()
        )

        console.log('🎯 Found race logs:', raceLogs)

        if (raceLogs.length === 0) {
          throw new Error('No events found from PixelPony contract in transaction logs')
        }

        // Try using viem's decodeEventLog on each log
        const { decodeEventLog } = await import('viem')

        let raceExecutedEvent = null
        for (const log of raceLogs) {
          try {
            console.log('🔍 Trying to decode log:', log)
            console.log('📊 Log topics:', log.topics)
            console.log('📊 Log data:', log.data)

            const decodedLog = decodeEventLog({
              abi: PIXEL_PONY_ABI,
              data: log.data,
              topics: log.topics,
              strict: false
            })

            console.log('✅ Successfully decoded:', decodedLog)

            if (decodedLog.eventName === 'RaceExecuted') {
              raceExecutedEvent = decodedLog
              break
            }
          } catch (err) {
            console.log('⚠️ Could not decode this log:', err)
            // Continue to next log
          }
        }

        if (!raceExecutedEvent) {
          throw new Error('RaceExecuted event not found in any logs. Check if contract ABI is correct.')
        }

        console.log('🔍 Decoded RaceExecuted event:', raceExecutedEvent)

        const { winners, payout, won } = raceExecutedEvent.args as any

        console.log('🏆 Winners:', winners)
        console.log('💰 Payout:', payout)
        console.log('🎉 Won:', won)

        const winnerIds = winners.map((w: bigint) => Number(w))

        // Animate the race with actual winners (announcement is shown in animation)
        await animateRace(winnerIds)

        // Keep track open so user can see the announcement
        // They can close it manually with the X button

        setStatusMessage(won ? '🎉 You won!' : '😢 Better luck next time!')

        // Refresh balances
        refetchJackpot()
        refetchPonyBalance()
        refetchEthBalance()

        // Reset race state
        setIsRacing(false)
        setRaceHash(null)
        setIsApproved(false)
        resetWrite()

        // Prevent re-running with the same hash
        return
      } catch (error: any) {
        console.error('❌ Error in race handler:', error)
        console.error('❌ Error message:', error?.message)
        console.error('❌ Error stack:', error?.stack)
        setStatusMessage(`⚠️ Error: ${error?.message || 'Unknown error'}. Check console!`)
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
    // Refresh balances when closing
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
            : 'Not connected'}
        </div>
        {isConnected && address && (
          <div className="balance-info">
            <span>💰 {ethBalance || '0.0000'} ETH</span>
            <span>🐴 {ponyBalance || '0'} PONY</span>
          </div>
        )}
        {!isConnected && (
          <div style={{ marginTop: '10px' }}>
            {connectors.map((connector) => (
              <button
                key={connector.id}
                onClick={() => connect({ connector })}
                style={{
                  padding: '10px 20px',
                  margin: '5px',
                  background: '#ff6b6b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '10px'
                }}
              >
                Connect {connector.name}
              </button>
            ))}
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
          <div className="race-announcement" id="raceAnnouncement"></div>
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

      {/* Zero PONY Popup */}
      {showPonyPopup && (
        <div className="popup-overlay" onClick={() => setShowPonyPopup(false)}>
          <div className="popup-content" onClick={(e) => e.stopPropagation()}>
            <button className="popup-close" onClick={() => setShowPonyPopup(false)}>✕</button>
            <h2 style={{ color: '#ff6b6b', marginBottom: '20px' }}>🐴 Need PONY Tokens? 🐴</h2>
            <p style={{ fontSize: '16px', marginBottom: '20px', lineHeight: '1.6' }}>
              You need PONY tokens to play! Get 10B $PONY instantly by joining our Telegram!
            </p>
            <a
              href="https://t.me/pixelponies"
              target="_blank"
              rel="noopener noreferrer"
              className="telegram-btn"
            >
              📱 Join Telegram & Get 10B PONY
            </a>
            <p style={{ fontSize: '12px', marginTop: '15px', color: '#888' }}>
              Use the <code>/register</code> command in Telegram to receive your tokens
            </p>
          </div>
        </div>
      )}

    </div>
  )
}

export default App
