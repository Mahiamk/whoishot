import { useId, useMemo, useState } from 'react'
import * as d3 from 'd3'

interface NormalDistributionCurveProps {
  score: number | null
  mean: number
  stdDev: number
  percentile?: number | null
  bracketScores?: number[]
  width?: number
  height?: number
  className?: string
}

export function NormalDistributionCurve({
  score,
  mean = 6.0,
  stdDev = 1.2,
  percentile,
  bracketScores = [],
  width = 340,
  height = 160,
  className = '',
}: NormalDistributionCurveProps) {
  const gradientId = useId().replace(/:/g, '')
  const [hoverX, setHoverX] = useState<number | null>(null)

  // Clamp stdDev to safe positive value
  const sigma = Math.max(0.4, stdDev || 1.0)
  const mu = Math.min(9.5, Math.max(1.5, mean || 5.5))
  const userScore = score !== null && score !== undefined ? Math.min(10, Math.max(1, score)) : null

  // Gaussian probability density function
  const gaussian = (x: number, m: number, s: number) => {
    const factor = 1 / (s * Math.sqrt(2 * Math.PI))
    const exponent = -0.5 * Math.pow((x - m) / s, 2)
    return factor * Math.exp(exponent)
  }

  // Calculate curve points across range [1, 10]
  const { pathD, areaD, shadedD, xScale, yScale, maxDensity } = useMemo(() => {
    const margin = { top: 24, right: 16, bottom: 28, left: 16 }
    const innerWidth = Math.max(width - margin.left - margin.right, 20)
    const innerHeight = Math.max(height - margin.top - margin.bottom, 20)

    const xs = d3.scaleLinear().domain([1, 10]).range([margin.left, margin.left + innerWidth])

    // Generate 90 smooth resolution points
    const step = 0.1
    const pts: Array<{ x: number; y: number; px: number; py: number }> = []
    let maxD = 0

    for (let x = 1; x <= 10.01; x += step) {
      const y = gaussian(x, mu, sigma)
      if (y > maxD) maxD = y
      pts.push({ x, y, px: xs(x), py: 0 })
    }

    const ys = d3
      .scaleLinear()
      .domain([0, maxD * 1.25])
      .range([margin.top + innerHeight, margin.top])

    pts.forEach((p) => {
      p.py = ys(p.y)
    })

    const lineGen = d3
      .line<{ px: number; py: number }>()
      .x((d) => d.px)
      .y((d) => d.py)
      .curve(d3.curveBasis)

    const areaGen = d3
      .area<{ px: number; py: number }>()
      .x((d) => d.px)
      .y0(margin.top + innerHeight)
      .y1((d) => d.py)
      .curve(d3.curveBasis)

    // Shaded percentile area up to user score
    let shadedAreaPath = ''
    if (userScore !== null) {
      const shadedPts = pts.filter((p) => p.x <= userScore)
      if (shadedPts.length > 0) {
        // Add exact score boundary point
        const userY = gaussian(userScore, mu, sigma)
        const exactPt = { x: userScore, y: userY, px: xs(userScore), py: ys(userY) }
        const fullShaded = [...shadedPts, exactPt]
        shadedAreaPath = areaGen(fullShaded) || ''
      }
    }

    return {
      pathD: lineGen(pts) || '',
      areaD: areaGen(pts) || '',
      shadedD: shadedAreaPath,
      xScale: xs,
      yScale: ys,
      maxDensity: maxD,
    }
  }, [width, height, mu, sigma, userScore])

  const userPx = userScore !== null ? xScale(userScore) : null
  const userPy = userScore !== null ? yScale(gaussian(userScore, mu, sigma)) : null
  const meanPx = xScale(mu)

  // Derived percentile display
  const calculatedPercentile = useMemo(() => {
    if (percentile !== null && percentile !== undefined) return percentile
    if (userScore === null) return null
    // Standard normal CDF approximation (Z-score)
    const z = (userScore - mu) / sigma
    const t = 1 / (1 + 0.2316419 * Math.abs(z))
    const d = 0.3989423 * Math.exp((-z * z) / 2)
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
    const cdf = z >= 0 ? 1 - p : p
    return Math.round(cdf * 1000) / 10
  }, [percentile, userScore, mu, sigma])

  const topPercent = calculatedPercentile !== null ? Math.max(1, Math.round(100 - calculatedPercentile)) : null

  return (
    <div className={`relative flex flex-col items-center select-none ${className}`}>
      <svg
        width={width}
        height={height}
        className="overflow-visible"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const mx = e.clientX - rect.left
          const val = xScale.invert(mx)
          if (val >= 1 && val <= 10) {
            setHoverX(val)
          }
        }}
        onMouseLeave={() => setHoverX(null)}
      >
        <defs>
          {/* Main curve area gradient */}
          <linearGradient id={`norm-grad-${gradientId}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.02" />
          </linearGradient>

          {/* Shaded percentile highlight gradient */}
          <linearGradient id={`norm-shade-${gradientId}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#ec4899" stopOpacity="0.10" />
          </linearGradient>

          <filter id={`norm-glow-${gradientId}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Baseline Axis */}
        <line
          x1={xScale(1)}
          x2={xScale(10)}
          y1={yScale(0)}
          y2={yScale(0)}
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="1"
        />

        {/* Standard Deviation Sigma Grid Bands (±1σ, ±2σ) */}
        {mu - sigma >= 1 && mu + sigma <= 10 && (
          <rect
            x={xScale(Math.max(1, mu - sigma))}
            y={yScale(maxDensity * 1.15)}
            width={xScale(Math.min(10, mu + sigma)) - xScale(Math.max(1, mu - sigma))}
            height={yScale(0) - yScale(maxDensity * 1.15)}
            fill="#8b5cf6"
            fillOpacity="0.05"
            rx="4"
          />
        )}

        {/* Full Bell Curve Background Area */}
        <path d={areaD} fill={`url(#norm-grad-${gradientId})`} />

        {/* Shaded User Percentile Area */}
        {shadedD && <path d={shadedD} fill={`url(#norm-shade-${gradientId})`} />}

        {/* Bell Curve Outline */}
        <path
          d={pathD}
          fill="none"
          stroke="#8b5cf6"
          strokeWidth="2.5"
          strokeLinecap="round"
          filter={`url(#norm-glow-${gradientId})`}
        />

        {/* Contestant Scores Scatter Dots */}
        {bracketScores.map((s, idx) => {
          if (s < 1 || s > 10) return null
          const dotPx = xScale(s)
          const dotPy = yScale(0)
          return (
            <circle
              key={idx}
              cx={dotPx}
              cy={dotPy}
              r="2"
              fill="#94a3b8"
              fillOpacity="0.5"
            />
          )
        })}

        {/* Mean Indicator Line (μ) */}
        <g>
          <line
            x1={meanPx}
            x2={meanPx}
            y1={yScale(maxDensity * 1.05)}
            y2={yScale(0)}
            stroke="#94a3b8"
            strokeWidth="1.5"
            strokeDasharray="3,3"
            strokeOpacity="0.7"
          />
          <text
            x={meanPx}
            y={yScale(0) + 16}
            textAnchor="middle"
            className="text-[10px] font-mono fill-muted-foreground"
          >
            μ {mu.toFixed(1)}
          </text>
        </g>

        {/* Axis Ticks (1, 5, 10) */}
        {[1, 3, 5, 7, 10].map((tick) => (
          <text
            key={tick}
            x={xScale(tick)}
            y={yScale(0) + 16}
            textAnchor="middle"
            className="text-[10px] font-mono fill-muted-foreground/60"
          >
            {tick}
          </text>
        ))}

        {/* User Contestant Score Marker & Pulsing Pin */}
        {userPx !== null && userPy !== null && userScore !== null && (
          <g className="transition-all duration-300">
            {/* Vertical pin line */}
            <line
              x1={userPx}
              x2={userPx}
              y1={userPy}
              y2={yScale(0)}
              stroke="#f59e0b"
              strokeWidth="2"
              strokeDasharray="2,2"
            />

            {/* Glowing pin head on the curve */}
            <circle
              cx={userPx}
              cy={userPy}
              r="6"
              fill="#f59e0b"
              className="animate-ping opacity-30"
            />
            <circle
              cx={userPx}
              cy={userPy}
              r="4.5"
              fill="#f59e0b"
              stroke="#ffffff"
              strokeWidth="1.5"
              className="drop-shadow-md"
            />

            {/* Score Callout Bubble */}
            <g transform={`translate(${userPx}, ${Math.max(14, userPy - 10)})`}>
              <rect
                x="-36"
                y="-18"
                width="72"
                height="18"
                rx="9"
                fill="#f59e0b"
                className="drop-shadow-sm"
              />
              <text
                x="0"
                y="-5"
                textAnchor="middle"
                className="text-[10px] font-bold font-mono fill-white tracking-tight"
              >
                You: {userScore.toFixed(2)}
              </text>
            </g>
          </g>
        )}

        {/* Hover Guide */}
        {hoverX !== null && (
          <g>
            <line
              x1={xScale(hoverX)}
              x2={xScale(hoverX)}
              y1={yScale(gaussian(hoverX, mu, sigma))}
              y2={yScale(0)}
              stroke="#ec4899"
              strokeWidth="1"
              strokeDasharray="2,2"
            />
            <circle
              cx={xScale(hoverX)}
              cy={yScale(gaussian(hoverX, mu, sigma))}
              r="3.5"
              fill="#ec4899"
            />
          </g>
        )}
      </svg>

      {/* Standings & Percentile Summary Card */}
      {userScore !== null && calculatedPercentile !== null && (
        <div className="mt-3 flex items-center justify-between w-full max-w-sm px-3 py-2 rounded-xl bg-muted/40 border border-border/50 text-xs">
          <div className="flex items-center gap-1.5 font-medium">
            <span className="inline-block size-2 rounded-full bg-amber-500" />
            <span>Standing:</span>
            <strong className="text-amber-500">
              {calculatedPercentile >= 50
                ? `Top ${topPercent}% (${calculatedPercentile}th Percentile)`
                : `${calculatedPercentile}th Percentile`}
            </strong>
          </div>
          <span className="font-mono text-muted-foreground text-[11px]">
            {userScore >= mu ? `+${(userScore - mu).toFixed(2)} vs mean` : `${(userScore - mu).toFixed(2)} vs mean`}
          </span>
        </div>
      )}
    </div>
  )
}
