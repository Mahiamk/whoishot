import { useId, useMemo, useState } from 'react'
import * as d3 from 'd3'

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  color?: string
  showArea?: boolean
  showDots?: boolean
  interactive?: boolean
  className?: string
  labels?: string[]
}

export function Sparkline({
  data,
  width = 120,
  height = 36,
  color = '#8b5cf6',
  showArea = true,
  showDots = true,
  interactive = true,
  className = '',
  labels,
}: SparklineProps) {
  const gradientId = useId().replace(/:/g, '')
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const points = useMemo(() => {
    if (!data || data.length === 0) return [5, 5, 5]
    if (data.length === 1) return [data[0] * 0.9, data[0], data[0]]
    return data
  }, [data])

  const { pathD, areaD, coordinates } = useMemo(() => {
    const margin = { top: 4, right: 6, bottom: 4, left: 6 }
    const innerWidth = Math.max(width - margin.left - margin.right, 10)
    const innerHeight = Math.max(height - margin.top - margin.bottom, 10)

    const min = Math.min(...points)
    const max = Math.max(...points)
    // Add tiny padding so flat lines don't get clamped to top/bottom
    const domainPadding = (max - min) * 0.1 || 0.5
    const yMin = Math.max(0, min - domainPadding)
    const yMax = Math.min(10, max + domainPadding)

    const xScale = d3
      .scaleLinear()
      .domain([0, points.length - 1])
      .range([margin.left, margin.left + innerWidth])

    const yScale = d3
      .scaleLinear()
      .domain([yMin, yMax])
      .range([margin.top + innerHeight, margin.top])

    const lineGenerator = d3
      .line<number>()
      .x((_, i) => xScale(i))
      .y((d) => yScale(d))
      .curve(d3.curveMonotoneX)

    const areaGenerator = d3
      .area<number>()
      .x((_, i) => xScale(i))
      .y0(margin.top + innerHeight)
      .y1((d) => yScale(d))
      .curve(d3.curveMonotoneX)

    const coords = points.map((val, i) => ({
      x: xScale(i),
      y: yScale(val),
      val,
      label: labels && labels[i] ? labels[i] : `Point ${i + 1}`,
    }))

    return {
      pathD: lineGenerator(points) || '',
      areaD: areaGenerator(points) || '',
      coordinates: coords,
    }
  }, [points, width, height, labels])

  const lastPoint = coordinates[coordinates.length - 1]
  const hoveredPoint = hoverIndex !== null ? coordinates[hoverIndex] : null

  return (
    <div
      className={`relative inline-flex items-center select-none ${className}`}
      style={{ width, height }}
      onMouseLeave={() => setHoverIndex(null)}
    >
      <svg
        width={width}
        height={height}
        className="overflow-visible"
        onMouseMove={(e) => {
          if (!interactive || coordinates.length === 0) return
          const rect = e.currentTarget.getBoundingClientRect()
          const mouseX = e.clientX - rect.left
          // Find closest point by x coordinate
          let closestIdx = 0
          let minDist = Infinity
          coordinates.forEach((pt, i) => {
            const dist = Math.abs(pt.x - mouseX)
            if (dist < minDist) {
              minDist = dist
              closestIdx = i
            }
          })
          setHoverIndex(closestIdx)
        }}
      >
        <defs>
          <linearGradient id={`spark-grad-${gradientId}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.45" />
            <stop offset="70%" stopColor={color} stopOpacity="0.10" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
          <filter id={`spark-glow-${gradientId}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Gradient Fill Area */}
        {showArea && (
          <path
            d={areaD}
            fill={`url(#spark-grad-${gradientId})`}
            className="transition-all duration-300 ease-out"
          />
        )}

        {/* Spline Path */}
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#spark-glow-${gradientId})`}
          className="transition-all duration-300 ease-out"
        />

        {/* Final Endpoint Dot */}
        {showDots && lastPoint && hoverIndex === null && (
          <g>
            <circle
              cx={lastPoint.x}
              cy={lastPoint.y}
              r="4"
              fill={color}
              className="animate-pulse"
            />
            <circle
              cx={lastPoint.x}
              cy={lastPoint.y}
              r="2"
              fill="#ffffff"
            />
          </g>
        )}

        {/* Active Hover Marker */}
        {hoveredPoint && (
          <g className="transition-all duration-150">
            <line
              x1={hoveredPoint.x}
              x2={hoveredPoint.x}
              y1={4}
              y2={height - 4}
              stroke={color}
              strokeWidth="1"
              strokeDasharray="2,2"
              opacity="0.6"
            />
            <circle
              cx={hoveredPoint.x}
              cy={hoveredPoint.y}
              r="5"
              fill={color}
              stroke="#ffffff"
              strokeWidth="2"
              className="drop-shadow-md"
            />
          </g>
        )}
      </svg>

      {/* Floating Hover Tooltip */}
      {hoveredPoint && (
        <div
          className="pointer-events-none absolute z-30 -top-8 px-2 py-0.5 rounded-md bg-popover/95 border border-border text-[11px] font-mono font-bold text-popover-foreground shadow-lg backdrop-blur-sm transform -translate-x-1/2 whitespace-nowrap animate-in fade-in zoom-in-95 duration-100"
          style={{ left: hoveredPoint.x }}
        >
          <span className="text-muted-foreground mr-1 font-sans">{hoveredPoint.label}:</span>
          <span style={{ color }}>{hoveredPoint.val.toFixed(1)}</span>
        </div>
      )}
    </div>
  )
}
