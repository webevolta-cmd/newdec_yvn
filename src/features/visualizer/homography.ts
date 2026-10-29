export type Point = [number, number];

/**
 * Solves the 3x3 homography H (row-major, h33 = 1) that maps each `from` point onto the
 * matching `to` point: [x', y', w]ᵀ = H · [x, y, 1]ᵀ.
 */
export function homography(from: Point[], to: Point[]): number[] {
  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i];
    const [u, v] = to[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // Gaussian elimination with partial pivoting on the 8x9 augmented matrix.
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col + 1; row < 8; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const p = a[col][col];
    if (Math.abs(p) < 1e-12) throw new Error('Degenerate wall corners');
    for (let k = col; k < 9; k++) a[col][k] /= p;
    for (let row = 0; row < 8; row++) {
      if (row === col) continue;
      const f = a[row][col];
      if (f === 0) continue;
      for (let k = col; k < 9; k++) a[row][k] -= f * a[col][k];
    }
  }
  return [a[0][8], a[1][8], a[2][8], a[3][8], a[4][8], a[5][8], a[6][8], a[7][8], 1];
}

/** Converts a row-major 3x3 matrix into the column-major Float32Array WebGL expects. */
export function toGlMat3(m: number[]): Float32Array {
  return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
}
