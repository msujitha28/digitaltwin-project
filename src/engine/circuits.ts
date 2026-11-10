import type { Bit, CircuitDef, TableDef, GateDef, GateType, ModelBit, ScenarioEvent, TableRow, TraceDef, ViewDef, WireDef, DotDef } from './types'

type Inp = Record<string, Bit>

const gate = (id: string, type: GateType, x: number, y: number, inputs: string[], out: string): GateDef => ({
  id,
  type,
  x,
  y,
  inputs,
  out,
})

/**
 * Cross-coupled pair of 2-input gates. The top gate drives q, the bottom gate drives qn.
 * topIn feeds the top gate's first pin, botIn feeds the bottom gate's second pin.
 */
function core(
  prefix: string,
  ox: number,
  oy: number,
  type: GateType,
  topIn: string,
  botIn: string,
  q: string,
  qn: string,
  outWires = true,
  tx = ox + 130,
) {
  const gates = [
    gate(`${prefix}1`, type, ox, oy, [topIn, qn], q),
    gate(`${prefix}2`, type, ox, oy + 100, [q, botIn], qn),
  ]
  const wires: WireDef[] = [
    {
      net: q,
      pts: [
        [ox + 86, oy],
        [ox + 86, oy + 40],
        [ox - 22, oy + 40],
        [ox - 22, oy + 92],
        [ox, oy + 92],
      ],
    },
    {
      net: qn,
      pts: [
        [ox + 74, oy + 100],
        [ox + 74, oy + 56],
        [ox - 10, oy + 56],
        [ox - 10, oy + 8],
        [ox, oy + 8],
      ],
    },
  ]
  if (outWires) {
    wires.push({ net: q, pts: [[ox + 60, oy], [tx, oy]] })
    wires.push({ net: qn, pts: [[ox + 60, oy + 100], [tx, oy + 100]] })
  }
  const dots: DotDef[] = [
    { net: q, x: ox + 86, y: oy },
    { net: qn, x: ox + 74, y: oy + 100 },
  ]
  return { gates, wires, dots }
}

/* ------------------------------------------------------------------ */
/* Reference models (what the circuit is supposed to do)               */
/* ------------------------------------------------------------------ */

const srRule = (s: Bit, r: Bit, q: ModelBit): ModelBit => (s && r ? 2 : s ? 1 : r ? 0 : q)

const nextSrNor = (i: Inp, _p: Inp, q: ModelBit): ModelBit => srRule(i.S, i.R, q)
const nextSrNand = (i: Inp, _p: Inp, q: ModelBit): ModelBit => {
  const s = i.Sn ? 0 : 1
  const r = i.Rn ? 0 : 1
  return srRule(s as Bit, r as Bit, q)
}
const nextGatedSr = (i: Inp, _p: Inp, q: ModelBit): ModelBit => (i.EN ? srRule(i.S, i.R, q) : q)
const nextDLatch = (en: string) => (i: Inp, _p: Inp, q: ModelBit): ModelBit => (i[en] ? i.D : q)
const nextJk = (i: Inp, _p: Inp, q: ModelBit): ModelBit => {
  if (!i.CLK) return q
  if (i.J && i.K) return 2
  if (i.J) return 1
  if (i.K) return 0
  return q
}
const nextDff = (i: Inp, p: Inp, q: ModelBit): ModelBit => (p.CLK === 0 && i.CLK === 1 ? i.D : q)

/* ------------------------------------------------------------------ */
/* Scenario helpers                                                    */
/* ------------------------------------------------------------------ */

const ev = (t: number, net: string, v: Bit): ScenarioEvent => ({ t, net, v })

const dataPulses = (): ScenarioEvent[] => [
  ev(5, 'D', 1),
  ev(18, 'D', 0),
  ev(35, 'D', 1),
  ev(45, 'D', 0),
  ev(52, 'D', 1),
  ev(62, 'D', 0),
  ev(85, 'D', 1),
  ev(100, 'D', 0),
]

const clockPulses = (net: string): ScenarioEvent[] => [
  ev(10, net, 1),
  ev(30, net, 0),
  ev(50, net, 1),
  ev(70, net, 0),
  ev(90, net, 1),
  ev(110, net, 0),
]

const row = (cells: (string | number)[], match: TableRow['match']): TableRow => ({
  cells: cells.map(String),
  match,
})

/* ------------------------------------------------------------------ */
/* Circuits                                                            */
/* ------------------------------------------------------------------ */

const srNor: CircuitDef = (() => {
  const c = core('G', 300, 70, 'NOR', 'R', 'S', 'Q', 'QN')
  return {
    id: 'sr-nor',
    name: 'SR latch (NOR)',
    tag: 'Basic latch',
    blurb: 'Two cross-coupled NOR gates. S sets Q to 1, R resets it to 0, and S = R = 0 remembers the last value.',
    notes: [
      'Active-high inputs: a 1 on S forces Q = 1, a 1 on R forces Q = 0.',
      'S = R = 1 is forbidden. Both outputs fall to 0. Releasing both inputs together makes the next state unpredictable (metastable). The model settles it in favour of the faster gate, and the spec trace shows it as undefined until the next valid set or reset.',
    ],
    viewBox: [500, 220],
    inputs: [
      { net: 'R', label: 'R', x: 70, y: 62 },
      { net: 'S', label: 'S', x: 70, y: 178 },
    ],
    outputs: [
      { net: 'Q', label: 'Q', x: 430, y: 70 },
      { net: 'QN', label: 'Q′', x: 430, y: 170 },
    ],
    gates: c.gates,
    wires: [
      { net: 'R', pts: [[70, 62], [300, 62]] },
      { net: 'S', pts: [[70, 178], [300, 178]] },
      ...c.wires,
    ],
    dots: c.dots,
    init: { S: 0, R: 0, Q: 0, QN: 1 },
    next: nextSrNor,
    qNet: 'Q',
    qnNet: 'QN',
    columns: ['S', 'R', 'Q', 'Q′', 'State'],
    rows: [
      row([0, 0, 'Q', 'Q′', 'Memory'], (i) => !i.S && !i.R),
      row([0, 1, 0, 1, 'Reset'], (i) => !i.S && !!i.R),
      row([1, 0, 1, 0, 'Set'], (i) => !!i.S && !i.R),
      row([1, 1, 0, 0, 'Forbidden'], (i) => !!i.S && !!i.R),
    ],
    scenario: [
      ev(10, 'S', 1),
      ev(30, 'S', 0),
      ev(50, 'R', 1),
      ev(70, 'R', 0),
      ev(90, 'S', 1),
      ev(90, 'R', 1),
      ev(110, 'S', 0),
      ev(110, 'R', 0),
      ev(140, 'S', 1),
      ev(155, 'S', 0),
    ],
    scenarioLength: 175,
    scenarioCaption: 'Set, hold, reset, hold, then the forbidden S = R = 1 state and its release.',
  }
})()

const srNand: CircuitDef = (() => {
  const c = core('G', 300, 70, 'NAND', 'Sn', 'Rn', 'Q', 'QN')
  return {
    id: 'sr-nand',
    name: 'SR latch (NAND)',
    tag: 'Basic latch',
    blurb: 'Two cross-coupled NAND gates. The inputs are active low: pulling S′ to 0 sets Q, pulling R′ to 0 resets it.',
    notes: [
      'Idle state is S′ = R′ = 1, where the latch holds its value.',
      'S′ = R′ = 0 is forbidden. Both outputs go to 1, which is not a valid complementary pair, and releasing both together is unpredictable.',
    ],
    viewBox: [500, 220],
    inputs: [
      { net: 'Sn', label: 'S′', x: 70, y: 62 },
      { net: 'Rn', label: 'R′', x: 70, y: 178 },
    ],
    outputs: [
      { net: 'Q', label: 'Q', x: 430, y: 70 },
      { net: 'QN', label: 'Q′', x: 430, y: 170 },
    ],
    gates: c.gates,
    wires: [
      { net: 'Sn', pts: [[70, 62], [300, 62]] },
      { net: 'Rn', pts: [[70, 178], [300, 178]] },
      ...c.wires,
    ],
    dots: c.dots,
    init: { Sn: 1, Rn: 1, Q: 0, QN: 1 },
    next: nextSrNand,
    qNet: 'Q',
    qnNet: 'QN',
    columns: ['S′', 'R′', 'Q', 'Q′', 'State'],
    rows: [
      row([0, 0, 1, 1, 'Forbidden'], (i) => !i.Sn && !i.Rn),
      row([0, 1, 1, 0, 'Set'], (i) => !i.Sn && !!i.Rn),
      row([1, 0, 0, 1, 'Reset'], (i) => !!i.Sn && !i.Rn),
      row([1, 1, 'Q', 'Q′', 'Memory'], (i) => !!i.Sn && !!i.Rn),
    ],
    scenario: [
      ev(10, 'Sn', 0),
      ev(30, 'Sn', 1),
      ev(50, 'Rn', 0),
      ev(70, 'Rn', 1),
      ev(90, 'Sn', 0),
      ev(90, 'Rn', 0),
      ev(110, 'Sn', 1),
      ev(110, 'Rn', 1),
      ev(140, 'Sn', 0),
      ev(155, 'Sn', 1),
    ],
    scenarioLength: 175,
    scenarioCaption: 'Set, hold, reset, hold, then the forbidden S′ = R′ = 0 state and its release.',
  }
})()

const gatedSr: CircuitDef = (() => {
  const c = core('G', 360, 70, 'NAND', 'n1', 'n2', 'Q', 'QN')
  return {
    id: 'gated-sr',
    name: 'SR latch with enable',
    tag: 'Level sensitive',
    blurb: 'Two steering NAND gates in front of a NAND latch. S and R only reach the latch while Enable is 1.',
    notes: [
      'While En = 0 the latch ignores S and R. While En = 1 it is transparent and follows them.',
      'En = 1 with S = R = 1 is indeterminate. Dropping En in that state makes the stored value unpredictable, so the spec trace shows it as undefined.',
    ],
    viewBox: [560, 240],
    inputs: [
      { net: 'S', label: 'S', x: 70, y: 54 },
      { net: 'EN', label: 'En', x: 70, y: 120 },
      { net: 'R', label: 'R', x: 70, y: 186 },
    ],
    outputs: [
      { net: 'Q', label: 'Q', x: 490, y: 70 },
      { net: 'QN', label: 'Q′', x: 490, y: 170 },
    ],
    clock: 'EN',
    gates: [
      gate('N1', 'NAND', 230, 62, ['S', 'EN'], 'n1'),
      gate('N2', 'NAND', 230, 178, ['EN', 'R'], 'n2'),
      ...c.gates,
    ],
    wires: [
      { net: 'S', pts: [[70, 54], [230, 54]] },
      { net: 'R', pts: [[70, 186], [230, 186]] },
      { net: 'EN', pts: [[70, 120], [200, 120]] },
      { net: 'EN', pts: [[230, 70], [200, 70], [200, 170], [230, 170]] },
      { net: 'n1', pts: [[290, 62], [360, 62]] },
      { net: 'n2', pts: [[290, 178], [360, 178]] },
      ...c.wires,
    ],
    dots: [{ net: 'EN', x: 200, y: 120 }, ...c.dots],
    init: { S: 0, R: 0, EN: 0, n1: 1, n2: 1, Q: 0, QN: 1 },
    next: nextGatedSr,
    qNet: 'Q',
    qnNet: 'QN',
    columns: ['En', 'S', 'R', 'Next Q'],
    rows: [
      row(['0', 'X', 'X', 'No change'], (i) => !i.EN),
      row([1, 0, 0, 'No change'], (i) => !!i.EN && !i.S && !i.R),
      row([1, 0, 1, 'Q = 0 (reset)'], (i) => !!i.EN && !i.S && !!i.R),
      row([1, 1, 0, 'Q = 1 (set)'], (i) => !!i.EN && !!i.S && !i.R),
      row([1, 1, 1, 'Indeterminate'], (i) => !!i.EN && !!i.S && !!i.R),
    ],
    scenario: [
      ev(10, 'S', 1),
      ev(20, 'EN', 1),
      ev(40, 'EN', 0),
      ev(45, 'S', 0),
      ev(50, 'R', 1),
      ev(60, 'EN', 1),
      ev(80, 'EN', 0),
      ev(85, 'R', 0),
      ev(90, 'S', 1),
      ev(90, 'R', 1),
      ev(100, 'EN', 1),
      ev(120, 'EN', 0),
      ev(140, 'R', 0),
      ev(150, 'EN', 1),
      ev(170, 'EN', 0),
    ],
    scenarioLength: 190,
    scenarioCaption: 'S and R change while En is low (ignored), then En opens the latch. Ends with the S = R = 1 hazard.',
  }
})()

function dLatch(en: 'EN' | 'CLK'): CircuitDef {
  const label = en === 'EN' ? 'E' : 'CLK'
  const c = core('G', 360, 70, 'NAND', 'n1', 'n2', 'Q', 'QN')
  return {
    id: en === 'EN' ? 'd-latch' : 'd-latch-clk',
    name: 'D latch',
    tag: 'Level sensitive',
    blurb: 'A gated SR latch with an inverter, so S and R can never both be 1. Q follows D while Enable is 1 and holds it otherwise.',
    notes: [
      'Transparent while E = 1: any change on D passes straight to Q.',
      'Opaque while E = 0: Q holds the last value, however D moves.',
    ],
    viewBox: [560, 240],
    inputs: [
      { net: 'D', label: 'D', x: 70, y: 54 },
      { net: en, label, x: 70, y: 120 },
    ],
    outputs: [
      { net: 'Q', label: 'Q', x: 490, y: 70 },
      { net: 'QN', label: 'Q′', x: 490, y: 170 },
    ],
    clock: en,
    gates: [
      gate('N1', 'NAND', 230, 62, ['D', en], 'n1'),
      gate('N2', 'NAND', 230, 178, [en, 'DN'], 'n2'),
      gate('INV', 'NOT', 160, 186, ['D'], 'DN'),
      ...c.gates,
    ],
    wires: [
      { net: 'D', pts: [[70, 54], [230, 54]] },
      { net: 'D', pts: [[110, 54], [110, 186], [160, 186]] },
      { net: en, pts: [[70, 120], [190, 120]] },
      { net: en, pts: [[230, 70], [190, 70], [190, 170], [230, 170]] },
      { net: 'DN', pts: [[204, 186], [230, 186]] },
      { net: 'n1', pts: [[290, 62], [360, 62]] },
      { net: 'n2', pts: [[290, 178], [360, 178]] },
      ...c.wires,
    ],
    dots: [
      { net: 'D', x: 110, y: 54 },
      { net: en, x: 190, y: 120 },
      ...c.dots,
    ],
    init: { D: 0, [en]: 0, DN: 1, n1: 1, n2: 1, Q: 0, QN: 1 },
    next: nextDLatch(en),
    qNet: 'Q',
    qnNet: 'QN',
    columns: [label, 'D', 'Q next', 'Description'],
    rows: [
      row([0, 'X', 'Q', 'Memory (no change)'], (i) => !i[en]),
      row([1, 0, 0, 'Reset Q to 0'], (i) => !!i[en] && !i.D),
      row([1, 1, 1, 'Set Q to 1'], (i) => !!i[en] && !!i.D),
    ],
    scenario: [...dataPulses(), ...clockPulses(en)],
    scenarioLength: 140,
    scenarioCaption: 'D pulses arrive both while E is high (passed through) and low (ignored).',
  }
}

const jkLatch: CircuitDef = (() => {
  const c = core('G', 360, 70, 'NAND', 'n1', 'n2', 'Q', 'QN', false)
  return {
    id: 'jk-latch',
    name: 'JK latch',
    tag: 'Level sensitive',
    blurb: 'An SR latch whose steering gates also see Q and Q′, so J = K = 1 becomes a legal input that toggles the output.',
    notes: [
      'J = 1, K = 0 sets and J = 0, K = 1 resets while CLK is high.',
      'With J = K = 1 and CLK still high, the output keeps toggling every few gate delays. This is the race-around problem that edge-triggered flip-flops fix.',
    ],
    viewBox: [560, 240],
    inputs: [
      { net: 'J', label: 'J', x: 70, y: 74 },
      { net: 'CLK', label: 'CLK', x: 70, y: 120 },
      { net: 'K', label: 'K', x: 70, y: 166 },
    ],
    outputs: [
      { net: 'Q', label: 'Q', x: 490, y: 70 },
      { net: 'QN', label: 'Q′', x: 490, y: 170 },
    ],
    clock: 'CLK',
    gates: [
      gate('N1', 'NAND', 230, 62, ['QN', 'CLK', 'J'], 'n1'),
      gate('N2', 'NAND', 230, 178, ['K', 'CLK', 'Q'], 'n2'),
      ...c.gates,
    ],
    wires: [
      { net: 'J', pts: [[70, 74], [230, 74]] },
      { net: 'K', pts: [[70, 166], [230, 166]] },
      { net: 'CLK', pts: [[70, 120], [190, 120]] },
      { net: 'CLK', pts: [[230, 62], [190, 62], [190, 178], [230, 178]] },
      { net: 'n1', pts: [[290, 62], [360, 62]] },
      { net: 'n2', pts: [[290, 178], [360, 178]] },
      { net: 'Q', pts: [[420, 70], [490, 70]] },
      { net: 'QN', pts: [[420, 170], [490, 170]] },
      // outer feedback: QN back to the top gate, Q back to the bottom gate
      {
        net: 'QN',
        pts: [[458, 170], [458, 22], [214, 22], [214, 50], [230, 50]],
      },
      {
        net: 'Q',
        pts: [[470, 70], [470, 218], [214, 218], [214, 190], [230, 190]],
      },
      ...c.wires,
    ],
    dots: [
      { net: 'CLK', x: 190, y: 120 },
      { net: 'Q', x: 470, y: 70 },
      { net: 'QN', x: 458, y: 170 },
      ...c.dots,
    ],
    init: { J: 0, K: 0, CLK: 0, n1: 1, n2: 1, Q: 0, QN: 1 },
    next: nextJk,
    qNet: 'Q',
    qnNet: 'QN',
    columns: ['CLK', 'J', 'K', 'Next Q', 'Note'],
    rows: [
      row([0, 'X', 'X', 'Q', 'Retain'], (i) => !i.CLK),
      row([1, 0, 0, 'Q', 'Retain'], (i) => !!i.CLK && !i.J && !i.K),
      row([1, 0, 1, 0, 'Reset'], (i) => !!i.CLK && !i.J && !!i.K),
      row([1, 1, 0, 1, 'Set'], (i) => !!i.CLK && !!i.J && !i.K),
      row([1, 1, 1, 'Q′ …', 'Toggle / race-around'], (i) => !!i.CLK && !!i.J && !!i.K),
    ],
    scenario: [
      ev(5, 'J', 1),
      ev(10, 'CLK', 1),
      ev(25, 'CLK', 0),
      ev(30, 'J', 0),
      ev(30, 'K', 1),
      ev(40, 'CLK', 1),
      ev(55, 'CLK', 0),
      ev(60, 'J', 1),
      ev(70, 'CLK', 1),
      ev(100, 'CLK', 0),
      ev(110, 'J', 0),
      ev(120, 'CLK', 1),
      ev(135, 'CLK', 0),
    ],
    scenarioLength: 150,
    scenarioCaption: 'Set, reset, then J = K = 1 with CLK held high for 30 ns to show race-around.',
  }
})()

type Pt = [number, number]

/** Master-slave D flip-flop, shifted right by dx. `d` is the net feeding its D pin. */
function msBody(dx: number, d: string) {
  const dn = `${d}N`
  const P = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [x + dx, y])
  const m = core('M', 300 + dx, 80, 'NAND', 'm1', 'm2', 'QM', 'QMN', false)
  const s = core('S', 800 + dx, 80, 'NAND', 's1', 's2', 'Q', 'QN')
  const gates: GateDef[] = [
    gate('INV1', 'NOT', 96 + dx, 240, ['CLK'], 'CN'),
    gate('INV2', 'NOT', 96 + dx, 196, [d], dn),
    gate('M1', 'NAND', 170 + dx, 72, [d, 'CN'], 'm1'),
    gate('M2', 'NAND', 170 + dx, 188, ['CN', dn], 'm2'),
    ...m.gates,
    gate('S1', 'NAND', 670 + dx, 72, ['QM', 'CLK'], 's1'),
    gate('S2', 'NAND', 670 + dx, 188, ['CLK', 'QMN'], 's2'),
    ...s.gates,
  ]
  const wires: WireDef[] = [
    { net: d, pts: P([[70, 64], [170, 64]]) },
    { net: d, pts: P([[82, 64], [82, 196], [96, 196]]) },
    { net: dn, pts: P([[140, 196], [170, 196]]) },
    { net: 'CLK', pts: [[70, 240], [96 + dx, 240]] },
    { net: 'CLK', pts: [[80, 240], [80, 296], [650 + dx, 296], [650 + dx, 80], [670 + dx, 80]] },
    { net: 'CLK', pts: P([[650, 180], [670, 180]]) },
    { net: 'CN', pts: P([[140, 240], [150, 240], [150, 80], [170, 80]]) },
    { net: 'CN', pts: P([[150, 180], [170, 180]]) },
    { net: 'm1', pts: P([[230, 72], [300, 72]]) },
    { net: 'm2', pts: P([[230, 188], [300, 188]]) },
    { net: 'QM', pts: P([[360, 80], [430, 80], [430, 64], [670, 64]]) },
    { net: 'QMN', pts: P([[360, 180], [442, 180], [442, 196], [670, 196]]) },
    { net: 's1', pts: P([[730, 72], [800, 72]]) },
    { net: 's2', pts: P([[730, 188], [800, 188]]) },
    ...m.wires,
    ...s.wires,
  ]
  const dots: DotDef[] = [
    { net: d, x: 82 + dx, y: 64 },
    { net: 'CLK', x: 80, y: 240 },
    { net: 'CLK', x: 650 + dx, y: 180 },
    { net: 'CN', x: 150 + dx, y: 180 },
    ...m.dots,
    ...s.dots,
  ]
  const boxes = [
    { x: 144 + dx, y: 30, w: 316, h: 214, label: 'MASTER · open while CLK = 0' },
    { x: 644 + dx, y: 30, w: 226, h: 214, label: 'SLAVE · open while CLK = 1' },
  ]
  const init: Record<string, Bit> = {
    CLK: 0, CN: 1, [d]: 0, [dn]: 1, m1: 1, m2: 0, QM: 0, QMN: 1, s1: 1, s2: 1, Q: 0, QN: 1,
  }
  return { gates, wires, dots, boxes, init }
}

/** Table whose rows never highlight (reference tables such as excitation tables). */
const tbl = (title: string, columns: string[], data: (string | number)[][]): TableDef => ({
  title,
  columns,
  rows: data.map((cells) => row(cells, () => false)),
})

const dff: CircuitDef = (() => {
  const b = msBody(0, 'D')
  return {
    id: 'd-flip-flop',
    name: 'D flip-flop (positive edge)',
    tag: 'Edge triggered',
    blurb: 'Two D latches in series. The master is open while CLK is 0 and the slave is open while CLK is 1, so Q only changes on the rising edge.',
    notes: [
      'On the rising edge the master closes and holds D, then the slave opens and passes that held value to Q.',
      'D changes while CLK is high or low have no effect on Q until the next rising edge.',
    ],
    viewBox: [990, 320],
    inputs: [
      { net: 'D', label: 'D', x: 70, y: 64 },
      { net: 'CLK', label: 'CLK', x: 70, y: 240 },
    ],
    outputs: [
      { net: 'Q', label: 'Q', x: 930, y: 80 },
      { net: 'QN', label: 'Q′', x: 930, y: 180 },
    ],
    clock: 'CLK',
    boxes: b.boxes,
    gates: b.gates,
    wires: b.wires,
    dots: b.dots,
    init: b.init,
    next: nextDff,
    qNet: 'Q',
    qnNet: 'QN',
    columns: ['CLK', 'D', 'Q next'],
    rows: [
      row(['↑', 0, 0], (i, r) => !!r.CLK && !i.D),
      row(['↑', 1, 1], (i, r) => !!r.CLK && !!i.D),
      row(['no ↑', 'X', 'Q (hold)'], (_i, r) => !r.CLK),
    ],
    tableTitle: 'Truth table',
    equation: 'Q(n+1) = D',
    extraTables: [
      tbl('Characteristic table', ['D', 'Qn', 'Qn+1'], [[0, 0, 0], [0, 1, 0], [1, 0, 1], [1, 1, 1]]),
      tbl('Excitation table', ['Qn', 'Qn+1', 'D'], [[0, 0, 0], [0, 1, 1], [1, 0, 0], [1, 1, 1]]),
    ],
    scenario: [...dataPulses(), ...clockPulses('CLK')],
    scenarioLength: 140,
    scenarioCaption: 'Q samples D only at the three rising edges (10, 50 and 90 ns).',
  }
})()

/* ---- Clocked SR, JK, D and T flip-flops, drawn as in the course slides (4 NAND gates) ---- */

const rising = (i: Inp, p: Inp) => p.CLK === 0 && i.CLK === 1
const toggle = (q: ModelBit): ModelBit => (q === 2 ? 2 : q ? 0 : 1)
const nextSrClk = (i: Inp, _p: Inp, q: ModelBit): ModelBit => (i.CLK ? srRule(i.S, i.R, q) : q)
const nextJkClk = (i: Inp, p: Inp, q: ModelBit): ModelBit => {
  if (!i.CLK) return q
  if (i.J && i.K) return rising(i, p) ? toggle(q) : q
  return i.J ? 1 : i.K ? 0 : q
}
const nextTClk = (i: Inp, p: Inp, q: ModelBit): ModelBit => (i.CLK && i.T ? (rising(i, p) ? toggle(q) : q) : q)

/** Copy of a circuit with one net renamed (structure only; behaviour is supplied by the caller). */
function rename(c: CircuitDef, from: string, to: string): CircuitDef {
  const n = (x: string) => (x === from ? to : x)
  return {
    ...c,
    gates: c.gates.map((g) => ({ ...g, inputs: g.inputs.map(n), out: n(g.out) })),
    wires: c.wires.map((w) => ({ ...w, net: n(w.net) })),
    dots: c.dots.map((d) => ({ ...d, net: n(d.net) })),
    inputs: c.inputs.map((t) => (t.net === from ? { ...t, net: to, label: to } : t)),
    clock: c.clock ? n(c.clock) : c.clock,
    init: Object.fromEntries(Object.entries(c.init).map(([k, v]) => [n(k), v])) as CircuitDef['init'],
  }
}

/** Narrow clock pulses (3 ns) at 10, 30, 50 ... so J = K = 1 or T = 1 toggles Q only once per pulse. */
const narrow = (n: number, start = 10, step = 20): ScenarioEvent[] =>
  Array.from({ length: n }, (_, k) => [ev(start + step * k, 'CLK', 1), ev(start + step * k + 3, 'CLK', 0)]).flat()

const srClocked: CircuitDef = {
  ...rename(gatedSr, 'EN', 'CLK'),
  id: 'sr-ff',
  name: 'SR flip-flop',
  tag: 'Clocked',
  blurb:
    'A clocked SET-RESET flip-flop: two steering NAND gates in front of a cross-coupled NAND pair. S sets Q, R resets it and S = R = 0 holds the value.',
  notes: [
    'S and R only reach the latch while CLK = 1, so the output can change only during a clock pulse.',
    'S = R = 1 is invalid: both steering outputs go low, and when CLK falls the stored value is unpredictable.',
  ],
  next: nextSrClk,
  columns: ['S', 'R', 'Q next', 'State'],
  rows: [
    row([0, 0, 'Qn', 'Hold'], (i) => !i.S && !i.R),
    row([0, 1, 0, 'Reset'], (i) => !i.S && !!i.R),
    row([1, 0, 1, 'Set'], (i) => !!i.S && !i.R),
    row([1, 1, 'X', 'Invalid'], (i) => !!i.S && !!i.R),
  ],
  tableTitle: 'Truth table (while CLK = 1)',
  equation: 'Q(n+1) = S + R′·Qn   (with S·R = 0)',
  extraTables: [
    tbl('Characteristic table', ['S', 'R', 'Qn', 'Qn+1'], [
      [0, 0, 0, 0], [0, 0, 1, 1], [0, 1, 0, 0], [0, 1, 1, 0],
      [1, 0, 0, 1], [1, 0, 1, 1], [1, 1, 0, 'Invalid'], [1, 1, 1, 'Invalid'],
    ]),
    tbl('Excitation table', ['Qn', 'Qn+1', 'S', 'R'], [[0, 0, 0, 'X'], [0, 1, 1, 0], [1, 0, 0, 1], [1, 1, 'X', 0]]),
  ],
  scenario: [
    ev(10, 'S', 1),
    ev(20, 'CLK', 1),
    ev(40, 'CLK', 0),
    ev(45, 'S', 0),
    ev(50, 'R', 1),
    ev(60, 'CLK', 1),
    ev(80, 'CLK', 0),
    ev(85, 'R', 0),
    ev(90, 'S', 1),
    ev(90, 'R', 1),
    ev(100, 'CLK', 1),
    ev(120, 'CLK', 0),
    ev(140, 'R', 0),
    ev(150, 'CLK', 1),
    ev(170, 'CLK', 0),
  ],
  scenarioLength: 190,
  scenarioCaption: 'S and R change while CLK is low (ignored), then each clock pulse sets or resets Q. Ends with the invalid S = R = 1.',
}

const jkClocked: CircuitDef = {
  ...jkLatch,
  id: 'jk-ff',
  name: 'JK flip-flop',
  tag: 'Clocked',
  blurb:
    'The SR flip-flop with Q and Q′ fed back to the steering gates, so J = K = 1 is legal and toggles Q. J sets, K resets, J = K = 0 holds.',
  notes: [
    'Each steering gate is a 3-input NAND: top (Q′, CLK, J), bottom (K, CLK, Q).',
    'With J = K = 1 Q toggles once if the clock pulse is shorter than the gate loop. If CLK stays high the output keeps toggling (race-around), which the checker reports as oscillating. The demo uses 3 ns pulses at a 2 ns gate delay.',
  ],
  next: nextJkClk,
  columns: ['J', 'K', 'Q next', 'State'],
  rows: [
    row([0, 0, 'Qn', 'Hold'], (i) => !i.J && !i.K),
    row([0, 1, 0, 'Reset'], (i) => !i.J && !!i.K),
    row([1, 0, 1, 'Set'], (i) => !!i.J && !i.K),
    row([1, 1, 'Qn′', 'Toggle'], (i) => !!i.J && !!i.K),
  ],
  tableTitle: 'Truth table',
  equation: 'Q(n+1) = J·Qn′ + K′·Qn',
  extraTables: [
    tbl('Characteristic table', ['J', 'K', 'Qn', 'Qn+1'], [
      [0, 0, 0, 0], [0, 0, 1, 1], [0, 1, 0, 0], [0, 1, 1, 0],
      [1, 0, 0, 1], [1, 0, 1, 1], [1, 1, 0, 1], [1, 1, 1, 0],
    ]),
    tbl('Excitation table', ['Qn', 'Qn+1', 'J', 'K'], [[0, 0, 0, 'X'], [0, 1, 1, 'X'], [1, 0, 'X', 1], [1, 1, 'X', 0]]),
  ],
  scenario: [
    ev(5, 'J', 1),
    ev(25, 'J', 0),
    ev(25, 'K', 1),
    ev(45, 'J', 1),
    ev(105, 'J', 0),
    ev(105, 'K', 0),
    ...narrow(7),
  ],
  scenarioLength: 150,
  scenarioCaption: 'Set, reset, three toggles with J = K = 1, then hold. Each clock pulse is only 3 ns wide.',
}

const dClocked: CircuitDef = {
  ...dLatch('CLK'),
  id: 'd-ff',
  name: 'D flip-flop',
  tag: 'Clocked',
  blurb:
    'Two steering NAND gates and a cross-coupled NAND pair, with an inverter so S and R are always opposite. Q takes the value of D.',
  notes: [
    'CLK = 0: no change. CLK = 1 and D = 0: reset. CLK = 1 and D = 1: set.',
    'This gate arrangement is transparent while CLK is high. For a flip-flop that samples only on the edge, see the master-slave version in the Latch vs flip-flop comparison.',
  ],
  columns: ['CLK', 'D', 'Q next', 'State'],
  rows: [
    row([0, 'X', 'Qn', 'No change'], (i) => !i.CLK),
    row([1, 0, 0, 'Reset'], (i) => !!i.CLK && !i.D),
    row([1, 1, 1, 'Set'], (i) => !!i.CLK && !!i.D),
  ],
  tableTitle: 'Function table',
  equation: 'Q(n+1) = D',
  extraTables: [
    tbl('Characteristic table', ['D', 'Qn', 'Qn+1'], [[0, 0, 0], [0, 1, 0], [1, 0, 1], [1, 1, 1]]),
    tbl('Excitation table', ['Qn', 'Qn+1', 'D'], [[0, 0, 0], [0, 1, 1], [1, 0, 0], [1, 1, 1]]),
  ],
}

const tClocked: CircuitDef = (() => {
  const c = jkLatch
  return {
    ...c,
    id: 't-ff',
    name: 'T flip-flop',
    tag: 'Clocked',
    blurb: 'A JK flip-flop with J and K tied together as T. T = 0 holds Q and T = 1 toggles it.',
    notes: [
      'Both steering NANDs see T: top (Q′, CLK, T), bottom (T, CLK, Q).',
      'Like the JK flip-flop it needs a clock pulse shorter than the gate loop (3 ns here at a 2 ns gate delay), otherwise Q keeps toggling while CLK is high.',
    ],
    inputs: [
      { net: 'T', label: 'T', x: 70, y: 96 },
      { net: 'CLK', label: 'CLK', x: 70, y: 144 },
    ],
    gates: [
      gate('N1', 'NAND', 230, 62, ['QN', 'CLK', 'T'], 'n1'),
      gate('N2', 'NAND', 230, 178, ['T', 'CLK', 'Q'], 'n2'),
      ...c.gates.slice(2),
    ],
    wires: [
      { net: 'T', pts: [[70, 96], [150, 96]] },
      { net: 'T', pts: [[230, 74], [150, 74], [150, 166], [230, 166]] },
      { net: 'CLK', pts: [[70, 144], [190, 144]] },
      { net: 'CLK', pts: [[230, 62], [190, 62], [190, 178], [230, 178]] },
      ...c.wires.filter((w) => !['J', 'K', 'CLK'].includes(w.net)),
    ],
    dots: [{ net: 'T', x: 150, y: 96 }, { net: 'CLK', x: 190, y: 144 }, ...c.dots.filter((d) => d.net !== 'CLK')],
    init: { T: 0, CLK: 0, n1: 1, n2: 1, Q: 0, QN: 1 },
    next: nextTClk,
    columns: ['T', 'Q next', 'State'],
    rows: [
      row([0, 'Qn', 'No change'], (i) => !i.T),
      row([1, 'Qn′', 'Toggle'], (i) => !!i.T),
    ],
    tableTitle: 'Truth table',
    equation: 'Q(n+1) = T·Qn′ + T′·Qn',
    extraTables: [
      tbl('Characteristic table', ['T', 'Qn', 'Qn+1'], [[0, 0, 0], [0, 1, 1], [1, 0, 1], [1, 1, 0]]),
      tbl('Excitation table', ['Qn', 'Qn+1', 'T'], [[0, 0, 0], [0, 1, 1], [1, 0, 1], [1, 1, 0]]),
    ],
    scenario: [ev(5, 'T', 1), ev(65, 'T', 0), ev(85, 'T', 1), ...narrow(5)],
    scenarioLength: 120,
    scenarioCaption: 'T = 1 toggles Q on each of three 3 ns clock pulses, T = 0 holds, then T = 1 toggles again.',
  }
})()

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

function singleTraces(c: CircuitDef): TraceDef[] {
  const t: TraceDef[] = c.inputs.map((i) => ({
    label: i.label,
    bench: 0,
    net: i.net,
    kind: i.net === c.clock ? 'clk' : 'in',
  }))
  t.push({ label: 'Q', bench: 0, net: c.qNet, kind: 'out' })
  t.push({ label: 'Q′', bench: 0, net: c.qnNet, kind: 'out' })
  t.push({ label: 'Q (spec)', bench: 0, net: '__model', kind: 'ref' })
  return t
}

function single(c: CircuitDef): ViewDef {
  return {
    id: c.id,
    name: c.name,
    tag: c.tag,
    blurb: c.blurb,
    notes: c.notes,
    circuits: [c],
    traces: singleTraces(c),
    clock: c.clock,
    scenario: c.scenario,
    scenarioLength: c.scenarioLength,
    scenarioCaption: c.scenarioCaption,
    columns: c.columns,
    rows: c.rows,
    tableTitle: c.tableTitle,
    equation: c.equation,
    extraTables: c.extraTables,
  }
}

const latchForCompare = dLatch('CLK')

const compare: ViewDef = {
  id: 'compare',
  name: 'Latch vs flip-flop',
  tag: 'Comparison',
  blurb: 'The same D and CLK drive a level-sensitive D latch and a positive-edge flip-flop, so you can see exactly where they differ.',
  notes: [
    'The latch follows D for the whole time CLK is high, so a narrow pulse on D shows up on Q.',
    'The flip-flop samples D once, at the rising edge, and ignores everything else.',
  ],
  circuits: [latchForCompare, dff],
  traces: [
    { label: 'D', bench: 0, net: 'D', kind: 'in' },
    { label: 'CLK', bench: 0, net: 'CLK', kind: 'clk' },
    { label: 'Q latch', bench: 0, net: 'Q', kind: 'out' },
    { label: 'Q flip-flop', bench: 1, net: 'Q', kind: 'out' },
  ],
  clock: 'CLK',
  scenario: [...dataPulses(), ...clockPulses('CLK')],
  scenarioLength: 140,
  scenarioCaption: 'The D pulse at 5–18 ns spans the first edge. The latch passes the short pulse, the flip-flop captures a 1 and holds it.',
  columns: ['Element', 'Q changes when', 'D during that time'],
  rows: [
    row(['D latch', 'CLK = 1 (level)', 'Passed through'], (i) => !!i.CLK),
    row(['D flip-flop', 'CLK rises (edge)', 'Sampled once'], (_i, r) => !!r.CLK),
  ],
}

export const VIEWS: ViewDef[] = [
  single(srNor),
  single(srNand),
  single(gatedSr),
  single(dLatch('EN')),
  single(jkLatch),
  single(dff),
  single(srClocked),
  single(jkClocked),
  single(dClocked),
  single(tClocked),
  compare,
]
