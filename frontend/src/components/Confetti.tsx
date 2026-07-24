import { useEffect, useState, type CSSProperties } from 'react'

const COLORS = ['#8E9861', '#FF5CA8', '#38B6E8', '#f59e0b', '#F5F3EA']
const PIECES = 28

/** Small, tasteful, dependency-free confetti burst. Fires once and
 * unmounts itself — no external library for a single decorative moment. */
export function Confetti() {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 2200)
    return () => clearTimeout(timer)
  }, [])

  if (!visible) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {Array.from({ length: PIECES }).map((_, i) => {
        const left = Math.random() * 100
        const delay = Math.random() * 0.4
        const duration = 1.6 + Math.random() * 0.8
        const size = 6 + Math.random() * 6
        const color = COLORS[i % COLORS.length]
        const rotate = Math.random() * 360
        const drift = (Math.random() - 0.5) * 160
        return (
          <span
            key={i}
            style={
              {
                position: 'absolute',
                top: '-5%',
                left: `${left}%`,
                width: size,
                height: size * 0.4,
                backgroundColor: color,
                borderRadius: 2,
                transform: `rotate(${rotate}deg)`,
                animation: `confetti-fall ${duration}s ease-in ${delay}s forwards`,
                '--drift': `${drift}px`,
              } as CSSProperties
            }
          />
        )
      })}
      <style>{`
        @keyframes confetti-fall {
          to {
            top: 105%;
            transform: translateX(var(--drift)) rotate(600deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}
