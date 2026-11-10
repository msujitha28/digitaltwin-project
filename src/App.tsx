import { useCallback, useEffect, useRef, useState } from 'react'
import { VIEWS } from './engine/circuits'
import { Session } from './engine/session'
import type { Bench, CheckStatus } from './engine/sim'
import type { ViewDef } from './engine/types'
import { Schematic } from './ui/Schematic'
import { Waveform } from './ui/Waveform'

const STATUS_TEXT: Record<CheckStatus, string> = {
  idle: 'Ready. Change an input or run the demo.',
  settling: 'Settling…',
  match: 'Gate level matches the spec',
  mismatch: 'Mismatch with the spec',
  undefined: 'Undefined: forbidden or indeterminate input',
  oscillating: 'Oscillating: no stable state',
}

const STATUS_TONE: Record<CheckStatus, string> = {
  idle: 'neutral',
  settling: 'neutral',
  match: 'good',
  mismatch: 'bad',
  undefined: 'warn',
  oscillating: 'warn',
}

function makeSession(view: ViewDef, delay: number, preload: boolean): Session {
  const s = new Session(view, delay)
  if (preload) {
    s.schedule(view.scenario, 0)
    for (let t = 0; t < view.scenarioLength; t += 0.5) s.advance(0.5)
  }
  return s
}

export function Simulator({ viewId, backHref, backLabel }: { viewId: string; backHref: string; backLabel: string }) {
  const view = VIEWS.find((v) => v.id === viewId)!
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(25)
  const [delay, setDelay] = useState(2)
  const [autoClock, setAutoClock] = useState(false)
  const [period, setPeriod] = useState(40)
  const [span, setSpan] = useState(160)
  const [, setTick] = useState(0)

  const sess = useRef<Session>(null as unknown as Session)
  if (!sess.current) sess.current = makeSession(view, 2, true)
  const stopAt = useRef<number | null>(null)
  const redraw = useCallback(() => setTick((t) => t + 1), [])

  // animation loop
  useEffect(() => {
    if (!running) return
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const s = sess.current
      let adv = Math.min((now - last) / 1000, 0.1) * speed
      last = now
      const stop = stopAt.current
      if (stop !== null) adv = Math.min(adv, Math.max(stop - s.time, 0))
      s.advance(adv)
      redraw()
      if (stop !== null && s.time >= stop - 1e-9) {
        stopAt.current = null
        setRunning(false)
        return
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [running, speed, redraw])

  const reset = () => {
    stopAt.current = null
    sess.current = makeSession(view, delay, false)
    setRunning(false)
    setAutoClock(false)
    redraw()
  }

  const replay = () => {
    sess.current = makeSession(view, delay, false)
    sess.current.schedule(view.scenario, 0)
    stopAt.current = view.scenarioLength
    setAutoClock(false)
    setRunning(true)
    redraw()
  }

  const toggleInput = (net: string) => {
    sess.current.toggleInput(net)
    stopAt.current = null
    setRunning(true)
    redraw()
  }

  const stepOnce = () => {
    sess.current.advance(delay)
    redraw()
  }

  const onAutoClock = (on: boolean) => {
    setAutoClock(on)
    if (on) {
      sess.current.startClock(period)
      stopAt.current = null
      setRunning(true)
    } else sess.current.stopClock()
    redraw()
  }

  const s = sess.current
  const bench0 = s.benches[0]
  const risen = Object.fromEntries(
    Object.keys(bench0.inputs).map((n) => [n, s.time - (bench0.risen[n] ?? -1e9) < 6]),
  )

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>Sequential Circuit Twin</h1>
          <p className="sub">
            A gate-level digital twin of latches and flip-flops. Every gate has a propagation delay, and every
            output is checked against a behavioural spec.
          </p>
        </div>
        <div className="readout" aria-live="off">
          <span className="readout-label">Simulation time</span>
          <span className="readout-value">{s.time.toFixed(1)} ns</span>
        </div>
      </header>

      <nav className="crumbs" aria-label="Breadcrumb">
        <a href="#">Home</a>
        <span aria-hidden="true">/</span>
        <a href={backHref}>{backLabel}</a>
        <span aria-hidden="true">/</span>
        <span>{view.name}</span>
      </nav>

      <div className="layout">
        <section className="panel stage" aria-label="Circuit">
          <div className="panel-head">
            <h2>{view.name}</h2>
            <span className="chip">{view.tag}</span>
          </div>
          <p className="blurb">{view.blurb}</p>
          <p className="hint">Click an input switch to change it. The gates respond after their propagation delay.</p>
          <div className="schematics">
            {s.benches.map((b, i) => (
              <Schematic
                key={`${view.id}-${i}`}
                bench={b}
                onToggle={toggleInput}
                lockedNet={autoClock ? view.clock : undefined}
                title={s.benches.length > 1 ? b.circuit.name : undefined}
              />
            ))}
          </div>
        </section>

        <aside className="panel controls" aria-label="Controls">
          <h2>Controls</h2>
          <div className="btn-row">
            <button className="btn primary" onClick={() => setRunning((r) => !r)}>
              {running ? 'Pause' : 'Run'}
            </button>
            <button className="btn" onClick={stepOnce} disabled={running} title="Advance by one gate delay">
              Step
            </button>
            <button className="btn" onClick={reset}>
              Reset
            </button>
          </div>
          <button className="btn wide" onClick={replay}>
            Replay demo sequence
          </button>
          <p className="caption">{view.scenarioCaption}</p>

          <div className="field">
            <label htmlFor="speed">
              Playback speed <output>{speed} ns/s</output>
            </label>
            <input id="speed" type="range" min={5} max={80} step={5} value={speed} onChange={(e) => setSpeed(+e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="delay">
              Gate delay <output>{delay} ns</output>
            </label>
            <input
              id="delay"
              type="range"
              min={1}
              max={5}
              step={0.5}
              value={delay}
              onChange={(e) => {
                const d = +e.target.value
                setDelay(d)
                sess.current.setDelay(d)
              }}
            />
          </div>

          {view.clock && (
            <div className="clockbox">
              <label className="check" htmlFor="autoclock">
                <input id="autoclock" type="checkbox" checked={autoClock} onChange={(e) => onAutoClock(e.target.checked)} />
                <span>Auto clock on {view.clock}</span>
              </label>
              <div className="field">
                <label htmlFor="period">
                  Clock period <output>{period} ns</output>
                </label>
                <input
                  id="period"
                  type="range"
                  min={20}
                  max={100}
                  step={10}
                  value={period}
                  onChange={(e) => {
                    const p = +e.target.value
                    setPeriod(p)
                    sess.current.setClockPeriod(p)
                  }}
                />
              </div>
            </div>
          )}
        </aside>

        <section className="panel timing" aria-label="Timing diagram">
          <div className="panel-head">
            <h2>Timing diagram</h2>
            <div className="seg" role="group" aria-label="Time window">
              {[80, 160, 320].map((w) => (
                <button key={w} className={`seg-btn${span === w ? ' on' : ''}`} onClick={() => setSpan(w)}>
                  {w} ns
                </button>
              ))}
            </div>
          </div>
          <Waveform session={s} traces={view.traces} span={span} />
          <p className="legend">
            <span className="lg in">Input</span>
            <span className="lg clk">Clock / enable</span>
            <span className="lg out">Gate-level output</span>
            {view.traces.some((t) => t.kind === 'ref') && <span className="lg ref">Spec (reference model)</span>}
            {view.traces.some((t) => t.kind === 'ref') && <span className="lg x">Undefined</span>}
          </p>
        </section>
      </div>

      <div className="lower">
        <section className="panel" aria-label="Characteristic table">
          <h2>{view.tableTitle ?? 'Characteristic table'}</h2>
          <div className="table-scroll">
            <table className="truth">
              <thead>
                <tr>
                  {view.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.rows.map((r, i) => (
                  <tr key={i} className={r.match(bench0.inputs, risen) ? 'hit' : ''}>
                    {r.cells.map((c, j) => (
                      <td key={j}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {view.equation && (
            <p className="equation">
              <span>Characteristic equation</span> {view.equation}
            </p>
          )}
          {view.extraTables?.map((t) => (
            <div key={t.title} className="extra-table">
              <h3>{t.title}</h3>
              <div className="table-scroll">
                <table className="truth">
                  <thead>
                    <tr>
                      {t.columns.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {t.rows.map((r, i) => (
                      <tr key={i}>
                        {r.cells.map((c, j) => (
                          <td key={j}>{c}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <ul className="notes">
            {view.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>

        <section className="panel" aria-label="Twin verification">
          <h2>Twin verification</h2>
          <p className="caption">
            Once the gates settle, Q and Q′ are compared with what the ideal behaviour says they should be.
          </p>
          {s.benches.map((b, i) => (
            <CheckCard key={`${view.id}-${i}`} bench={b} label={s.benches.length > 1 ? b.circuit.name : undefined} />
          ))}
        </section>
      </div>

      <footer className="foot">
        Built with React and TypeScript. The simulator is an event-driven gate model with transport delay; circuits
        are plain netlists in <code>src/engine/circuits.ts</code>.
      </footer>
    </div>
  )
}

function CheckCard({ bench, label }: { bench: Bench; label?: string }) {
  const tone = STATUS_TONE[bench.status]
  return (
    <div className="check-card">
      {label && <div className="check-label">{label}</div>}
      <div className={`status ${tone}`} role="status">
        <span className="status-dot" aria-hidden="true" />
        <span>{STATUS_TEXT[bench.status]}</span>
        <span className="score">
          {bench.passes} passed · {bench.fails} failed
        </span>
      </div>
      <ol className="log">
        {bench.log.slice(0, 5).map((e, i) => (
          <li key={`${e.t}-${i}`}>
            <span className="log-t">{e.t.toFixed(1)} ns</span>
            <span className="log-in">{e.inputs}</span>
            <span className="log-out">
              {e.status === 'match' || e.status === 'mismatch'
                ? `Q=${e.q} expected ${e.expected}`
                : `Q=${e.q} Q′=${e.qn}`}
            </span>
            <span className={`pill ${e.status}`}>{e.status}</span>
          </li>
        ))}
        {bench.log.length === 0 && <li className="empty">No checks yet.</li>}
      </ol>
    </div>
  )
}
