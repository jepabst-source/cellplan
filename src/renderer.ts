/**
 * Canvas renderer — draws the grid with color-coded cells.
 *
 * Colors:
 *   Open space: dark background
 *   Wall: white/light gray
 *   Glass: blue tint
 *   Corridor: warm gray
 */

import { Grid, CellType, getCell } from './grid';
import { Region } from './matcher';

const COLORS: Record<CellType, string> = {
  [CellType.Open]: '#1a1a1a',
  [CellType.Wall]: '#d0d0d0',
  [CellType.Glass]: '#4a9eff',
  [CellType.Corridor]: '#8a7a6a',
};

const GRID_LINE_COLOR = '#2a2a2a';

export interface RendererOptions {
  cellSize: number;  // pixels per cell
  showGrid: boolean;
  padding: number;
}

const DEFAULT_OPTIONS: RendererOptions = {
  cellSize: 6,
  showGrid: false,
  padding: 20,
};

export function setupCanvas(canvas: HTMLCanvasElement, grid: Grid, opts: Partial<RendererOptions> = {}): RendererOptions {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  const totalWidth = grid.width * options.cellSize + options.padding * 2;
  const totalHeight = grid.height * options.cellSize + options.padding * 2;

  // Handle high-DPI displays
  const dpr = window.devicePixelRatio || 1;
  canvas.width = totalWidth * dpr;
  canvas.height = totalHeight * dpr;
  canvas.style.width = `${totalWidth}px`;
  canvas.style.height = `${totalHeight}px`;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  return options;
}

export function render(canvas: HTMLCanvasElement, grid: Grid, options: RendererOptions): void {
  const ctx = canvas.getContext('2d')!;
  const dpr = window.devicePixelRatio || 1;
  const totalWidth = canvas.width / dpr;
  const totalHeight = canvas.height / dpr;

  // Clear
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  const { cellSize, padding } = options;

  // Draw cells
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const cell = getCell(grid, x, y);
      // Note: y=0 is south (glass/bottom), rendered at the bottom of canvas
      const drawX = padding + x * cellSize;
      const drawY = padding + (grid.height - 1 - y) * cellSize;

      ctx.fillStyle = COLORS[cell];
      ctx.fillRect(drawX, drawY, cellSize, cellSize);
    }
  }

  // Grid lines (optional, for zoomed-in views)
  if (options.showGrid && cellSize >= 4) {
    ctx.strokeStyle = GRID_LINE_COLOR;
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= grid.width; x++) {
      const drawX = padding + x * cellSize;
      ctx.beginPath();
      ctx.moveTo(drawX, padding);
      ctx.lineTo(drawX, padding + grid.height * cellSize);
      ctx.stroke();
    }
    for (let y = 0; y <= grid.height; y++) {
      const drawY = padding + y * cellSize;
      ctx.beginPath();
      ctx.moveTo(padding, drawY);
      ctx.lineTo(padding + grid.width * cellSize, drawY);
      ctx.stroke();
    }
  }

  // Dimension labels
  ctx.fillStyle = '#666';
  ctx.font = '11px -apple-system, sans-serif';
  ctx.textAlign = 'center';

  // Width label (bottom)
  const widthFt = grid.width / 3;
  ctx.fillText(`${widthFt}'-0" (${grid.width} cells)`, padding + (grid.width * cellSize) / 2, padding + grid.height * cellSize + 16);

  // Height label (right side)
  ctx.save();
  ctx.translate(padding + grid.width * cellSize + 16, padding + (grid.height * cellSize) / 2);
  ctx.rotate(-Math.PI / 2);
  const heightFt = grid.height / 3;
  ctx.fillText(`${heightFt}'-0" (${grid.height} cells)`, 0, 0);
  ctx.restore();

  // Orientation labels
  ctx.fillStyle = '#4a9eff';
  ctx.font = '10px -apple-system, sans-serif';
  ctx.fillText('GLASS (South)', padding + (grid.width * cellSize) / 2, padding + grid.height * cellSize + 30);

  ctx.fillStyle = '#8a7a6a';
  ctx.fillText('CORRIDOR (North)', padding + (grid.width * cellSize) / 2, padding - 8);
}

export interface RoomLabel {
  name: string;
  region: Region;
  ok: boolean;  // true if room passes all checks
}

/**
 * Draw room labels centered in each matched region.
 */
export function renderLabels(canvas: HTMLCanvasElement, grid: Grid, options: RendererOptions, labels: RoomLabel[]): void {
  const ctx = canvas.getContext('2d')!;
  const { cellSize, padding } = options;

  for (const label of labels) {
    const r = label.region;
    // Center of the region in grid coords
    const centerX = (r.xMin + r.xMax) / 2;
    const centerY = (r.yMin + r.yMax) / 2;

    // Convert to canvas coords (y is flipped: y=0 is bottom)
    const drawX = padding + centerX * cellSize;
    const drawY = padding + (grid.height - 1 - centerY) * cellSize;

    // Background pill
    ctx.font = 'bold 10px -apple-system, sans-serif';
    const text = label.name;
    const metrics = ctx.measureText(text);
    const textW = metrics.width + 8;
    const textH = 14;

    ctx.fillStyle = label.ok ? 'rgba(40, 80, 40, 0.85)' : 'rgba(100, 30, 30, 0.85)';
    ctx.beginPath();
    ctx.roundRect(drawX - textW / 2, drawY - textH / 2, textW, textH, 3);
    ctx.fill();

    // Text
    ctx.fillStyle = label.ok ? '#8f8' : '#f88';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, drawX, drawY);
  }
}
