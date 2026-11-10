import type { Bench } from '../engine/sim'
import type { GateDef } from '../engine/types'

const W = 52
const GATE_H = 48

function bubble(g: GateDef) {
  if (g.type === 'NOT') return { cx: g.x + 40, r: 4 }
  if (g.type === 'NAND' || g.type === 'NOR') return { cx: g.x + W + 4, r: 4 }
  return null
}

function GateShape({ g }: { g: GateDef }) {
  const { x, y, type } = g
  let d: string
  if (type === 'NOT') d = `M${x},${y - 16} L${x + 36},${y} L${x},${y + 16} Z`
  else if (type === 'NOR' || type === 'OR')
    d = `M${x},${y - 24} Q${x + 32},${y - 24} ${x + W},${y} Q${x + 32},${y + 24} ${x},${y + 24} Q${x + 14},${y} ${x},${y - 24} Z`
  else d = `M${x},${y - 24} H${x + 28} A24,24 0 0 1 ${x + 28},${y + 24} H${x} Z`

  const b = bubble(g)
  const n = g.inputs.length
  const stubs: number[] = []
  if (type === 'NOR' || type === 'OR') {
    for (let i = 0; i < n; i++) stubs.push(y - GATE_H / 2 + (GATE_H * (i + 1)) / (n + 1))
  }
  return (
    <g className="gate">
      <path d={d} />
      {stubs.map((sy) => (
        <line key={sy} x1={x} x2={x + 6.2} y1={sy} y2={sy} />
      ))}
      {b && <circle cx={b.cx} cy={y} r={b.r} />}
    </g>
  )
}

interface Props {
  bench: Bench
  onToggle: (net: string) => void
  lockedNet?: string
  title?: string
}

export function Schematic({ bench, onToggle, lockedNet, title }: Props) {
  const c = bench.circuit
  const val = (net: string) => bench.sim.nets[net]
  const [vw, vh] = c.viewBox
  return (
    <figure className="schematic">
      {title && <figcaption>{title}</figcaption>}
      <div className="schematic-scroll">
        <svg
          viewBox={`0 0 ${vw} ${vh}`}
          style={{ width: '100%', minWidth: Math.min(vw, 560), maxWidth: vw * 1.35 }}
          role="img"
          aria-label={`Logic diagram of the ${c.name}`}
        >
          {c.boxes?.map((b) => (
            <g key={b.label} className="box">
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={6} />
              <text x={b.x + 8} y={b.y - 8}>
                {b.label}
              </text>
            </g>
          ))}

          {c.wires.map((w, i) => (
            <polyline
              key={i}
              className={val(w.net) ? 'wire hi' : 'wire lo'}
              points={w.pts.map((p) => p.join(',')).join(' ')}
            />
          ))}
          {c.dots.map((d, i) => (
            <circle key={i} className={val(d.net) ? 'dot hi' : 'dot lo'} cx={d.x} cy={d.y} r={3.4} />
          ))}

          {c.gates.map((g) => (
            <GateShape key={g.id} g={g} />
          ))}

          {c.inputs.map((t) => {
            const v = val(t.net)
            const locked = lockedNet === t.net
            return (
              <g
                key={t.net}
                className={`switch${v ? ' on' : ''}${locked ? ' locked' : ''}`}
                role="switch"
                aria-checked={v === 1}
                aria-label={`${t.label} input`}
                tabIndex={locked ? -1 : 0}
                onClick={() => !locked && onToggle(t.net)}
                onKeyDown={(e) => {
                  if (!locked && (e.key === ' ' || e.key === 'Enter')) {
                    e.preventDefault()
                    onToggle(t.net)
                  }
                }}
              >
                <rect x={t.x - 58} y={t.y - 13} width={52} height={26} rx={5} />
                <text className="sw-label" x={t.x - 52} y={t.y + 4}>
                  {t.label}
                </text>
                <text className="sw-val" x={t.x - 14} y={t.y + 5} textAnchor="middle">
                  {v}
                </text>
              </g>
            )
          })}

          {c.outputs.map((t) => {
            const v = val(t.net)
            return (
              <g key={t.net} className={`led${v ? ' on' : ''}`}>
                <circle cx={t.x + 14} cy={t.y} r={8} />
                <text x={t.x + 30} y={t.y + 4}>
                  {t.label}
                </text>
                <text className="led-val" x={t.x + 14} y={t.y + 3.5} textAnchor="middle">
                  {v}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </figure>
  )
}
