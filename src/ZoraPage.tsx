import { useState, useEffect, useRef } from 'react'
import './ZoraPage.css'

interface Participant {
  username: string
  horseNumber: number
}

interface RaceResult {
  winners: number[]
  participantResults: {
    username: string
    horseNumber: number
    won: boolean
    position: number
  }[]
}

function ZoraPage() {
  const [participants, setParticipants] = useState<Participant[]>([])
  const [username, setUsername] = useState('')
  const [horseNumber, setHorseNumber] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [isRacing, setIsRacing] = useState(false)
  const [showTrack, setShowTrack] = useState(false)
  const [raceResult, setRaceResult] = useState<RaceResult | null>(null)
  const trackInnerRef = useRef<HTMLDivElement>(null)

  // Calculate next race time (12pm UTC-6 / 6pm UTC)
  const getNextRaceTime = () => {
    const now = new Date()

    // 12pm UTC-6 is 18:00 UTC (6pm UTC)
    const targetUTCHour = 18

    // Create target time for today at 6pm UTC
    const targetTime = new Date(now)
    targetTime.setUTCHours(targetUTCHour, 0, 0, 0)

    // If we've passed today's race time, schedule for tomorrow
    if (now >= targetTime) {
      targetTime.setUTCDate(targetTime.getUTCDate() + 1)
    }

    return targetTime.getTime()
  }

  // Initialize countdown from localStorage or calculate new target
  useEffect(() => {
    const storedTargetTime = localStorage.getItem('zoraRaceTargetTime')
    let targetTime: number

    if (storedTargetTime) {
      targetTime = parseInt(storedTargetTime)
      // If stored time is in the past, calculate next race time
      if (targetTime <= Date.now()) {
        targetTime = getNextRaceTime()
        localStorage.setItem('zoraRaceTargetTime', targetTime.toString())
      }
    } else {
      targetTime = getNextRaceTime()
      localStorage.setItem('zoraRaceTargetTime', targetTime.toString())
    }

    const secondsUntilRace = Math.max(0, Math.floor((targetTime - Date.now()) / 1000))
    setCountdown(secondsUntilRace)
  }, [])

  // Countdown timer - updates every second
  useEffect(() => {
    const timer = setInterval(() => {
      const storedTargetTime = localStorage.getItem('zoraRaceTargetTime')
      if (storedTargetTime) {
        const targetTime = parseInt(storedTargetTime)
        const secondsUntilRace = Math.max(0, Math.floor((targetTime - Date.now()) / 1000))
        setCountdown(secondsUntilRace)

        // Auto-start race when countdown reaches 0
        if (secondsUntilRace === 0 && !isRacing && participants.length > 0) {
          handleRace()
        }
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [isRacing, participants])

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const addParticipant = () => {
    if (!username.trim() || !horseNumber) {
      alert('Please enter both username and horse number')
      return
    }

    const horse = parseInt(horseNumber)
    if (isNaN(horse) || horse < 1 || horse > 16) {
      alert('Horse number must be between 1 and 16')
      return
    }

    setParticipants([...participants, { username: username.trim(), horseNumber: horse }])
    setUsername('')
    setHorseNumber('')
  }

  const removeParticipant = (index: number) => {
    setParticipants(participants.filter((_, i) => i !== index))
  }

  const generateRandomWinners = (): number[] => {
    const winners: number[] = []
    const availableHorses = Array.from({length: 16}, (_, i) => i)

    for (let i = 0; i < 3; i++) {
      const randomIndex = Math.floor(Math.random() * availableHorses.length)
      winners[i] = availableHorses[randomIndex]
      availableHorses.splice(randomIndex, 1)
    }

    return winners
  }

  const handleRace = async () => {
    if (participants.length === 0 || isRacing) return

    setIsRacing(true)
    setShowTrack(true)
    setRaceResult(null)

    // Wait for track to show
    await new Promise(resolve => setTimeout(resolve, 500))

    // Generate winners
    const winners = generateRandomWinners()

    // Calculate results for all participants
    const participantResults = participants.map(p => {
      const horseId = p.horseNumber - 1 // Convert to 0-indexed
      const winnerIndex = winners.indexOf(horseId)
      return {
        username: p.username,
        horseNumber: p.horseNumber,
        won: winnerIndex !== -1,
        position: winnerIndex
      }
    })

    // Animate the race
    await animateRace(winners)

    // Store results
    setRaceResult({ winners, participantResults })

    // Check if anyone won
    const anyWinner = participantResults.some(p => p.won)

    // Set next race time to tomorrow at 12pm UTC-6
    const nextRaceTime = getNextRaceTime()
    localStorage.setItem('zoraRaceTargetTime', nextRaceTime.toString())

    if (!anyWinner) {
      // No winners - restart countdown after showing results
      setTimeout(() => {
        setShowTrack(false)
        setRaceResult(null)
        setIsRacing(false)
        const secondsUntilRace = Math.max(0, Math.floor((nextRaceTime - Date.now()) / 1000))
        setCountdown(secondsUntilRace)
      }, 5000)
    } else {
      setIsRacing(false)
      // Update countdown for next race
      const secondsUntilRace = Math.max(0, Math.floor((nextRaceTime - Date.now()) / 1000))
      setCountdown(secondsUntilRace)
    }
  }

  const animateRace = (winners: number[]): Promise<void> => {
    return new Promise((resolve) => {
      const trackContainer = trackInnerRef.current
      if (!trackContainer) {
        resolve()
        return
      }

      const trackWidth = trackContainer.offsetWidth
      const duration = 6000
      const startPosition = 35
      const finishPosition = trackWidth - 70
      const raceDistance = finishPosition - startPosition

      const horseSpeeds = Array(16).fill(0).map(() => 1.0 + Math.random() * 0.2)

      // Make winners faster
      winners.forEach((winnerId, index) => {
        if (index === 0) horseSpeeds[winnerId] = 1.5
        else if (index === 1) horseSpeeds[winnerId] = 1.4
        else if (index === 2) horseSpeeds[winnerId] = 1.3
      })

      const startTime = Date.now()

      const animationInterval = setInterval(() => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / duration, 1)

        for (let i = 0; i < 16; i++) {
          const horse = document.getElementById(`zora-racer-${i}`)
          if (!horse) continue

          const speed = horseSpeeds[i]
          const easeProgress = 1 - Math.pow(1 - progress, 2)
          const position = startPosition + (raceDistance * easeProgress * speed)
          const clampedPosition = Math.min(position, finishPosition)

          horse.style.left = clampedPosition + 'px'

          if (easeProgress >= 0.95 && winners.includes(i)) {
            horse.classList.add('winner')
          }
        }

        if (progress >= 1) {
          clearInterval(animationInterval)
          setTimeout(resolve, 500)
        }
      }, 50)
    })
  }

  const closeTrack = () => {
    setShowTrack(false)
    setRaceResult(null)
    // Reset for next race
    setParticipants([])
    // Set next race time to tomorrow at 12pm UTC-6
    const nextRaceTime = getNextRaceTime()
    localStorage.setItem('zoraRaceTargetTime', nextRaceTime.toString())
    const secondsUntilRace = Math.max(0, Math.floor((nextRaceTime - Date.now()) / 1000))
    setCountdown(secondsUntilRace)
  }

  const getPositionEmoji = (position: number) => {
    if (position === 0) return '🥇'
    if (position === 1) return '🥈'
    if (position === 2) return '🥉'
    return ''
  }

  const getMultiplier = (position: number) => {
    if (position === 0) return '10x'
    if (position === 1) return '2.5x'
    if (position === 2) return '1x'
    return ''
  }

  return (
    <div className="zora-container">
      {/* Header */}
      <div className="zora-header">
        <img src="/logo.png" alt="Pixel Ponies Logo" />
        <div className="zora-title">ZORA LIVESTREAM RACING</div>
        <div className="zora-subtitle">Daily at 12PM UTC-6 | 100M PONY per bet</div>
      </div>

      {/* Countdown */}
      <div className="countdown-section">
        <div className="countdown-label">NEXT RACE:</div>
        <div className="countdown-timer">{formatTime(countdown)}</div>
      </div>

      {/* Entry Form */}
      <div className="entry-section">
        <h3>Add Participants</h3>
        <div className="entry-form">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="entry-input"
          />
          <input
            type="number"
            placeholder="Horse # (1-16)"
            value={horseNumber}
            onChange={(e) => setHorseNumber(e.target.value)}
            min="1"
            max="16"
            className="entry-input"
          />
          <button onClick={addParticipant} className="add-btn">
            ADD
          </button>
        </div>
      </div>

      {/* Participants List */}
      <div className="participants-section">
        <h3>Participants ({participants.length})</h3>
        {participants.length === 0 ? (
          <div className="no-participants">No participants yet...</div>
        ) : (
          <div className="participants-list">
            {participants.map((p, i) => (
              <div key={i} className="participant-item">
                <span className="participant-name">{p.username}</span>
                <span className="participant-horse">Pony #{p.horseNumber}</span>
                <button onClick={() => removeParticipant(i)} className="remove-btn">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manual Race Button */}
      <button
        onClick={handleRace}
        disabled={participants.length === 0 || isRacing}
        className="race-btn"
      >
        🏁 START RACE NOW
      </button>

      {/* Race Track */}
      <div className={`track-container ${showTrack ? 'active' : ''}`}>
        <div className="track-inner" ref={trackInnerRef}>
          <button className="track-close" onClick={closeTrack}>
            ✕ CLOSE
          </button>

          {/* Results Display */}
          {raceResult && (
            <div className="race-results">
              <div className="results-title">🏆 RACE COMPLETE! 🏆</div>

              <div className="winners-section">
                <div className="winners-title">Winners:</div>
                {raceResult.winners.map((horseId, idx) => (
                  <div key={idx} className="winner-item">
                    {getPositionEmoji(idx)} Pony #{horseId + 1} ({getMultiplier(idx)})
                  </div>
                ))}
              </div>

              <div className="participant-results">
                {raceResult.participantResults.map((result, idx) => (
                  <div key={idx} className={`result-item ${result.won ? 'winner' : 'loser'}`}>
                    <span className="result-username">{result.username}</span>
                    <span className="result-horse">Pony #{result.horseNumber}</span>
                    {result.won ? (
                      <span className="result-status">
                        {getPositionEmoji(result.position)} WON {getMultiplier(result.position)}!
                      </span>
                    ) : (
                      <span className="result-status">❌ LOST</span>
                    )}
                  </div>
                ))}
              </div>

              {!raceResult.participantResults.some(p => p.won) && (
                <div className="restart-message">
                  No winners! Restarting countdown in 5 seconds...
                </div>
              )}
            </div>
          )}

          {/* Horse Lanes */}
          {Array.from({ length: 16 }, (_, i) => {
            const spriteNum = (i % 30) + 1
            const hasParticipant = participants.some(p => p.horseNumber === i + 1)
            return (
              <div key={i} className="track-lane">
                <span className="lane-number">#{i + 1}</span>
                <img
                  id={`zora-racer-${i}`}
                  src={`/sprites/${spriteNum}.png`}
                  className={`horse-racer ${hasParticipant ? 'has-participant' : ''}`}
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

export default ZoraPage
