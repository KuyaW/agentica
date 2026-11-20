/**
 * Four-way tidy-tree layout for the workspace and canvas branching screen.
 *
 * The root card sits in the middle and deals its children across its right,
 * bottom, left and top sides. Every deeper card grows its children out of the
 * side it inherited, so an unfolded workspace branches outwards instead of
 * stacking into one long column. A parent's band is the centre of its visible
 * subtree, so unfolding a workspace pushes its siblings apart rather than
 * overlapping them. Card-rich branches arrange their children in a grid so a
 * workspace with many canvases stays readable.
 *
 * Geometry follows the file explorer's canvas: 236 x 64 cards and the same
 * gaps, so the threads between cards bend exactly the same way.
 */

export type Direction = "right" | "left" | "up" | "down";

export interface Point {
  x: number;
  y: number;
}

/** Card size in world units; the edge geometry depends on it. */
export const NODE_W = 236;
export const NODE_H = 64;

/** Gap between a parent and a horizontally-growing child block. */
const GAP_X = 104;
/** Gap between siblings inside a horizontally-growing block. */
const GAP_Y = 14;
/** Gap between a parent and a vertically-growing child block. */
const GAP_ALONG_V = 64;
/** Gap between siblings inside a vertically-growing block. */
const GAP_ACROSS_V = 20;

/** Cards with more children than this lay their children out as a grid. */
const GRID_THRESHOLD = 6;
/** Columns used by a grid block. */
const GRID_COLS = 3;

const DIRECTION_ORDER: Direction[] = ["right", "down", "left", "up"];

const isHorizontal = (direction: Direction) =>
  direction === "right" || direction === "left";
const gapAlong = (direction: Direction) =>
  isHorizontal(direction) ? GAP_X : GAP_ALONG_V;
const gapAcross = (direction: Direction) =>
  isHorizontal(direction) ? GAP_Y : GAP_ACROSS_V;
const growsForward = (direction: Direction) =>
  direction === "right" || direction === "down";

/** One card in the tree: a workspace, a canvas, or the root. */
export interface BranchNode {
  id: string;
  children: string[];
}

export interface LaidOutNode {
  id: string;
  pos: Point;
  depth: number;
  parentId: string | null;
  direction: Direction;
}

interface Extent {
  along: number;
  across: number;
}

interface ChildBlock {
  cols: number;
  rows: number;
  colWidths: number[];
  rowHeights: number[];
  along: number;
  across: number;
}

/**
 * Lay out one root, with the cards underneath it unfolded when they are in
 * `expanded`. The root stays at the origin.
 */
export function layoutBranch(
  nodes: Map<string, BranchNode>,
  rootId: string,
  expanded: Set<string>,
): Map<string, LaidOutNode> {
  const positions = new Map<string, LaidOutNode>();
  const rootNode = nodes.get(rootId);
  if (!rootNode) return positions;

  const metricCache = new Map<string, Extent>();

  const childrenOf = (node: BranchNode): string[] =>
    expanded.has(node.id) ? node.children.filter((id) => nodes.has(id)) : [];

  function laidOut(
    node: BranchNode,
    direction: Direction,
    x: number,
    y: number,
    depth: number,
    parentId: string | null,
  ): LaidOutNode {
    return { id: node.id, pos: { x, y }, depth, parentId, direction };
  }

  /**
   * Deal the root's children to its four sides in listing order, so each side
   * carries the same number of branches. No side is left empty while children
   * remain.
   */
  function dealSides(children: string[]): Map<Direction, string[]> {
    const buckets = new Map<Direction, string[]>();
    const used = Math.min(DIRECTION_ORDER.length, children.length);
    const base = used > 0 ? Math.floor(children.length / used) : 0;
    const extra = used > 0 ? children.length % used : 0;
    let index = 0;
    for (let side = 0; side < used; side += 1) {
      const count = base + (side < extra ? 1 : 0);
      buckets.set(DIRECTION_ORDER[side]!, children.slice(index, index + count));
      index += count;
    }
    return buckets;
  }

  function blockMetrics(
    children: string[],
    direction: Direction,
  ): ChildBlock | null {
    if (children.length === 0) return null;

    const cols = children.length > GRID_THRESHOLD ? GRID_COLS : 1;
    const rows = Math.ceil(children.length / cols);
    const colWidths = Array.from({ length: cols }, () => 0);
    const rowHeights = Array.from({ length: rows }, () => 0);

    children.forEach((id, index) => {
      const node = nodes.get(id);
      if (!node) return;
      const metrics = subtreeMetrics(node, direction);
      const row = Math.floor(index / cols);
      const col = index % cols;
      colWidths[col] = Math.max(colWidths[col] ?? 0, metrics.along);
      rowHeights[row] = Math.max(rowHeights[row] ?? 0, metrics.across);
    });

    return {
      cols,
      rows,
      colWidths,
      rowHeights,
      along:
        colWidths.reduce((sum, width) => sum + width, 0) +
        gapAlong(direction) * (cols - 1),
      across:
        rowHeights.reduce((sum, height) => sum + height, 0) +
        gapAcross(direction) * (rows - 1),
    };
  }

  function subtreeMetrics(node: BranchNode, direction: Direction): Extent {
    const key = `${direction}:${node.id}`;
    const cached = metricCache.get(key);
    if (cached) return cached;

    let leftW = 0;
    let rightW = 0;
    let upH = 0;
    let downH = 0;
    let acrossV = NODE_H;
    let acrossH = NODE_W;
    const children = childrenOf(node);

    const block = blockMetrics(children, direction);
    if (block) {
      switch (direction) {
        case "left":
          leftW = GAP_X + block.along;
          acrossV = Math.max(acrossV, block.across);
          break;
        case "up":
          upH = GAP_ALONG_V + block.along;
          acrossH = Math.max(acrossH, block.across);
          break;
        case "down":
          downH = GAP_ALONG_V + block.along;
          acrossH = Math.max(acrossH, block.across);
          break;
        default:
          rightW = GAP_X + block.along;
          acrossV = Math.max(acrossV, block.across);
      }
    }

    const width = Math.max(acrossH, leftW + NODE_W + rightW);
    const height = Math.max(acrossV, upH + NODE_H + downH);
    const metrics: Extent = isHorizontal(direction)
      ? { along: width, across: height }
      : { along: height, across: width };

    metricCache.set(key, metrics);
    return metrics;
  }

  function boxPosition(
    direction: Direction,
    near: number,
    acrossCenter: number,
    w: number,
    h: number,
  ): Point {
    switch (direction) {
      case "left":
        return { x: near - w, y: acrossCenter - h / 2 };
      case "up":
        return { x: acrossCenter - w / 2, y: near - h };
      case "down":
        return { x: acrossCenter - w / 2, y: near };
      default:
        return { x: near, y: acrossCenter - h / 2 };
    }
  }

  const cardPosition = (
    direction: Direction,
    near: number,
    acrossCenter: number,
  ) => boxPosition(direction, near, acrossCenter, NODE_W, NODE_H);

  function placeChildren(
    children: string[],
    direction: Direction,
    block: ChildBlock,
    near: number,
    acrossCenter: number,
    depth: number,
    parentId: string,
  ) {
    const step = growsForward(direction) ? 1 : -1;
    const colStarts: number[] = [];
    let cursor = near;
    for (let col = 0; col < block.cols; col += 1) {
      colStarts.push(cursor);
      cursor += step * ((block.colWidths[col] ?? 0) + gapAlong(direction));
    }

    const rowStarts: number[] = [];
    cursor = acrossCenter - block.across / 2;
    for (let row = 0; row < block.rows; row += 1) {
      rowStarts.push(cursor);
      cursor += (block.rowHeights[row] ?? 0) + gapAcross(direction);
    }

    children.forEach((id, index) => {
      const node = nodes.get(id);
      if (!node) return;
      const row = Math.floor(index / block.cols);
      const col = index % block.cols;
      const childNear = colStarts[col] ?? near;
      const childAcrossCenter =
        (rowStarts[row] ?? acrossCenter) + (block.rowHeights[row] ?? 0) / 2;
      const position = cardPosition(direction, childNear, childAcrossCenter);
      place(node, direction, position.x, position.y, depth, parentId);
    });
  }

  function placeGroups(
    parent: LaidOutNode,
    groups: { direction: Direction; children: string[] }[],
    depth: number,
  ) {
    const placed = groups
      .map((group) => ({
        ...group,
        block: blockMetrics(group.children, group.direction),
      }))
      .filter(
        (
          group,
        ): group is {
          direction: Direction;
          children: string[];
          block: ChildBlock;
        } => group.block !== null,
      );
    if (placed.length === 0) return;

    const { x, y } = parent.pos;
    for (const group of placed) {
      let near: number;
      let acrossCenter: number;
      switch (group.direction) {
        case "left":
          near = x - GAP_X;
          acrossCenter = y + NODE_H / 2;
          break;
        case "up":
          near = y - GAP_ALONG_V;
          acrossCenter = x + NODE_W / 2;
          break;
        case "down":
          near = y + NODE_H + GAP_ALONG_V;
          acrossCenter = x + NODE_W / 2;
          break;
        default:
          near = x + NODE_W + GAP_X;
          acrossCenter = y + NODE_H / 2;
      }
      placeChildren(
        group.children,
        group.direction,
        group.block,
        near,
        acrossCenter,
        depth + 1,
        parent.id,
      );
    }
  }

  function place(
    node: BranchNode,
    direction: Direction,
    x: number,
    y: number,
    depth: number,
    parentId: string | null,
  ) {
    const laid = laidOut(node, direction, x, y, depth, parentId);
    positions.set(node.id, laid);

    const children = childrenOf(node);
    if (children.length > 0) {
      placeGroups(laid, [{ direction, children }], depth);
    }
  }

  const root = laidOut(rootNode, "right", 0, 0, 0, null);
  positions.set(rootId, root);

  const rootChildren = childrenOf(rootNode);
  if (rootChildren.length > 0) {
    const buckets = dealSides(rootChildren);
    const groups = DIRECTION_ORDER.map((direction) => ({
      direction,
      children: buckets.get(direction) ?? [],
    })).filter((group) => group.children.length > 0);

    placeGroups(root, groups, 0);
  }

  return positions;
}

export function layoutBounds(positions: Map<string, LaidOutNode>): {
  min: Point;
  max: Point;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of positions.values()) {
    minX = Math.min(minX, node.pos.x);
    minY = Math.min(minY, node.pos.y);
    maxX = Math.max(maxX, node.pos.x + NODE_W);
    maxY = Math.max(maxY, node.pos.y + NODE_H);
  }
  if (!Number.isFinite(minX)) {
    return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

export interface Transform {
  x: number;
  y: number;
  k: number;
}

/** Frame the whole tree inside the viewport, never zooming past 1:1. */
export function fitTransform(
  bounds: { min: Point; max: Point },
  viewport: { width: number; height: number },
  padding = 56,
): Transform {
  const w = bounds.max.x - bounds.min.x;
  const h = bounds.max.y - bounds.min.y;
  if (w <= 0 || h <= 0) {
    return { x: viewport.width / 2, y: viewport.height / 2, k: 1 };
  }
  const k = Math.min(
    Math.min(
      (viewport.width - padding * 2) / w,
      (viewport.height - padding * 2) / h,
    ),
    1,
  );
  const clamped = Math.max(0.16, k);
  return {
    k: clamped,
    x: (viewport.width - w * clamped) / 2 - bounds.min.x * clamped,
    y: (viewport.height - h * clamped) / 2 - bounds.min.y * clamped,
  };
}

/** The minimum a connection thread needs to know about a card. */
export interface EdgeAnchor {
  x: number;
  y: number;
  direction: Direction;
}

interface Curve {
  start: Point;
  control1: Point;
  control2: Point;
  end: Point;
}

/** Control points of the thread from a parent card to one of its children. */
function curve(parent: { x: number; y: number }, child: EdgeAnchor): Curve {
  switch (child.direction) {
    case "left": {
      const startX = parent.x;
      const startY = parent.y + NODE_H / 2;
      const endX = child.x + NODE_W;
      const endY = child.y + NODE_H / 2;
      const bend = Math.max(36, (startX - endX) * 0.55);
      return {
        start: { x: startX, y: startY },
        control1: { x: startX - bend, y: startY },
        control2: { x: endX + bend, y: endY },
        end: { x: endX, y: endY },
      };
    }
    case "up": {
      const startX = parent.x + NODE_W / 2;
      const startY = parent.y;
      const endX = child.x + NODE_W / 2;
      const endY = child.y + NODE_H;
      const bend = Math.max(36, (startY - endY) * 0.55);
      return {
        start: { x: startX, y: startY },
        control1: { x: startX, y: startY - bend },
        control2: { x: endX, y: endY + bend },
        end: { x: endX, y: endY },
      };
    }
    case "down": {
      const startX = parent.x + NODE_W / 2;
      const startY = parent.y + NODE_H;
      const endX = child.x + NODE_W / 2;
      const endY = child.y;
      const bend = Math.max(36, (endY - startY) * 0.55);
      return {
        start: { x: startX, y: startY },
        control1: { x: startX, y: startY + bend },
        control2: { x: endX, y: endY - bend },
        end: { x: endX, y: endY },
      };
    }
    default: {
      const startX = parent.x + NODE_W;
      const startY = parent.y + NODE_H / 2;
      const endX = child.x;
      const endY = child.y + NODE_H / 2;
      const bend = Math.max(36, (endX - startX) * 0.55);
      return {
        start: { x: startX, y: startY },
        control1: { x: startX + bend, y: startY },
        control2: { x: endX - bend, y: endY },
        end: { x: endX, y: endY },
      };
    }
  }
}

/** SVG path for the thread between two cards. */
export function edgePath(
  parent: { x: number; y: number },
  child: EdgeAnchor,
): string {
  const { start, control1, control2, end } = curve(parent, child);
  return `M ${start.x} ${start.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${end.x} ${end.y}`;
}
