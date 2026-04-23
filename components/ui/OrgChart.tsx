'use client'
// components/ui/OrgChart.tsx
// Org chart rendered as a pure SVG with straight horizontal + vertical lines only.
// No curves, no diagonals. Classic "bus" connector style:
//   parent → vertical drop → horizontal bus → vertical drops → children

import type { OrgNode } from '@/types'

// ─────────────────────────────────────────────
// Layout constants
// ─────────────────────────────────────────────
const CARD_W   = 160
const CARD_H   = 84
const H_GAP    = 24
const V_GAP    = 56
const CONN_CLR = '#94a3b8'
const CONN_W   = 1.5

// ─────────────────────────────────────────────
// Measure minimum width a subtree needs
// ─────────────────────────────────────────────
function subtreeWidth(node: OrgNode): number {
  if (!node.children || node.children.length === 0) return CARD_W
  const childrenW =
    node.children.reduce((sum, c) => sum + subtreeWidth(c), 0) +
    H_GAP * (node.children.length - 1)
  return Math.max(CARD_W, childrenW)
}

// ─────────────────────────────────────────────
// Measure total height of the deepest branch
// ─────────────────────────────────────────────
function subtreeHeight(node: OrgNode): number {
  if (!node.children || node.children.length === 0) return CARD_H
  return CARD_H + V_GAP + Math.max(...node.children.map(subtreeHeight))
}

// ─────────────────────────────────────────────
// Recursively build SVG elements
// x = left edge of this subtree's allocated column
// y = top edge of this level's cards
// ─────────────────────────────────────────────
function buildTree(
  node: OrgNode,
  x: number,
  y: number,
  key = '0'
): React.ReactNode[] {
  const els: React.ReactNode[] = []
  const sw    = subtreeWidth(node)
  const cx    = x + sw / 2
  const cardX = cx - CARD_W / 2

  // Card shell
  els.push(
    <rect
      key={`rect-${key}`}
      x={cardX} y={y}
      width={CARD_W} height={CARD_H}
      rx={10}
      fill={node.color + '18'}
      stroke={node.color}
      strokeWidth={1.5}
    />
  )

  // Avatar circle
  els.push(
    <circle
      key={`circle-${key}`}
      cx={cardX + 28} cy={y + CARD_H / 2}
      r={18}
      fill={node.color}
    />
  )

  // Avatar initials
  els.push(
    <text
      key={`init-${key}`}
      x={cardX + 28} y={y + CARD_H / 2}
      textAnchor="middle" dominantBaseline="central"
      fill="#fff" fontSize={12} fontWeight={700}
    >
      {node.initials}
    </text>
  )

  // Rank label
  els.push(
    <text
      key={`rank-${key}`}
      x={cardX + 54} y={y + 17}
      textAnchor="start" dominantBaseline="central"
      fill={node.color} fontSize={10} fontWeight={500} opacity={0.8}
    >
      {node.rank}
    </text>
  )

  // Name label
  els.push(
    <text
      key={`name-${key}`}
      x={cardX + 54} y={y + 35}
      textAnchor="start" dominantBaseline="central"
      fill={node.color} fontSize={12} fontWeight={700}
    >
      {node.name.length > 16 ? node.name.slice(0, 15) + '\u2026' : node.name}
    </text>
  )

  // Title label
  els.push(
    <text
      key={`title-${key}`}
      x={cardX + 54} y={y + 48}
      textAnchor="start" dominantBaseline="central"
      fill="#64748b" fontSize={10} fontWeight={400}
    >
      {node.title.length > 18 ? node.title.slice(0, 17) + '\u2026' : node.title}
    </text>
  )

  // Contact label
  if (node.contactNo) {
    els.push(
      <text
        key={`contact-${key}`}
        x={cardX + 54} y={y + 64}
        textAnchor="start" dominantBaseline="central"
        fill="#475569" fontSize={10} fontWeight={500}
      >
        {node.contactNo.length > 18 ? node.contactNo.slice(0, 17) + '\u2026' : node.contactNo}
      </text>
    )
  }

  // ── Connectors + children ────────────────────
  if (node.children && node.children.length > 0) {
    const parentBottom = y + CARD_H
    const busY         = y + CARD_H + V_GAP / 2
    const childTopY    = y + CARD_H + V_GAP

    // Vertical drop from card bottom to bus
    els.push(
      <line
        key={`vdown-${key}`}
        x1={cx} y1={parentBottom}
        x2={cx} y2={busY}
        stroke={CONN_CLR} strokeWidth={CONN_W}
      />
    )

    // Compute child centre x positions
    const childCentres: number[] = []
    let childX = x
    for (const child of node.children) {
      const csw = subtreeWidth(child)
      childCentres.push(childX + csw / 2)
      childX += csw + H_GAP
    }

    // Horizontal bus spanning all children
    if (childCentres.length > 1) {
      els.push(
        <line
          key={`bus-${key}`}
          x1={childCentres[0]} y1={busY}
          x2={childCentres[childCentres.length - 1]} y2={busY}
          stroke={CONN_CLR} strokeWidth={CONN_W}
        />
      )
    }

    // Vertical drops from bus to each child
    childCentres.forEach((ccx, i) => {
      els.push(
        <line
          key={`vchild-${key}-${i}`}
          x1={ccx} y1={busY}
          x2={ccx} y2={childTopY}
          stroke={CONN_CLR} strokeWidth={CONN_W}
        />
      )
    })

    // Recurse
    childX = x
    node.children.forEach((child, i) => {
      const csw = subtreeWidth(child)
      els.push(...buildTree(child, childX, childTopY, `${key}-${i}`))
      childX += csw + H_GAP
    })
  }

  return els
}

// ─────────────────────────────────────────────
// Exported component
// ─────────────────────────────────────────────
export function OrgChart({ root }: { root: OrgNode }) {
  const PAD_X = 40
  const PAD_Y = 32

  const totalW = subtreeWidth(root)
  const totalH = subtreeHeight(root)
  const svgW   = totalW + PAD_X * 2
  const svgH   = totalH + PAD_Y * 2

  const elements = buildTree(root, PAD_X, PAD_Y)

  return (
    <div className="overflow-x-auto w-full p-6">
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        width={svgW}
        height={svgH}
        style={{ display: 'block', maxWidth: '100%' }}
      >
        {elements}
      </svg>
    </div>
  )
}