import { homography, toGlMat3, type Point } from './homography.ts';

/** How a panel's real-world appearance is laid onto the wall. */
export interface PanelSurface {
  /** Texture path relative to the site root, power-of-two pixel size, seamless when repeated. */
  texture: string;
  /** Physical width and height (metres) that one repeat of the texture covers. */
  widthM: number;
  heightM: number;
  /** One sheet or tile (metres): joints are drawn on this grid, laid from the floor up. */
  moduleW: number;
  moduleH: number;
  /** Horizontal offset of every other module row (0.5 = half bond for stone tiles). */
  stagger?: number;
  /** 0..1 visibility of joints between sheets or tiles. */
  seam: number;
  /** 0..1 high-gloss sheen (polished marble-look sheets) — 0 for matte stone and wood. */
  gloss: number;
  /** Brightness multiplier applied after lighting to match the real panel tone. */
  exposure?: number;
}

export interface RoomMeta {
  image: { width: number; height: number };
  wall: { widthM: number; heightM: number; corners: Point[] };
  wallLevel: number;
}

interface Layer {
  surface: PanelSurface | null; // null = the original painted wall
  tex: WebGLTexture | null;
}

const VERT = `
attribute vec2 aPos;
uniform vec4 uView;
varying vec2 vUv;
void main() {
  vec2 p = aPos * 0.5 + 0.5;
  vUv = vec2(uView.x + p.x * uView.z, uView.y + (1.0 - p.y) * uView.w);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uRoom;
uniform sampler2D uWall;
uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform mat3 uToWall;      // image UV -> wall metres (x right, y down from the ceiling line)
uniform vec2 uWallSize;    // metres
uniform float uMetrePx;    // metres per output pixel (for anti-aliased seams)
uniform vec4 uMatA;        // texture repeat widthM, heightM, seam, gloss
uniform vec4 uMatB;
uniform vec4 uModA;        // module (sheet/tile) width, height, stagger, exposure
uniform vec4 uModB;
uniform float uKindA;      // 1 = original painted wall
uniform float uKindB;
uniform float uProgress;   // 0..1 installation of B over A
uniform float uCompare;    // 0..1 blend back to the original photo
uniform float uColumns;    // number of sheet columns used for the staggered reveal

vec2 wallCoord() {
  vec3 p = uToWall * vec3(vUv, 1.0);
  return p.xy / p.z;
}

// Distance (metres) to the nearest joint for a grid of cells of size cell.
float jointDist(vec2 m, vec2 cell, float stagger) {
  float row = floor(m.y / cell.y);
  float x = m.x / cell.x + stagger * mod(row, 2.0);
  vec2 f = vec2(fract(x), fract(m.y / cell.y));
  vec2 d = min(f, 1.0 - f) * cell;
  return min(d.x, d.y);
}

vec3 surface(sampler2D tex, vec4 mat, vec4 md, vec2 m, float illum) {
  // Sheets and tiles are laid from the floor up, starting at the left corner.
  vec2 fromFloor = vec2(m.x, uWallSize.y - m.y);
  float row = floor(fromFloor.y / md.y);
  float shift = md.z * md.x * mod(row, 2.0);
  vec2 p = vec2(fromFloor.x + shift, fromFloor.y);
  vec2 uv = vec2(p.x / mat.x, 1.0 - p.y / mat.y);
  vec3 albedo = texture2D(tex, uv).rgb;
  // Joints: a soft dark line with a faint highlight beside it.
  float d = jointDist(fromFloor, md.xy, md.z);
  float px = max(uMetrePx, 0.0005);
  float line = 1.0 - smoothstep(0.6 * px, 1.6 * px + 0.0012, d);
  float lip = (1.0 - smoothstep(1.6 * px, 3.5 * px + 0.003, d)) - line;
  vec3 col = albedo * illum * md.w;
  col *= 1.0 - mat.z * 0.55 * line;
  col += mat.z * 0.035 * lip * illum;
  // Polished sheets catch a soft reflection of the window light on the left.
  float sheen = mat.w * (0.05 + 0.07 * smoothstep(0.9, 0.0, vUv.x)) * smoothstep(0.0, 0.6, illum);
  col = col + sheen * (1.0 - col) * 0.8;
  return clamp(col, 0.0, 1.0);
}

void main() {
  vec3 room = texture2D(uRoom, vUv).rgb;
  vec4 w = texture2D(uWall, vUv);
  float alpha = w.r;
  if (alpha < 0.002) { gl_FragColor = vec4(room, 1.0); return; }
  float illum = w.g * (255.0 / 128.0);
  vec2 m = wallCoord();

  vec3 a = uKindA > 0.5 ? room : surface(uTexA, uMatA, uModA, m, illum);
  vec3 b = uKindB > 0.5 ? room : surface(uTexB, uMatB, uModB, m, illum);

  // Installation reveal: columns go up one after another, each sliding down from the ceiling line.
  float colWidth = uWallSize.x / max(uColumns, 1.0);
  float column = floor(m.x / colWidth);
  float start = (column / max(uColumns, 1.0)) * 0.55;
  float t = clamp((uProgress - start) / 0.45, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  float front = t * (uWallSize.y + 0.12) - 0.06;
  float reveal = 1.0 - smoothstep(front - 0.04, front + 0.02, m.y);
  // The incoming sheet casts a short soft shadow on what is still visible below it.
  float shade = (1.0 - reveal) * smoothstep(front + 0.10, front, m.y) * 0.18 * (1.0 - t);
  // A fine edge highlight travels with the sheet while it is being placed.
  float edge = smoothstep(0.012, 0.0, abs(m.y - front)) * (1.0 - t) * 0.22;
  vec3 col = mix(a * (1.0 - shade), b, reveal) + edge * illum;
  col = mix(col, room, uCompare);
  gl_FragColor = vec4(mix(room, col, alpha), 1.0);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return sh;
}

export function loadImage(src: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    const onAbort = () => {
      img.src = '';
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    img.onload = () => {
      signal?.removeEventListener('abort', onAbort);
      img.decode().then(() => resolve(img), () => resolve(img));
    };
    img.onerror = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(new Error(`Failed to load ${src}`));
    };
    img.src = src;
  });
}

export class WallVisualizer {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private roomTex: WebGLTexture | null = null;
  private wallTex: WebGLTexture | null = null;
  private emptyTex: WebGLTexture;
  private cache = new Map<string, Promise<WebGLTexture>>();
  private a: Layer = { surface: null, tex: null };
  private b: Layer = { surface: null, tex: null };
  private progress = 1;
  private compare = 0;
  private compareTarget = 0;
  private animStart = 0;
  private duration = 1250;
  private raf = 0;
  private token = 0;
  private view = { cx: 0.52, cy: 0.5 };
  private toWall: Float32Array;
  private lost = false;
  private lastView = { vx: 0, vy: 0, vw: 1, vh: 1 };

  constructor(
    private canvas: HTMLCanvasElement,
    private room: RoomMeta,
    private reducedMotion: () => boolean,
  ) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL is not available');
    this.gl = gl;
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Program link failed: ${gl.getProgramInfoLog(program)}`);
    this.program = program;
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.emptyTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.emptyTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([200, 196, 190, 255]));

    // Wall plane: metres (x right from the left corner, y down from the ceiling) <-> image UV.
    const { widthM, heightM, corners } = room.wall;
    const metres: Point[] = [
      [0, 0],
      [widthM, 0],
      [widthM, heightM],
      [0, heightM],
    ];
    this.toWall = toGlMat3(homography(corners, metres));

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
  }

  private u(name: string) {
    if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    return this.uniforms.get(name)!;
  }

  private upload(img: TexImageSource, repeat: boolean): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    if (repeat) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  /** Loads the room photo and its wall layer. Resolves once the first frame can be drawn. */
  async init(roomSrc: string, wallSrc: string): Promise<void> {
    const [roomImg, wallImg] = await Promise.all([loadImage(roomSrc), loadImage(wallSrc)]);
    this.roomTex = this.upload(roomImg, false);
    this.wallTex = this.upload(wallImg, false);
    this.resize();
  }

  private texture(src: string): Promise<WebGLTexture> {
    let p = this.cache.get(src);
    if (!p) {
      p = loadImage(src).then((img) => this.upload(img, true));
      p.catch(() => this.cache.delete(src));
      this.cache.set(src, p);
    }
    return p;
  }

  /** Warms the cache so a later selection appears without waiting. */
  prefetch(surface: PanelSurface): void {
    this.texture(surface.texture).catch(() => undefined);
  }

  /**
   * Shows a panel (or the original wall when `surface` is null). Only the latest call wins:
   * earlier calls that finish loading later resolve with `superseded` and change nothing.
   */
  async show(surface: PanelSurface | null): Promise<'applied' | 'superseded'> {
    const token = ++this.token;
    const tex = surface ? await this.texture(surface.texture) : null;
    if (token !== this.token) return 'superseded';

    // Freeze whatever is on screen right now as the starting layer.
    this.a = this.progress >= 0.5 ? this.b : this.a;
    this.b = { surface, tex };
    if (this.a.surface === this.b.surface) {
      this.progress = 1;
      this.draw();
      return 'applied';
    }
    if (this.reducedMotion()) {
      this.progress = 1;
      this.draw();
      return 'applied';
    }
    this.progress = 0;
    this.animStart = performance.now();
    this.loop();
    return 'applied';
  }

  /** Temporarily shows the untouched photo (press-and-hold comparison). */
  setCompare(on: boolean): void {
    this.compareTarget = on ? 1 : 0;
    if (this.reducedMotion()) this.compare = this.compareTarget;
    this.loop();
  }

  /** Horizontal focus point (0..1 of the image) used when the stage is narrower than the photo. */
  setFocus(cx: number): void {
    this.view.cx = Math.min(1, Math.max(0, cx));
    this.draw();
  }

  get focus(): number {
    return this.view.cx;
  }

  /** Fraction of the photo width visible in the stage (1 when the whole width fits). */
  visibleWidth(): number {
    const imgAspect = this.room.image.width / this.room.image.height;
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    return aspect < imgAspect ? aspect / imgAspect : 1;
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.draw();
  }

  private loop(): void {
    if (this.raf) return;
    const step = (now: number) => {
      this.raf = 0;
      let busy = false;
      if (this.progress < 1) {
        this.progress = Math.min(1, (now - this.animStart) / this.duration);
        busy = this.progress < 1;
      }
      if (this.compare !== this.compareTarget) {
        const delta = (this.compareTarget - this.compare) * 0.25;
        this.compare = Math.abs(delta) < 0.004 ? this.compareTarget : this.compare + delta;
        busy = busy || this.compare !== this.compareTarget;
      }
      this.draw();
      if (busy) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  private bindLayer(unit: number, layer: Layer, suffix: 'A' | 'B'): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, layer.tex ?? this.emptyTex);
    gl.uniform1i(this.u(`uTex${suffix}`), unit);
    const s = layer.surface;
    gl.uniform4f(this.u(`uMat${suffix}`), s?.widthM ?? 1, s?.heightM ?? 1, s?.seam ?? 0, s?.gloss ?? 0);
    gl.uniform4f(this.u(`uMod${suffix}`), s?.moduleW ?? 1.22, s?.moduleH ?? 2.8, s?.stagger ?? 0, s?.exposure ?? 1);
    gl.uniform1f(this.u(`uKind${suffix}`), s ? 0 : 1);
  }

  private draw(): void {
    if (this.lost || !this.roomTex || !this.wallTex) return;
    const gl = this.gl;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    gl.viewport(0, 0, cw, ch);

    // Cover-fit the photo into the canvas, centred on the focus point.
    const imgAspect = this.room.image.width / this.room.image.height;
    const aspect = cw / ch;
    let vw = 1;
    let vh = 1;
    if (aspect < imgAspect) vw = aspect / imgAspect;
    else vh = imgAspect / aspect;
    const vx = Math.min(1 - vw, Math.max(0, this.view.cx - vw / 2));
    const vy = Math.min(1 - vh, Math.max(0, this.view.cy - vh / 2));
    this.lastView = { vx, vy, vw, vh };
    gl.uniform4f(this.u('uView'), vx, vy, vw, vh);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.roomTex);
    gl.uniform1i(this.u('uRoom'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.wallTex);
    gl.uniform1i(this.u('uWall'), 1);
    this.bindLayer(2, this.a, 'A');
    this.bindLayer(3, this.b, 'B');

    const { widthM, heightM, corners } = this.room.wall;
    const wallPx = (corners[1][0] - corners[0][0]) / vw * cw;
    gl.uniformMatrix3fv(this.u('uToWall'), false, this.toWall);
    gl.uniform2f(this.u('uWallSize'), widthM, heightM);
    gl.uniform1f(this.u('uMetrePx'), widthM / Math.max(1, wallPx));
    const columnWidth = this.b.surface?.moduleW ?? this.a.surface?.moduleW ?? 1.22;
    gl.uniform1f(this.u('uColumns'), Math.max(1, Math.ceil(widthM / columnWidth)));
    gl.uniform1f(this.u('uProgress'), this.progress);
    gl.uniform1f(this.u('uCompare'), this.compare);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Test helper: renders a frame and returns RGB values at image-space points (u, v in 0..1). */
  sample(points: Array<[number, number]>): Array<[number, number, number] | null> {
    this.draw();
    const gl = this.gl;
    const { vx, vy, vw, vh } = this.lastView;
    const px = new Uint8Array(4);
    return points.map(([u, v]) => {
      const x = Math.floor(((u - vx) / vw) * this.canvas.width);
      const y = Math.floor((1 - (v - vy) / vh) * this.canvas.height);
      if (x < 0 || y < 0 || x >= this.canvas.width || y >= this.canvas.height) return null;
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return [px[0], px[1], px[2]];
    });
  }

  get animating(): boolean {
    return this.progress < 1;
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
