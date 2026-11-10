import type { Bit, CircuitDef, GateDef, ModelBit } from './types'

interface Ev {
  t: number
  net: string
  v: Bit
}

export type History = [number, number][]

function evalGate(g: GateDef, nets: Record<string, Bit>): Bit {
  const ins = g.inputs.map((n) => nets[n])
  switch (g.type) {
    case 'NOT':
      return ins[0] ? 0 : 1
    case 'AND':
      return ins.every((v) => v === 1) ? 1 : 0
    case 'NAND':
      return ins.every((v) => v === 1) ? 0 : 1
    case 'OR':
      return ins.some((v) => v === 1) ? 1 : 0
    case 'NOR':
      return ins.some((v) => v === 1) ? 0 : 1
  }
}

/** Event-driven gate-level simulator with a transport delay on every gate. */
export class Simulator {
  time = 0
  nets: Record<string, Bit> = {}
  history: Record<string, History> = {}
  private target: Record<string, Bit> = {}
  private queue: Ev[] = []
  private partner: Record<string, string> = {}
  private fanout: Record<string, GateDef[]> = {}
  /** time of the most recent change on each net */
  lastChange: Record<string, number> = {}

  constructor(
    public circuit: CircuitDef,
    public delay: number,
  ) {
    for (const g of circuit.gates) {
      for (const n of g.inputs) (this.fanout[n] ||= []).push(g)
    }
    // Cross-coupled pairs: gate A drives a from b while gate B drives b from a.
    const driver: Record<string, GateDef> = {}
    for (const g of circuit.gates) driver[g.out] = g
    for (const g of circuit.gates) {
      for (const b of g.inputs) {
        const h = driver[b]
        if (h && h.inputs.includes(g.out)) this.partner[g.out] = b
      }
    }
    for (const [net, v] of Object.entries(circuit.init)) {
      this.nets[net] = v
      this.target[net] = v
      this.history[net] = [[0, v]]
      this.lastChange[net] = -Infinity
    }
  }

  setDelay(d: number) {
    this.delay = d
  }

  /**
   * Real gates are never perfectly matched. A few percent of skew between the two gates of a
   * cross-coupled pair lets a metastable latch settle after a while, as hardware does, instead of
   * oscillating in perfect lock-step forever.
   */
  private skew(g: GateDef): number {
    if (g.id.endsWith('1')) return 0.95
    if (g.id.endsWith('2')) return 1.05
    return 1
  }

  value(net: string): Bit {
    return this.nets[net]
  }

  get pending(): number {
    return this.queue.length
  }

  nextEventTime(): number {
    return this.queue.length ? this.queue[0].t : Infinity
  }

  private schedule(t: number, net: string, v: Bit) {
    const ev = { t, net, v }
    let i = this.queue.length
    while (i > 0 && this.queue[i - 1].t > t) i--
    this.queue.splice(i, 0, ev)
  }

  /**
   * Metastability. When both gates of a cross-coupled pair are about to flip in the same direction
   * at almost the same moment, real hardware lets whichever edge arrives first win and the other
   * output is pulled back. Without this, perfectly symmetric edges would chase each other forever.
   */
  private arbitrate(ev: Ev) {
    const other = this.partner[ev.net]
    if (!other) return
    const i = this.queue.findIndex((e) => e.net === other && e.v === ev.v && e.t - ev.t < 0.5 * this.delay)
    if (i >= 0) {
      this.queue.splice(i, 1)
      this.target[other] = this.nets[other]
    }
  }

  private apply(net: string, v: Bit) {
    if (this.nets[net] === v) return
    this.nets[net] = v
    this.target[net] = this.target[net] ?? v
    ;(this.history[net] ||= []).push([this.time, v])
    this.lastChange[net] = this.time
    for (const g of this.fanout[net] ?? []) {
      const nv = evalGate(g, this.nets)
      if (nv !== this.target[g.out]) {
        this.target[g.out] = nv
        this.schedule(this.time + this.delay * this.skew(g), g.out, nv)
      }
    }
  }

  /** Drive a primary input at the current simulation time. */
  setInput(net: string, v: Bit) {
    this.target[net] = v
    this.apply(net, v)
  }

  /** Process events up to and including time t. */
  runUntil(t: number) {
    let guard = 0
    while (this.queue.length && this.queue[0].t <= t && guard++ < 50000) {
      const ev = this.queue.shift()!
      this.time = ev.t
      this.arbitrate(ev)
      this.apply(ev.net, ev.v)
    }
    if (t > this.time) this.time = t
  }

  /** Number of changes on a net within the last `span` ns. */
  recentToggles(net: string, span: number): number {
    const h = this.history[net]
    let n = 0
    for (let i = h.length - 1; i > 0 && h[i][0] >= this.time - span; i--) n++
    return n
  }
}

export type CheckStatus = 'idle' | 'settling' | 'match' | 'mismatch' | 'undefined' | 'oscillating'

export interface CheckEntry {
  t: number
  inputs: string
  expected: ModelBit
  q: Bit
  qn: Bit
  status: 'match' | 'mismatch' | 'undefined' | 'oscillating'
}

/** One circuit: simulator plus the behavioural reference model it is checked against. */
export class Bench {
  sim: Simulator
  inputs: Record<string, Bit> = {}
  modelQ: ModelBit
  modelHistory: History
  risen: Record<string, number> = {}
  lastInputTime = -Infinity
  stamp = 0
  checkedStamp = 0
  log: CheckEntry[] = []
  passes = 0
  fails = 0
  status: CheckStatus = 'idle'

  constructor(
    public circuit: CircuitDef,
    delay: number,
  ) {
    this.sim = new Simulator(circuit, delay)
    for (const t of circuit.inputs) this.inputs[t.net] = circuit.init[t.net]
    this.modelQ = circuit.init[circuit.qNet]
    this.modelHistory = [[0, this.modelQ]]
  }

  hasInput(net: string) {
    return net in this.inputs
  }

  /** Apply several input changes that happen at the same instant. */
  applyInputs(changes: [string, Bit][]) {
    const prev = { ...this.inputs }
    let changed = false
    for (const [net, v] of changes) {
      if (!this.hasInput(net) || this.inputs[net] === v) continue
      changed = true
      this.inputs[net] = v
      if (v === 1 && prev[net] === 0) this.risen[net] = this.sim.time
      this.sim.setInput(net, v)
    }
    if (!changed) return
    const nq = this.circuit.next(this.inputs, prev, this.modelQ)
    if (nq !== this.modelQ) {
      this.modelQ = nq
      this.modelHistory.push([this.sim.time, nq])
    }
    this.lastInputTime = this.sim.time
    this.stamp++
    this.status = 'settling'
  }

  inputSummary(): string {
    return this.circuit.inputs.map((t) => `${t.label}=${this.inputs[t.net]}`).join(' ')
  }

  /** Compare the gate-level outputs with the reference model once things settle. */
  check() {
    if (this.stamp === this.checkedStamp) {
      if (this.status === 'oscillating' && this.sim.pending === 0) this.status = 'undefined'
      return
    }
    const sim = this.sim
    const q = sim.value(this.circuit.qNet)
    const qn = sim.value(this.circuit.qnNet)
    const idle = sim.pending === 0
    if (!idle) {
      const osc =
        sim.time - this.lastInputTime > 10 * sim.delay &&
        sim.recentToggles(this.circuit.qNet, 8 * sim.delay) >= 3
      if (osc) {
        this.status = 'oscillating'
        this.push({ status: 'oscillating', expected: 2, q, qn })
        this.checkedStamp = this.stamp
      } else {
        this.status = 'settling'
      }
      return
    }
    this.checkedStamp = this.stamp
    if (this.modelQ === 2) {
      this.status = 'undefined'
      this.push({ status: 'undefined', expected: 2, q, qn })
      return
    }
    const ok = q === this.modelQ && qn === (this.modelQ ? 0 : 1)
    this.status = ok ? 'match' : 'mismatch'
    if (ok) this.passes++
    else this.fails++
    this.push({ status: ok ? 'match' : 'mismatch', expected: this.modelQ, q, qn })
  }

  private push(e: Omit<CheckEntry, 't' | 'inputs'>) {
    this.log.unshift({ ...e, t: this.sim.time, inputs: this.inputSummary() })
    if (this.log.length > 40) this.log.pop()
  }
}
