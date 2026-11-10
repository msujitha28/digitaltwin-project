import type { Session } from '../engine/session'
import type { TraceDef } from '../engine/types'
import type { History } from '../engine/sim'

const VB_W = 940
const X0 = 104
const PW = VB_W - X0 - 14
const ROW = 46
const TOP = 8
const AXIS = 28

interface Seg {
  a: number
  b: number
  v: number
}

function segments(h: History, t0: number, t1: number): Seg[] {
  const out: Seg[] = []
  for (let i = 0; i < h.length; i++) {
    const a = Math.max(h[i][0], t0)
    const b = Math.min(i + 1 < h.length ? h[i + 1][0] : t1, t1)
    if (b > a || (b === a && i === h.length - 1)) out.push({ a, b, v: h[i][1] })
  }
  return out
}

function historyFor(session: Session, tr: TraceDef): History {
  const bench = session.benches[tr.bench]
  return tr.net === '__model' ? bench.modelHistory : (bench.sim.history[tr.net] ?? [[0, 0]])
}

interface Props {
  session: Session
  traces: TraceDef[]
  span: number
}

export function Waveform({ session, traces, span }: Props) {
  const now = session.time
  const t1 = Math.max(span, now)
  const t0 = t1 - span
  const X = (t: number) => X0 + ((t - t0) / span) * PW
  const height = TOP + traces.length * ROW + AXIS
  const step = span <= 100 ? 10 : span <= 200 ? 20 : 40
  const ticks: number[] = []
  for (let t = Math.ceil(t0 / step) * step; t <= t1 + 0.001; t += step) ticks.push(t)

  return (
    <div className="wave-scroll">
      <svg
        viewBox={`0 0 ${VB_W} ${height}`}
        style={{ width: '100%', minWidth: 640 }}
        role="img"
        aria-label="Timing diagram"
      >
        <defs>
          <pattern id="xhatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className="hatch" />
          </pattern>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={X(t)} x2={X(t)} y1={TOP} y2={height - AXIS + 4} />
            <text className="tick" x={X(t)} y={height - 8} textAnchor="middle">
              {Math.round(t)}
            </text>
          </g>
        ))}
        <text className="tick unit" x={X0 - 14} y={height - 8} textAnchor="end">
          ns
        </text>

        {traces.map((tr, i) => {
          const top = TOP + i * ROW
          const yHi = top + 11
          const yLo = top + ROW - 12
          const segs = segments(historyFor(session, tr), t0, Math.min(now, t1))
          let d = ''
          let prevDefined = false
          const bands: Seg[] = []
          for (const s of segs) {
            if (s.v === 2) {
              bands.push(s)
              prevDefined = false
              continue
            }
            const y = s.v ? yHi : yLo
            d += prevDefined ? `L${X(s.a).toFixed(1)},${y} ` : `M${X(s.a).toFixed(1)},${y} `
            d += `L${X(s.b).toFixed(1)},${y} `
            prevDefined = true
          }
          return (
            <g key={`${tr.bench}-${tr.net}-${tr.label}`} className={`trace ${tr.kind}`}>
              <line className="rowline" x1={X0} x2={X0 + PW} y1={yLo + 6} y2={yLo + 6} />
              <text className="tlabel" x={X0 - 14} y={top + ROW / 2 + 4} textAnchor="end">
                {tr.label}
              </text>
              {bands.map((b, k) => (
                <g key={k}>
                  <rect
                    className="xband"
                    x={X(b.a)}
                    y={yHi - 3}
                    width={Math.max(X(b.b) - X(b.a), 0)}
                    height={yLo - yHi + 6}
                  />
                  <rect
                    className="xhatch"
                    x={X(b.a)}
                    y={yHi - 3}
                    width={Math.max(X(b.b) - X(b.a), 0)}
                    height={yLo - yHi + 6}
                    fill="url(#xhatch)"
                  />
                </g>
              ))}
              <path className="line" d={d} />
            </g>
          )
        })}

        <line className="cursor" x1={X(Math.min(now, t1))} x2={X(Math.min(now, t1))} y1={TOP} y2={height - AXIS + 4} />
      </svg>
    </div>
  )
}
