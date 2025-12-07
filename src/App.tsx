import { useState, useEffect, useRef } from 'react'
import { useAccount, useConnect, useReadContract } from 'wagmi'
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

// Use the full ABI from the verified contract
const PIXEL_PONY_ABI = PIXEL_PONY_ABI_FULL

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

  const [selectedHorse, setSelectedHorse] = useState<number | null>(null)
  const [selectedBet, setSelectedBet] = useState<bigint | null>(null)
  const [statusMessage, setStatusMessage] = useState('Pick your pony and bet amount - this is a FREE demo!')
  const [showTrack, setShowTrack] = useState(false)
  const [ponyBalance, setPonyBalance] = useState('0')
  const [isRacing, setIsRacing] = useState(false)
  const trackInnerRef = useRef<HTMLDivElement>(null)

  // Simulator mode state
  const [simulatorBalance, setSimulatorBalance] = useState<bigint>(parseEther('100000000000')) // Start with 100B PONY
  const [lastRaceResult, setLastRaceResult] = useState<{won: boolean, payout: bigint, winners: number[]} | null>(null)

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

  // Read jackpot for display purposes only
  const { data: gameStats } = useReadContract({
    address: PIXEL_PONY_ADDRESS,
    abi: PIXEL_PONY_ABI,
    functionName: 'getGameStats'
  })

  // Simulator mode: No other blockchain reads needed

  // Update simulator balance display
  useEffect(() => {
    setPonyBalance(formatPony(formatEther(simulatorBalance)))
  }, [simulatorBalance])

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
    updateStatus()
  }

  const updateStatus = () => {
    if (selectedHorse !== null && selectedBet !== null) {
      const betDisplay = formatPony(formatEther(selectedBet))
      setStatusMessage(`Ready! Pony #${selectedHorse + 1} with ${betDisplay} PONY bet. Click RACE to start!`)
    }
  }

  // Generate random winners for simulator
  const generateRandomWinners = (playerHorse: number): {winners: number[], playerWon: boolean} => {
    // 33% chance player wins (if in top 3)
    const playerWinChance = Math.random() < 0.33

    const winners: number[] = []
    const availableHorses = Array.from({length: 16}, (_, i) => i)

    if (playerWinChance) {
      // Player wins - put them in a random winning position
      const winPosition = Math.floor(Math.random() * 3)
      winners[winPosition] = playerHorse

      // Remove player horse from available
      availableHorses.splice(playerHorse, 1)

      // Fill other positions
      for (let i = 0; i < 3; i++) {
        if (i !== winPosition) {
          const randomIndex = Math.floor(Math.random() * availableHorses.length)
          winners[i] = availableHorses[randomIndex]
          availableHorses.splice(randomIndex, 1)
        }
      }
    } else {
      // Player loses - pick 3 random winners (not player)
      availableHorses.splice(playerHorse, 1)
      for (let i = 0; i < 3; i++) {
        const randomIndex = Math.floor(Math.random() * availableHorses.length)
        winners[i] = availableHorses[randomIndex]
        availableHorses.splice(randomIndex, 1)
      }
    }

    return {winners, playerWon: playerWinChance}
  }

  // Simulator: Race with local randomness
  const handleRace = async () => {
    if (selectedHorse === null || !selectedBet || isRacing) return

    // Check if player has enough balance
    if (simulatorBalance < selectedBet) {
      setStatusMessage('❌ Not enough PONY! Refresh to get more demo tokens.')
      return
    }

    try {
      setStatusMessage('🏁 Starting race...')
      setIsRacing(true)
      setShowTrack(true)

      // Deduct bet from simulator balance
      setSimulatorBalance(prev => prev - selectedBet)

      console.log('🎮 SIMULATOR MODE - Racing with:')
      console.log('  - Horse ID:', selectedHorse)
      console.log('  - Bet Amount:', formatEther(selectedBet), 'PONY')

      // Wait a moment for track to show
      await new Promise(resolve => setTimeout(resolve, 500))

      // Generate random winners
      const {winners, playerWon} = generateRandomWinners(selectedHorse)
      console.log('🏆 Simulated winners:', winners)
      console.log('🎉 Player won:', playerWon)

      // Calculate payout (3x bet if won)
      const payout = playerWon ? selectedBet * 3n : 0n

      // Store result
      setLastRaceResult({won: playerWon, payout, winners})

      // If won, add payout to balance
      if (playerWon) {
        setSimulatorBalance(prev => prev + payout)
      }

      // Animate the race
      await animateRace(winners)

      setStatusMessage(playerWon ? '🎉 You won!' : '😢 Try again!')
      setIsRacing(false)
    } catch (error) {
      console.error('Race error:', error)
      setStatusMessage('❌ Race failed')
      setShowTrack(false)
      setIsRacing(false)
    }
  }

  // Note: Old blockchain transaction monitoring code removed for simulator mode

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
          if (announcement && selectedHorse !== null && lastRaceResult) {
            const playerWon = lastRaceResult.won
            const payout = lastRaceResult.payout
            const payoutDisplay = formatPony(formatEther(payout))
            const betDisplay = selectedBet ? formatPony(formatEther(selectedBet)) : '0'

            announcement.innerHTML = `
              🏆 RACE COMPLETE! 🏆<br>
              <div style="margin-top: 15px; font-size: 18px;">
                Winners:<br>
                🥇 Pony #${winners[0] + 1}<br>
                🥈 Pony #${winners[1] + 1}<br>
                🥉 Pony #${winners[2] + 1}
              </div>
              <div style="margin-top: 15px; font-size: 20px; color: ${playerWon ? '#4ade80' : '#f87171'};">
                ${playerWon
                  ? `🎉 YOU WON! 🎉<br><div style="font-size: 16px; margin-top: 10px;">You would have won ${payoutDisplay} PONY playing for real!</div>`
                  : `Better luck next time!<br><div style="font-size: 16px; margin-top: 10px;">You would have lost ${betDisplay} PONY playing for real.</div>`}
              </div>
              <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: center;">
                <button onclick="location.reload()" style="padding: 10px 20px; background: #4ade80; color: black; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: bold;">
                  🎮 PLAY AGAIN
                </button>
                <button onclick="window.open('https://pxpony.com', '_blank')" style="padding: 10px 20px; background: #ff6b6b; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: bold;">
                  💰 PLAY FOR REAL
                </button>
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

  const canRace = selectedHorse !== null && selectedBet !== null && !isRacing

  return (
    <div className="container">
      {/* Header */}
      <div className="header">
        <img src="/logo.png" alt="Pixel Ponies Logo" />
        <div className="tagline">16 PIXELATED PONIES RACING - FREE DEMO MODE</div>
        <div className="wallet-info">
          {isConnected && address
            ? `${address.slice(0, 6)}...${address.slice(-4)} | Demo Mode`
            : 'Demo Mode'}
        </div>
        <div className="balance-info">
          <span>🐴 {ponyBalance || '0'} PONY (Demo)</span>
        </div>
      </div>

      {/* Jackpot Display */}
      <div className="jackpot-display">
        <div className="jackpot-label">💰 DEMO JACKPOT 💰</div>
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
        <div className="bet-label">SELECT BET AMOUNT (Demo)</div>
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

      {/* Action Button */}
      <button className="race-btn" onClick={handleRace} disabled={!canRace}>
        🏁 RACE! (FREE DEMO)
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

    </div>
  )
}

export default App
