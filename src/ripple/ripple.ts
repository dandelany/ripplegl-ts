import { mat3, mat4 } from "../utils/glMatrix-0-9-5";

import raw from "raw.macro";
const displayFragShaderSrc = raw("../shaders/display.fs.glsl");
const displayVertShaderSrc = raw("../shaders/shader.vs.glsl");
const display3dVertShaderSrc = raw("../shaders/shader-3d.vs.glsl");
const drawFragShaderSrc = raw("../shaders/draw.fs.glsl");
const drawVertShaderSrc = raw("../shaders/draw.vs.glsl");
const drawLineFragShaderSrc = raw("../shaders/draw-line.fs.glsl");
const simFragShaderSrc = raw("../shaders/simulate.fs.glsl");
const modeFragShaderSrc = raw("../shaders/mode.fs.glsl");

enum ShaderType {
  Fragment = "Fragment",
  Vertex = "Vertex"
}

export function compileShader(
  shaderStr: string,
  shaderType: ShaderType,
  gl: WebGLRenderingContext,
  prefix: string | null
): WebGLShader {
  let shader;
  if (shaderType === ShaderType.Fragment) {
    shader = gl.createShader(gl.FRAGMENT_SHADER);
  } else if (shaderType === ShaderType.Vertex) {
    shader = gl.createShader(gl.VERTEX_SHADER);
  } else {
    throw new Error(`getShader: ${shaderType} is not a valid shader type`);
  }
  if (!shader) throw new Error(`Error creating ${shaderType} shader`);

  if (prefix) shaderStr = prefix + shaderStr;
  gl.shaderSource(shader, shaderStr);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const msg = gl.getShaderInfoLog(shader);
    // alert(gl.getShaderInfoLog(shader));
    throw new Error(`Could not compile shader: ${msg}`);
  }

  return shader;
}

// gl.lineWidth does not work on Chrome, so we need this workaround to draw lines as
// triangle strips instead
function thickLinePoints(arr: number[], thick: number): number[] {
  let i: number;
  let ax = 0;
  let ay = 0;
  let result: number[] = [];

  for (i = 0; i < arr.length - 2; i += 2) {
    const dx = arr[i + 2] - arr[i];
    const dy = arr[i + 3] - arr[i + 1];
    const dl = Math.hypot(dx, dy);
    if (dl > 0) {
      const mult = thick / dl;
      ax = mult * dy;
      ay = -mult * dx;
    }
    result.push(arr[i] + ax, arr[i + 1] + ay, arr[i] - ax, arr[i + 1] - ay);
  }
  result.push(arr[i] + ax, arr[i + 1] + ay, arr[i] - ax, arr[i + 1] - ay);
  return result;
}

function hexToRgb(hex: string): [number, number, number] | null {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : null;
}

// todo... deprecate Extended interfaces once we get rid of monkey patching
interface WebGLProgramExtended extends WebGLProgram {
  [key: string]: any;
}
interface WebGLFramebufferExtended extends WebGLFramebuffer {
  width?: number;
  height?: number;
}
interface WebGLBufferExtended extends WebGLBuffer {
  itemSize?: number;
  numItems?: number;
}
interface WebGLRenderingContextExtended extends WebGLRenderingContext {
  viewportWidth?: number;
  viewportHeight?: number;
  HALF_FLOAT_OES?: number;
}

function createBufferOrDie(gl: WebGLRenderingContext): WebGLBufferExtended {
  const buffer = gl.createBuffer() as WebGLBufferExtended | null;
  if (!buffer) throw new Error("Could not create WebGL Buffer");
  return buffer;
}
function createTextureOrDie(gl: WebGLRenderingContext): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Failed to create WebGL Texture");
  return texture;
}

interface FramebufferAndTexture {
  framebuffer: WebGLFramebufferExtended;
  texture: WebGLTexture;
}

class RippleSim {
  gl: WebGLRenderingContextExtended;
  canvas: HTMLCanvasElement;

  // todo defaults? set via options?
  colors: number[] | null = null;
  transform: number[] = [1, 0, 0, 1, 0, 0];
  simPosition: number[] = [];
  simTextureCoord: number[] = [];
  simDamping: number[] = [];
  srcCoords: number[] = [-0.26, 0, -0.25, 0];
  gridSize3D: number = 256;
  gridRange: number;
  gridSizeX: number;
  gridSizeY: number;
  windowOffsetX: number;
  windowOffsetY: number;
  fbType: number;
  windowWidth: number | null = null;
  windowHeight: number | null = null;
  drawingSelection: number;
  drawingColor: number[] = [0.0, 0.0, 0.0, 1.0];
  readPixelsWorks: boolean;
  acoustic: boolean;

  shaderProgramMain: WebGLProgramExtended;
  shaderProgram3D: WebGLProgramExtended;
  shaderProgramFixed: WebGLProgramExtended;
  shaderProgramAcoustic: WebGLProgramExtended;
  shaderProgramDraw: WebGLProgramExtended;
  shaderProgramDrawLine: WebGLProgramExtended;
  shaderProgramMode: WebGLProgramExtended;

  laptopScreenVertexPositionBuffer: WebGLBufferExtended;
  laptopScreenVertexTextureCoordBuffer: WebGLBufferExtended;
  screen3DTextureBuffer: WebGLBufferExtended;
  simVertexPositionBuffer: WebGLBufferExtended;
  simVertexTextureCoordBuffer: WebGLBufferExtended;
  simVertexDampingBuffer: WebGLBufferExtended;
  sourceBuffer: WebGLBufferExtended;
  colorBuffer: WebGLBufferExtended;

  renderTexture1: FramebufferAndTexture;
  renderTexture2: FramebufferAndTexture;

  mvMatrix: any;
  mvMatrixStack: any[];
  pMatrix: any;
  matrix3d: any;
  zoom3d: number;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // sim = sim_;
    const gl = canvas.getContext("experimental-webgl");
    if (!gl) throw new Error("Could not get experimental-webgl context");
    this.gl = gl as WebGLRenderingContextExtended;

    console.log("got gl context " + gl + " " + canvas.width + " " + canvas.height);

    // todo why were these commented out?? call elsewhere?
    var float_texture_ext = gl.getExtension("OES_texture_float");
    // var float_texture_ext = gl.getExtension("OES_texture_half_float");

    this.gridSizeX = this.gridSizeY = 1024;
    this.windowOffsetX = this.windowOffsetY = 40;

    // init matrices for 3d mode?
    this.mvMatrix = mat4.create();
    this.mvMatrixStack = [];
    this.pMatrix = mat4.create();
    this.matrix3d = mat4.create();
    this.zoom3d = 1;

    this.gridRange = 1 - this.windowOffsetX / this.gridSizeX - this.windowOffsetX / this.gridSizeX;

    // Init texture framebuffers
    this.fbType = 0;
    let renderTexture2;
    try {
      renderTexture2 = this.initTextureFramebuffer();
    } catch {
      // float didn't work, try half float
      this.fbType = 1;
      renderTexture2 = this.initTextureFramebuffer();
    }

    if (!renderTexture2) {
      throw new Error("Couldn't create frame buffer, try javascript version");
    }
    this.renderTexture2 = renderTexture2;

    const renderTexture1 = this.initTextureFramebuffer();
    if (!renderTexture1) throw new Error("Couldn't create frame buffer, try javascript version");
    this.renderTexture1 = renderTexture1;

    // Initialize shaders
    // ------------------
    this.shaderProgramMain = this.initShader(displayFragShaderSrc, displayVertShaderSrc);
    // todo fix monkeypatching
    this.shaderProgramMain.brightnessUniform = gl.getUniformLocation(this.shaderProgramMain, "brightness");
    this.shaderProgramMain.colorsUniform = gl.getUniformLocation(this.shaderProgramMain, "colors");

    this.shaderProgram3D = this.initShader(drawFragShaderSrc, display3dVertShaderSrc);
    // todo fix monkeypatching
    this.shaderProgram3D.brightnessUniform = gl.getUniformLocation(this.shaderProgram3D, "brightness");
    this.shaderProgram3D.colorsUniform = gl.getUniformLocation(this.shaderProgram3D, "colors");
    this.shaderProgram3D.xOffsetUniform = gl.getUniformLocation(this.shaderProgram3D, "xOffset");

    const shaderProgramFixed = this.initShader(simFragShaderSrc, displayVertShaderSrc);
    shaderProgramFixed.stepSizeXUniform = gl.getUniformLocation(shaderProgramFixed, "stepSizeX");
    shaderProgramFixed.stepSizeYUniform = gl.getUniformLocation(shaderProgramFixed, "stepSizeY");
    this.shaderProgramFixed = shaderProgramFixed;

    const shaderProgramAcoustic = this.initShader(
      simFragShaderSrc,
      displayVertShaderSrc,
      "#define ACOUSTIC 1\n"
    );
    shaderProgramAcoustic.stepSizeXUniform = gl.getUniformLocation(shaderProgramAcoustic, "stepSizeX");
    shaderProgramAcoustic.stepSizeYUniform = gl.getUniformLocation(shaderProgramAcoustic, "stepSizeY");
    this.shaderProgramAcoustic = shaderProgramAcoustic;

    this.shaderProgramDraw = this.initShader(drawFragShaderSrc, drawVertShaderSrc);
    this.shaderProgramDrawLine = this.initShader(drawLineFragShaderSrc, drawVertShaderSrc);
    this.shaderProgramMode = this.initShader(modeFragShaderSrc, drawVertShaderSrc);

    // Initialize buffers
    // ------------------
    this.laptopScreenVertexPositionBuffer = createBufferOrDie(gl);
    this.laptopScreenVertexTextureCoordBuffer = createBufferOrDie(gl);
    this.sourceBuffer = createBufferOrDie(gl);
    this.colorBuffer = createBufferOrDie(gl);
    this.screen3DTextureBuffer = createBufferOrDie(gl);
    this.simVertexPositionBuffer = createBufferOrDie(gl);
    this.simVertexTextureCoordBuffer = createBufferOrDie(gl);
    this.simVertexDampingBuffer = createBufferOrDie(gl);
    this.initBuffers();

    mat4.identity(this.matrix3d);
    mat4.rotateX(this.matrix3d, -Math.PI / 3);

    gl.clearColor(0.0, 0.0, 1.0, 1.0);

    this.readPixelsWorks = false;
    this.acoustic = false;

    // sim.drawWall = function(x, y, x2, y2) {
    //   drawWall(x, y, x2, y2, 0);
    // };

    // sim.drawParabola = function(x, y, w, h) {
    // sim.drawLens = function(x, y, w, h, m) {
    // sim.drawEllipse = function(x, y, x2, y2, m) {
    // sim.drawSolidEllipse = function(x, y, x2, y2, m) {
    // sim.drawMedium = function(x, y, x2, y2, x3, y3, x4, y4, m, m2) {
    // sim.drawTriangle = function(x, y, x2, y2, x3, y3, m) {
    // sim.drawModes = function(x, y, x2, y2, a, b, c, d) {
    // sim.drawSource = function(x: number, y: number, f) {
    // sim.drawLineSource = function(x, y, x2, y2, f, g) {
    // sim.drawPhasedArray = function(x, y, x2, y2, f1, f2) {
    // sim.drawHandle = function(x, y) {
    // sim.drawFocus = function(x, y) {
    // sim.drawPoke = function(x, y) {

    this.drawingSelection = -1;
    mat4.identity(this.pMatrix);
    mat4.identity(this.mvMatrix);
  }

  initShader(fs: string, vs: string, prefix: string | null = null): WebGLProgramExtended {
    const { gl } = this;
    const fragmentShader = compileShader(fs, ShaderType.Fragment, gl, prefix);
    const vertexShader = compileShader(vs, ShaderType.Vertex, gl, prefix);
    const shaderProgram = gl.createProgram();
    if (!shaderProgram) throw new Error("gl.createProgram() failed");

    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      const logMsg = gl.getProgramInfoLog(shaderProgram);
      throw new Error(`Error linking shaders: ${logMsg}`);
    }

    gl.useProgram(shaderProgram);

    // todo... ??? ... where to store this add'l info? don't monkeypatch
    const programExtended: WebGLProgramExtended = shaderProgram;
    programExtended.vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "aVertexPosition");
    programExtended.textureCoordAttribute = gl.getAttribLocation(shaderProgram, "aTextureCoord");
    programExtended.dampingAttribute = gl.getAttribLocation(shaderProgram, "aDamping");
    programExtended.colorAttribute = gl.getAttribLocation(shaderProgram, "aColor");
    programExtended.pMatrixUniform = gl.getUniformLocation(shaderProgram, "uPMatrix");
    programExtended.mvMatrixUniform = gl.getUniformLocation(shaderProgram, "uMVMatrix");
    programExtended.samplerUniform = gl.getUniformLocation(shaderProgram, "uSampler");

    return programExtended;
  }

  initBuffers() {
    const { gl } = this;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.laptopScreenVertexPositionBuffer);
    const vertices = [-1, +1, +1, +1, -1, -1, +1, -1];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    // todo no monkey patching
    this.laptopScreenVertexPositionBuffer.itemSize = 2;
    this.laptopScreenVertexPositionBuffer.numItems = 4;

    const { windowOffsetX, windowOffsetY, gridSizeX, gridSizeY } = this;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.laptopScreenVertexTextureCoordBuffer);
    const textureCoords = [
      windowOffsetX / gridSizeX,
      1 - windowOffsetY / gridSizeY,
      1 - windowOffsetX / gridSizeX,
      1 - windowOffsetY / gridSizeY,
      windowOffsetX / gridSizeX,
      windowOffsetY / gridSizeY,
      1 - windowOffsetX / gridSizeX,
      windowOffsetY / gridSizeY
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoords), gl.STATIC_DRAW);
    // todo no monkey patching
    this.laptopScreenVertexTextureCoordBuffer.itemSize = 2;
    this.laptopScreenVertexTextureCoordBuffer.numItems = 4;

    this.sourceBuffer.itemSize = 2;
    this.sourceBuffer.numItems = 2;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sourceBuffer);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    this.colorBuffer.itemSize = 4;
    this.colorBuffer.numItems = 2;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.screen3DTextureBuffer);
    this.screen3DTextureBuffer.itemSize = 2;
    let texture3D = [];
    this.gridRange = textureCoords[2] - textureCoords[0];

    const { gridRange, gridSize3D } = this;
    for (let i = 0; i <= gridSize3D; i++) {
      texture3D.push(
        textureCoords[0],
        textureCoords[0] + (gridRange * i) / gridSize3D,
        textureCoords[0] + gridRange / gridSize3D,
        textureCoords[0] + (gridRange * i) / gridSize3D
      );
    }
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texture3D), gl.STATIC_DRAW);
    this.screen3DTextureBuffer.numItems = texture3D.length / 2;

    this.simPosition = [];
    this.simDamping = [];
    this.simTextureCoord = [];

    // visible area
    this.setPosRect(windowOffsetX, windowOffsetY, gridSizeX - windowOffsetX, gridSizeY - windowOffsetY);

    // sides
    this.setPosRect(1, windowOffsetY, windowOffsetX, gridSizeY - windowOffsetY);
    this.setPosRect(gridSizeX - windowOffsetX, windowOffsetY, gridSizeX - 2, gridSizeY - windowOffsetY);
    this.setPosRect(windowOffsetX, 1, gridSizeX - windowOffsetX, windowOffsetY);
    this.setPosRect(windowOffsetX, gridSizeY - windowOffsetY, gridSizeX - windowOffsetX, gridSizeY - 2);

    // corners
    this.setPosRect(1, 1, windowOffsetX, windowOffsetY);
    this.setPosRect(gridSizeX - windowOffsetX, 1, gridSizeX - 2, windowOffsetY);
    this.setPosRect(1, gridSizeY - windowOffsetY, windowOffsetX, gridSizeY - 2);
    this.setPosRect(gridSizeX - windowOffsetX, gridSizeY - windowOffsetY, gridSizeX - 2, gridSizeY - 2);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.simVertexPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.simPosition), gl.STATIC_DRAW);
    this.simVertexPositionBuffer.itemSize = 2;
    this.simVertexPositionBuffer.numItems = this.simPosition.length / 2;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.simVertexTextureCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.simTextureCoord), gl.STATIC_DRAW);
    this.simVertexTextureCoordBuffer.itemSize = 2;
    this.simVertexTextureCoordBuffer.numItems = this.simPosition.length / 2;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.simVertexDampingBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.simDamping), gl.STATIC_DRAW);
    this.simVertexDampingBuffer.itemSize = 1;
    this.simVertexDampingBuffer.numItems = this.simDamping.length;
  }

  initTextureFramebuffer(): FramebufferAndTexture {
    const { gl } = this;
    const rttFramebuffer: WebGLFramebufferExtended | null = gl.createFramebuffer();
    if (!rttFramebuffer) throw new Error("Could not create WebGLFrameBuffer");
    gl.bindFramebuffer(gl.FRAMEBUFFER, rttFramebuffer);
    // todo no monkeypatching
    rttFramebuffer.width = this.gridSizeX;
    rttFramebuffer.height = this.gridSizeY;

    const rttTexture = createTextureOrDie(gl);
    gl.bindTexture(gl.TEXTURE_2D, rttTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    //gl.generateMipmap(gl.TEXTURE_2D);

    //gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, rttFramebuffer.width, rttFramebuffer.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    // const HALF_FLOAT_OES = 0x8d61;
    //
    // const rgbFormat = this.fbType === 0 ? gl.RGBA : gl.RGB;
    // const floatType = this.fbType === 0 ? gl.FLOAT : HALF_FLOAT_OES;
    //
    // gl.texImage2D(
    //   gl.TEXTURE_2D,
    //   0,
    //   rgbFormat,
    //   rttFramebuffer.width,
    //   rttFramebuffer.height,
    //   0,
    //   rgbFormat,
    //   floatType,
    //   null
    // );
    gl.HALF_FLOAT_OES = 0x8d61;

    if (this.fbType === 0) {
      // this works on android
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        rttFramebuffer.width,
        rttFramebuffer.height,
        0,
        gl.RGBA,
        gl.FLOAT,
        null
      );
    } else {
      // for ios
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGB,
        rttFramebuffer.width,
        rttFramebuffer.height,
        0,
        gl.RGB,
        gl.HALF_FLOAT_OES,
        null
      );
    }

    const renderbuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
    // gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, rttFramebuffer.width, rttFramebuffer.height);

    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rttTexture, 0);
    // gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, renderbuffer);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("Failed to initialize framebuffer and texture");
    }

    // todo ???
    while (gl.getError() !== gl.NO_ERROR) {}
    const pixels = new Float32Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, pixels);
    if (gl.getError() !== gl.NO_ERROR) console.log("readPixels failed");
    else this.readPixelsWorks = true;

    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { framebuffer: rttFramebuffer, texture: rttTexture };
  }

  setColors(...args: number[]) {
    const colors: number[] = [];
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      colors.push(((arg >> 16) & 0xff) / 255, ((arg >> 8) & 0xff) / 255, (arg & 0xff) / 255);
    }
    this.colors = colors;
  }

  setColorScheme(hexColors: string[]) {
    const colors = [];
    for (let i = 0; i < hexColors.length; i++) {
      const rgb = hexToRgb(hexColors[i]);
      if(!rgb) throw new Error(`invalid color in color scheme: ${hexColors[i]}`);
      colors.push(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
    }
    // todo??
    // int zerocol3d = zeroColor.toInteger();
    // if (zerocol3d == 0) zerocol3d = 0x808080;
    const zeroCol3d = hexToRgb('#808080') as [number, number, number];
    colors.push(zeroCol3d[0], zeroCol3d[1], zeroCol3d[2]);

    this.colors = colors;
  }

  deleteRenderTexture(rt: FramebufferAndTexture) {
    this.gl.deleteTexture(rt.texture);
    this.gl.deleteFramebuffer(rt.framebuffer);
  }

  setResolution(x: number, y: number, wx: number, wy: number) {
    this.gridSizeX = x;
    this.gridSizeY = y;
    this.windowOffsetX = wx;
    this.windowOffsetY = wy;
    this.windowWidth = this.gridSizeX - this.windowOffsetX * 2;
    this.windowHeight = this.gridSizeY - this.windowOffsetY * 2;
    this.deleteRenderTexture(this.renderTexture1);
    this.deleteRenderTexture(this.renderTexture2);
    this.renderTexture2 = this.initTextureFramebuffer();
    this.renderTexture1 = this.initTextureFramebuffer();
    this.initBuffers();
  }

  set3dViewZoom(z: number) {
    this.zoom3d = z;
  }
  set3dViewAngle(x: number, y: number) {
    let mtemp = mat4.create();
    mat4.identity(mtemp);
    mat4.rotateY(mtemp, x / 100);
    mat4.rotateX(mtemp, y / 100);
    mat4.multiply(mtemp, this.matrix3d, this.matrix3d);
  }

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
    const { transform } = this;
    transform[0] = a;
    transform[1] = b;
    transform[2] = c;
    transform[3] = d;
    transform[4] = e;
    transform[5] = f;
  }

  doBlank() {
    const { renderTexture1, gl } = this;
    const rttFramebuffer = renderTexture1.framebuffer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, rttFramebuffer);
    gl.viewport(0, 0, rttFramebuffer.width || 0, rttFramebuffer.height || 0);
    gl.colorMask(true, true, false, false);
    gl.clearColor(0.0, 0.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.colorMask(true, true, true, true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  doBlankWalls() {
    // todo combine with doBlank? parameterize differences
    const { renderTexture1, gl } = this;
    const rttFramebuffer = renderTexture1.framebuffer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, rttFramebuffer);
    gl.viewport(0, 0, rttFramebuffer.width || 0, rttFramebuffer.height || 0);
    gl.colorMask(false, false, true, false);
    gl.clearColor(0.0, 0.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.colorMask(true, true, true, true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  updateRipple(bright: number) {
    this.drawScene(bright);
  }
  updateRipple3D(bright: number) {
    this.drawScene3D(bright);
  }

  drawScene(brightness: number): void {
    const { gl, canvas, shaderProgramMain, pMatrix, mvMatrix } = this;
    gl.useProgram(shaderProgramMain);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.viewportWidth = canvas.width;
    gl.viewportHeight = canvas.height;
    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    mat4.identity(pMatrix);
    mat4.identity(mvMatrix);
    this.mvPushMatrix();

    // draw result
    gl.bindBuffer(gl.ARRAY_BUFFER, this.laptopScreenVertexPositionBuffer);
    gl.vertexAttribPointer(
      shaderProgramMain.vertexPositionAttribute,
      this.laptopScreenVertexPositionBuffer.itemSize || 1,
      gl.FLOAT,
      false,
      0,
      0
    );

    gl.bindBuffer(gl.ARRAY_BUFFER, this.laptopScreenVertexTextureCoordBuffer);
    gl.vertexAttribPointer(
      shaderProgramMain.textureCoordAttribute,
      this.laptopScreenVertexTextureCoordBuffer.itemSize || 1,
      gl.FLOAT,
      false,
      0,
      0
    );

    if (!this.colors) throw new Error("Colors have not been initialized");
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.renderTexture1.texture);
    gl.uniform1i(shaderProgramMain.samplerUniform, 0);
    gl.uniform1f(shaderProgramMain.brightnessUniform, brightness);
    gl.uniform3fv(shaderProgramMain.colorsUniform, this.colors);

    this.setMatrixUniforms(shaderProgramMain);
    gl.enableVertexAttribArray(shaderProgramMain.vertexPositionAttribute);
    gl.enableVertexAttribArray(shaderProgramMain.textureCoordAttribute);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.laptopScreenVertexPositionBuffer.numItems || 1);
    gl.disableVertexAttribArray(shaderProgramMain.vertexPositionAttribute);
    gl.disableVertexAttribArray(shaderProgramMain.textureCoordAttribute);

    this.mvPopMatrix();
  }

  drawScene3D(bright: number) {
    const { gl, canvas, mvMatrix, pMatrix, matrix3d, zoom3d } = this;
    gl.useProgram(this.shaderProgram3D);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const viewportWidth = canvas.width;
    const viewportHeight = canvas.height;
    gl.viewportWidth = viewportWidth;
    gl.viewportHeight = viewportHeight;
    gl.viewport(0, 0, viewportWidth, viewportHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    mat4.identity(pMatrix);
    mat4.identity(mvMatrix);
    this.mvPushMatrix();

    mat4.perspective(45, viewportWidth / viewportHeight, 0.1, 100.0, pMatrix);
    mat4.translate(mvMatrix, [0, 0, -3.2]);
    mat4.multiply(mvMatrix, matrix3d, mvMatrix);
    mat4.scale(mvMatrix, [zoom3d, zoom3d, zoom3d]);

    // draw result
    gl.bindBuffer(gl.ARRAY_BUFFER, this.screen3DTextureBuffer);
    gl.vertexAttribPointer(
      this.shaderProgram3D.textureCoordAttribute,
      this.screen3DTextureBuffer.itemSize || 0,
      gl.FLOAT,
      false,
      0,
      0
    );

    if (!this.colors) throw new Error("Colors have not been initialized - call setColors");
    if (this.gridRange === null) throw new Error("gridRange has not been initialized");

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.renderTexture1.texture);
    gl.uniform1i(this.shaderProgram3D.samplerUniform, 0);
    gl.uniform1f(this.shaderProgram3D.brightnessUniform, bright * 0.1);
    gl.uniform3fv(this.shaderProgram3D.colorsUniform, this.colors);

    this.setMatrixUniforms(this.shaderProgram3D);
    gl.enableVertexAttribArray(this.shaderProgram3D.textureCoordAttribute);
    gl.enable(gl.DEPTH_TEST);
    for (let i = 0; i !== this.gridSize3D; i++) {
      gl.uniform1f(this.shaderProgram3D.xOffsetUniform, (this.gridRange * i) / this.gridSize3D);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.screen3DTextureBuffer.numItems || 0);
    }
    gl.disable(gl.DEPTH_TEST);
    gl.disableVertexAttribArray(this.shaderProgram3D.textureCoordAttribute);

    this.mvPopMatrix();
  }

  drawSource(x: number, y: number, f: number): void {
    const { gl, shaderProgramDraw } = this;
    gl.useProgram(shaderProgramDraw);
    gl.vertexAttrib4f(shaderProgramDraw.colorAttribute, f, 0.0, 1.0, 1.0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.sourceBuffer);
    this.srcCoords[0] = this.srcCoords[2] = x;
    this.srcCoords[1] = y;
    this.srcCoords[3] = this.srcCoords[1] + 1;
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.srcCoords), gl.STATIC_DRAW);
    gl.vertexAttribPointer(
      shaderProgramDraw.vertexPositionAttribute,
      this.sourceBuffer.itemSize || 0,
      gl.FLOAT,
      false,
      0,
      0
    );

    //        gl.bindBuffer(gl.ARRAY_BUFFER, laptopScreenVertexTextureCoordBuffer);
    //        gl.vertexAttribPointer(shaderProgramDraw.textureCoordAttribute, laptopScreenVertexTextureCoordBuffer.itemSize, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shaderProgramDraw.vertexPositionAttribute);
    this.loadMatrix(this.pMatrix);
    this.setMatrixUniforms(shaderProgramDraw);
    gl.drawArrays(gl.LINES, 0, 2);
    gl.disableVertexAttribArray(shaderProgramDraw.vertexPositionAttribute);

    //mvPopMatrix();
  }

  mvPushMatrix() {
    // push a copy of mvMatrix to mvMatrixStack
    const copy = mat4.create();
    mat4.set(this.mvMatrix, copy);
    this.mvMatrixStack.push(copy);
  }

  mvPopMatrix() {
    // set this.mvMatrix to the most recent mvMatrix pushed to mvMatrixStack
    // and remove it from the stack
    if (this.mvMatrixStack.length === 0) {
      throw "Invalid popMatrix!";
    }
    this.mvMatrix = this.mvMatrixStack.pop();
  }

  setMatrixUniforms(shaderProgram: WebGLProgramExtended) {
    const { gl } = this;
    gl.uniformMatrix4fv(shaderProgram.pMatrixUniform, false, this.pMatrix);
    gl.uniformMatrix4fv(shaderProgram.mvMatrixUniform, false, this.mvMatrix);

    const normalMatrix = mat3.create();
    mat4.toInverseMat3(this.mvMatrix, normalMatrix);
    mat3.transpose(normalMatrix);
    gl.uniformMatrix3fv(shaderProgram.nMatrixUniform, false, normalMatrix);
  }

  loadMatrix(mtx: any[]) {
    mat4.identity(mtx);
    if (this.windowWidth === null || this.windowHeight === null)
      throw new Error("windowWidth/windowHeight not initialized");

    if (this.drawingSelection > 0) {
      // drawing on screen
      mtx[0] = +2 / this.windowWidth;
      mtx[5] = -2 / this.windowHeight;
      mtx[12] = -1 + 0.5 * mtx[0];
      mtx[13] = +1 + 0.5 * mtx[5];
    } else {
      // drawing walls into render texture
      mtx[0] = +2 / this.gridSizeX;
      mtx[5] = -2 / this.gridSizeY;
      mtx[12] = -1 + (0.5 + this.windowOffsetX) * mtx[0];
      mtx[13] = +1 + (0.5 + this.windowOffsetY) * mtx[5];
    }
    const tx = this.transform;
    mat4.multiply(mtx, [tx[0], tx[3], 0, 0, tx[1], tx[4], 0, 0, 0, 0, 1, 0, tx[2], tx[5], 0, 1], mtx);
  }

  // create coordinates for a rectangular portion of the grid, making sure to set the damping attribute
  // appropriately (1 for visible area, slightly less for offscreen area used to avoid reflections at edges)
  setPosRect(x1: number, y1: number, x2: number, y2: number) {
    const points = [x2, y1, x1, y1, x2, y2, x1, y1, x2, y2, x1, y2];
    for (let i = 0; i !== 6; i++) {
      const xi = points[i * 2];
      const yi = points[i * 2 + 1];
      this.simPosition.push(-1 + (2 * xi) / this.gridSizeX, -1 + (2 * yi) / this.gridSizeY);
      this.simTextureCoord.push(xi / this.gridSizeX, yi / this.gridSizeY);
      let damp = 1;
      if (xi === 1 || yi === 1 || xi === this.gridSizeX - 2 || yi === this.gridSizeY - 2)
        damp = 0.999 - 8 * 0.01; // was 20
      this.simDamping.push(damp);
      // this.simDamping.push(1);
    }
  }

  simulate() {
    const { gl } = this;

    let rt = this.renderTexture1;
    this.renderTexture1 = this.renderTexture2;
    this.renderTexture2 = rt;

    let rttFramebuffer: WebGLFramebufferExtended = this.renderTexture1.framebuffer;
    // var rttTexture = this.renderTexture1.texture;
    gl.bindFramebuffer(gl.FRAMEBUFFER, rttFramebuffer);

    const prog: WebGLProgramExtended = this.acoustic ? this.shaderProgramAcoustic : this.shaderProgramFixed;
    gl.useProgram(prog);
    rttFramebuffer = this.renderTexture1.framebuffer;
    // todo throw if no width/height
    gl.viewport(0, 0, rttFramebuffer.width || 0, rttFramebuffer.height || 0);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    mat4.identity(this.pMatrix);
    mat4.identity(this.mvMatrix);
    //mvPushMatrix();

    gl.bindBuffer(gl.ARRAY_BUFFER, this.simVertexPositionBuffer);
    gl.vertexAttribPointer(
      prog.vertexPositionAttribute,
      this.simVertexPositionBuffer.itemSize || 0,
      gl.FLOAT,
      false,
      0,
      0
    );

    gl.bindBuffer(gl.ARRAY_BUFFER, this.simVertexTextureCoordBuffer);
    gl.vertexAttribPointer(
      prog.textureCoordAttribute,
      this.simVertexTextureCoordBuffer.itemSize || 0,
      gl.FLOAT,
      false,
      0,
      0
    );

    gl.enableVertexAttribArray(prog.dampingAttribute);
    gl.enableVertexAttribArray(prog.vertexPositionAttribute);
    gl.enableVertexAttribArray(prog.textureCoordAttribute);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.simVertexDampingBuffer);
    gl.vertexAttribPointer(
      prog.dampingAttribute,
      this.simVertexDampingBuffer.itemSize || 0,
      gl.FLOAT,
      false,
      0,
      0
    );

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.renderTexture2.texture);
    gl.uniform1i(prog.samplerUniform, 0);
    gl.uniform1f(prog.stepSizeXUniform, 1 / this.gridSizeX);
    gl.uniform1f(prog.stepSizeYUniform, 1 / this.gridSizeY);

    this.setMatrixUniforms(prog);
    gl.drawArrays(gl.TRIANGLES, 0, this.simVertexPositionBuffer.numItems || 0);
    gl.disableVertexAttribArray(prog.dampingAttribute);
    gl.disableVertexAttribArray(prog.vertexPositionAttribute);
    gl.disableVertexAttribArray(prog.textureCoordAttribute);
  }

  setupForDrawing(v: number) {
    const { gl, shaderProgramDraw } = this;
    if (this.drawingSelection > 0) {
      gl.vertexAttrib4f(
        shaderProgramDraw.colorAttribute,
        this.drawingColor[0] * this.drawingSelection,
        this.drawingColor[1] * this.drawingSelection,
        this.drawingColor[2] * this.drawingSelection,
        this.drawingColor[3]
      );
    } else {
      const rttFramebuffer = this.renderTexture1.framebuffer;
      gl.bindFramebuffer(gl.FRAMEBUFFER, rttFramebuffer);
      gl.viewport(0, 0, rttFramebuffer.width || 0, rttFramebuffer.height || 0);
      gl.useProgram(shaderProgramDraw);

      // blue channel used for walls and media
      gl.colorMask(false, false, true, false);
      gl.vertexAttrib4f(shaderProgramDraw.colorAttribute, 0.0, 0.0, v, 1.0);
    }
  }

  clearWall(x: number, y: number, x2: number, y2: number) {
    this.drawWall(x, y, x2, y2, 1);
  }

  drawWall(x: number, y: number, x2: number, y2: number, v: number = 0) {
    this.setupForDrawing(v);

    const { gl, sourceBuffer, shaderProgramDraw } = this;
    gl.bindBuffer(gl.ARRAY_BUFFER, sourceBuffer);
    // draw line back on itself, or else one endpoint won't be drawn
    this.srcCoords = thickLinePoints([x, y, x2, y2, x, y], 1.5);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.srcCoords), gl.STATIC_DRAW);

    gl.vertexAttribPointer(
      shaderProgramDraw.vertexPositionAttribute,
      sourceBuffer.itemSize || 0,
      gl.FLOAT,
      false,
      0,
      0
    );

    this.loadMatrix(this.pMatrix);

    this.setMatrixUniforms(shaderProgramDraw);
    gl.enableVertexAttribArray(shaderProgramDraw.vertexPositionAttribute);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 6);
    gl.disableVertexAttribArray(shaderProgramDraw.vertexPositionAttribute);

    gl.colorMask(true, true, true, true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  drawHandle(x: number, y: number) {
    const { gl, shaderProgramDraw, sourceBuffer } = this;
    if (!shaderProgramDraw) return;
    gl.useProgram(shaderProgramDraw);

    if (this.drawingSelection >= 0) {
      this.drawSelectedHandle(x, y);
      return;
    }

    gl.vertexAttrib4f(shaderProgramDraw.colorAttribute, 1, 1.0, 1.0, 1.0);
    // if (this.drawingSelection < 0) gl.vertexAttrib4f(shaderProgramDraw.colorAttribute, 1, 1.0, 1.0, 1.0);
    // else
    //   gl.vertexAttrib4f(shaderProgramDraw.colorAttribute, sim.drawingSelection, sim.drawingSelection, 0, 1.0);

    if (!sourceBuffer) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, sourceBuffer);

    if (this.windowWidth === null || this.windowHeight === null)
      throw new Error("windowWidth/windowHeight not initialized");

    var cx = -1 + (2 * (x + 0.5)) / this.windowWidth;
    var cy = +1 - (2 * (y + 0.5)) / this.windowHeight;
    var ox = 0.01;
    var oy = 0.01;
    var coords = [cx - ox, cy - oy, cx + ox, cy - oy, cx + ox, cy + oy, cx - ox, cy + oy];

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(coords), gl.STATIC_DRAW);
    gl.vertexAttribPointer(
      shaderProgramDraw.vertexPositionAttribute,
      sourceBuffer.itemSize || 0,
      gl.FLOAT,
      false,
      0,
      0
    );

    mat4.identity(this.pMatrix);
    this.setMatrixUniforms(shaderProgramDraw);
    //        gl.lineWidth(sim.drawingSelection < 0 ? 1 : 2);
    gl.enableVertexAttribArray(shaderProgramDraw.vertexPositionAttribute);
    gl.drawArrays(gl.LINE_LOOP, 0, 4);
    gl.disableVertexAttribArray(shaderProgramDraw.vertexPositionAttribute);
  }

  drawSelectedHandle(x: number, y: number) {
    const { gl, shaderProgramDraw, sourceBuffer } = this;
    gl.vertexAttrib4f(shaderProgramDraw.colorAttribute, this.drawingSelection, this.drawingSelection, 0, 0.5);

    gl.bindBuffer(gl.ARRAY_BUFFER, sourceBuffer);

    if (this.windowWidth === null || this.windowHeight === null)
      throw new Error("windowWidth/windowHeight not initialized");
    var cx = -1 + (2 * (x + 0.5)) / this.windowWidth;
    var cy = +1 - (2 * (y + 0.5)) / this.windowHeight;
    var ox = 0.012;
    var oy = 0.012;
    var coords = [cx - ox, cy - oy, cx + ox, cy - oy, cx - ox, cy + oy, cx + ox, cy + oy];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(coords), gl.STATIC_DRAW);
    gl.vertexAttribPointer(
      shaderProgramDraw.vertexPositionAttribute,
      sourceBuffer.itemSize || 0,
      gl.FLOAT,
      false,
      0,
      0
    );

    mat4.identity(this.pMatrix);
    this.setMatrixUniforms(shaderProgramDraw);
    //        gl.lineWidth(sim.drawingSelection < 0 ? 1 : 2);
    gl.enableVertexAttribArray(shaderProgramDraw.vertexPositionAttribute);
    gl.enable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.BLEND);
    gl.disableVertexAttribArray(shaderProgramDraw.vertexPositionAttribute);
  }

  drawFocus(x: number, y: number) {
    const { gl, shaderProgramDraw, sourceBuffer } = this;
    gl.useProgram(shaderProgramDraw);
    gl.vertexAttrib4f(shaderProgramDraw.colorAttribute, 1, 1.0, 1.0, 1.0);

    gl.bindBuffer(gl.ARRAY_BUFFER, sourceBuffer);
    var cx = x; // -1+2*(x+.5)/windowWidth;
    var cy = y; // +1-2*(y+.5)/windowHeight;
    var ox = 3;
    var oy = 3;
    var coords = [cx - ox, cy, cx + ox, cy, cx, cy + oy, cx, cy - oy];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(coords), gl.STATIC_DRAW);
    gl.vertexAttribPointer(
      shaderProgramDraw.vertexPositionAttribute,
      sourceBuffer.itemSize || 0,
      gl.FLOAT,
      false,
      0,
      0
    );

    this.setMatrixUniforms(shaderProgramDraw);
    gl.enableVertexAttribArray(shaderProgramDraw.vertexPositionAttribute);
    gl.drawArrays(gl.LINES, 0, 4);
    gl.disableVertexAttribArray(shaderProgramDraw.vertexPositionAttribute);

    //mvPopMatrix();
  }

  drawLineSource(
    drawLineProgram: WebGLProgramExtended,
    x: number,
    y: number,
    x2: number,
    y2: number,
    f: number,
    gauss?: any
  ) {
    const { gl, sourceBuffer, colorBuffer, srcCoords } = this;
    gl.useProgram(drawLineProgram);

    gl.bindBuffer(gl.ARRAY_BUFFER, sourceBuffer);
    srcCoords[0] = x;
    srcCoords[1] = y;
    srcCoords[2] = x2;
    srcCoords[3] = y2;
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(srcCoords), gl.STATIC_DRAW);
    gl.vertexAttribPointer(
      drawLineProgram.vertexPositionAttribute,
      sourceBuffer.itemSize || 0,
      gl.FLOAT,
      false,
      0,
      0
    );

    var colors = [f, 0, 1, 0, f, 0, 1, 0];
    if (gauss) colors = [f, 0, 1, -3, f, 0, 1, 3];
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
    gl.vertexAttribPointer(drawLineProgram.colorAttribute, colorBuffer.itemSize || 0, gl.FLOAT, false, 0, 0);

    this.loadMatrix(this.pMatrix);
    this.setMatrixUniforms(drawLineProgram);
    gl.enableVertexAttribArray(drawLineProgram.colorAttribute);
    gl.enableVertexAttribArray(drawLineProgram.vertexPositionAttribute);
    gl.drawArrays(gl.LINES, 0, 2);
    gl.disableVertexAttribArray(drawLineProgram.colorAttribute);
    gl.disableVertexAttribArray(drawLineProgram.vertexPositionAttribute);
  }

  drawPhasedArray(x: number, y: number, x2: number, y2: number, f1: number, f2: number) {
    const { gl, sourceBuffer, colorBuffer, srcCoords, shaderProgramMode } = this;

    var rttFramebuffer = this.renderTexture1.framebuffer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, rttFramebuffer);
    gl.viewport(0, 0, rttFramebuffer.width || 0, rttFramebuffer.height || 0);
    gl.colorMask(true, true, false, false);
    gl.useProgram(shaderProgramMode);

    gl.bindBuffer(gl.ARRAY_BUFFER, sourceBuffer);
    srcCoords[0] = x;
    srcCoords[1] = y;
    srcCoords[2] = x2;
    srcCoords[3] = y2;
    let colors = [f1, Math.PI / 2, 0, 0, f2, Math.PI / 2, 0, 0];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(srcCoords), gl.STATIC_DRAW);
    gl.vertexAttribPointer(
      shaderProgramMode.vertexPositionAttribute,
      sourceBuffer.itemSize || 0,
      gl.FLOAT,
      false,
      0,
      0
    );

    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
    gl.vertexAttribPointer(
      shaderProgramMode.colorAttribute,
      colorBuffer.itemSize || 0,
      gl.FLOAT,
      false,
      0,
      0
    );

    this.loadMatrix(this.pMatrix);
    this.setMatrixUniforms(shaderProgramMode);
    gl.enableVertexAttribArray(shaderProgramMode.vertexPositionAttribute);
    gl.enableVertexAttribArray(shaderProgramMode.colorAttribute);
    gl.drawArrays(gl.LINES, 0, 2);
    gl.disableVertexAttribArray(shaderProgramMode.vertexPositionAttribute);
    gl.disableVertexAttribArray(shaderProgramMode.colorAttribute);

    gl.colorMask(true, true, true, true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    //mvPopMatrix();
  }

  drawPoke(x: number, y: number) {
    const { gl, shaderProgramDraw, sourceBuffer, colorBuffer } = this;
    const rttFramebuffer = this.renderTexture1.framebuffer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, rttFramebuffer);
    gl.viewport(0, 0, rttFramebuffer.width || 0, rttFramebuffer.height || 0);
    gl.colorMask(true, true, false, false);

    gl.useProgram(shaderProgramDraw);
    gl.vertexAttrib4f(shaderProgramDraw.colorAttribute, 1.0, 0.0, 0.0, 1.0);

    gl.bindBuffer(gl.ARRAY_BUFFER, sourceBuffer);
    const verts = [x, y];
    const colors = [1, 0, 0, 1];
    const steps = 8;
    const r = 6;
    for (let i = 0; i !== steps + 1; i++) {
      var ang = (Math.PI * 2 * i) / steps;
      verts.push(x + r * Math.cos(ang), y + r * Math.sin(ang));
      colors.push(0, 0, 0, 0);
    }
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.vertexAttribPointer(
      shaderProgramDraw.vertexPositionAttribute,
      sourceBuffer.itemSize || 0,
      gl.FLOAT,
      false,
      0,
      0
    );
    gl.enableVertexAttribArray(shaderProgramDraw.vertexPositionAttribute);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
    gl.vertexAttribPointer(shaderProgramDraw.colorAttribute, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shaderProgramDraw.colorAttribute);

    this.loadMatrix(this.pMatrix);
    this.setMatrixUniforms(this.shaderProgramDraw);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 2 + steps);
    gl.disableVertexAttribArray(shaderProgramDraw.vertexPositionAttribute);
    gl.disableVertexAttribArray(shaderProgramDraw.colorAttribute);

    gl.colorMask(true, true, true, true);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  drawEllipse(cx: number, cy: number, xr: number, yr: number) {
    const { gl, shaderProgramDraw, sourceBuffer } = this;
    this.setupForDrawing(0);
    gl.bindBuffer(gl.ARRAY_BUFFER, sourceBuffer);
    var coords = [];

    for (let i = -xr; i <= xr; i++) {
      coords.push(cx - i, cy - yr * Math.sqrt(1 - (i * i) / (xr * xr)));
    }
    for (let i = xr - 1; i >= -xr; i--) {
      coords.push(cx - i, cy + yr * Math.sqrt(1 - (i * i) / (xr * xr)));
    }
    coords.push(coords[0], coords[1]);
    //        console.log("coords for ellipse: " + coords);
    coords = thickLinePoints(coords, 1.5);
    //        gl.lineWidth(4);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(coords), gl.STATIC_DRAW);
    gl.vertexAttribPointer(
      shaderProgramDraw.vertexPositionAttribute,
      sourceBuffer.itemSize || 0,
      gl.FLOAT,
      false,
      0,
      0
    );

    gl.enableVertexAttribArray(shaderProgramDraw.vertexPositionAttribute);

    this.loadMatrix(this.pMatrix);
    this.setMatrixUniforms(shaderProgramDraw);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, coords.length / 2);
    gl.disableVertexAttribArray(shaderProgramDraw.vertexPositionAttribute);
    //        gl.lineWidth(1);

    gl.colorMask(true, true, true, true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  drawParabola(x1: number, y1: number, w: number, h: number) {
    const { gl, shaderProgramDraw, sourceBuffer } = this;
    this.setupForDrawing(0);
    gl.bindBuffer(gl.ARRAY_BUFFER, sourceBuffer);
    var coords = [];
    var i;
    var w2 = w / 2;
    var a = h / (w2 * w2);
    for (i = 0; i <= w; i++) {
      var x0 = i - w2;
      coords.push(x1 + i, y1 + h - a * x0 * x0);
    }
    coords = thickLinePoints(coords, 1.5);
    //        gl.lineWidth(4);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(coords), gl.STATIC_DRAW);
    gl.vertexAttribPointer(
      shaderProgramDraw.vertexPositionAttribute,
      sourceBuffer.itemSize || 0,
      gl.FLOAT,
      false,
      0,
      0
    );

    gl.enableVertexAttribArray(shaderProgramDraw.vertexPositionAttribute);

    this.loadMatrix(this.pMatrix);
    this.setMatrixUniforms(shaderProgramDraw);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, coords.length / 2);
    gl.disableVertexAttribArray(shaderProgramDraw.vertexPositionAttribute);
    //        gl.lineWidth(1);

    gl.colorMask(true, true, true, true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  drawLens(x1: number, y1: number, w: number, h: number, m: number) {
    const { gl, shaderProgramDraw, sourceBuffer } = this;
    this.setupForDrawing(m);
    gl.bindBuffer(gl.ARRAY_BUFFER, sourceBuffer);
    const w2 = w / 2;
    const coords = [x1 + w2, y1 + h];
    const ym = h / (Math.sqrt(2) - 1);
    for (let i = 0; i <= w; i++) {
      var x = (i - w2) / w2;
      var y = ym * (Math.sqrt(1 + x * x) - 1);
      coords.push(x1 + i, y1 + y);
    }
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(coords), gl.STATIC_DRAW);
    gl.vertexAttribPointer(
      shaderProgramDraw.vertexPositionAttribute,
      sourceBuffer.itemSize || 0,
      gl.FLOAT,
      false,
      0,
      0
    );

    gl.enableVertexAttribArray(shaderProgramDraw.vertexPositionAttribute);

    this.loadMatrix(this.pMatrix);
    this.setMatrixUniforms(shaderProgramDraw);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, coords.length / 2);
    gl.disableVertexAttribArray(shaderProgramDraw.vertexPositionAttribute);

    gl.colorMask(true, true, true, true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  drawSolidEllipse(cx: number, cy: number, xr: number, yr: number, med: number) {
    const { gl, shaderProgramDraw, sourceBuffer } = this;
    this.setupForDrawing(med);
    gl.bindBuffer(gl.ARRAY_BUFFER, sourceBuffer);
    const coords = [cx, cy];
    for (let i = -xr; i <= xr; i++) {
      coords.push(cx - i, cy - yr * Math.sqrt(1 - (i * i) / (xr * xr)));
    }
    for (let i = xr - 1; i >= -xr; i--) {
      coords.push(cx - i, cy + yr * Math.sqrt(1 - (i * i) / (xr * xr)));
    }
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(coords), gl.STATIC_DRAW);
    gl.vertexAttribPointer(
      shaderProgramDraw.vertexPositionAttribute,
      sourceBuffer.itemSize || 0,
      gl.FLOAT,
      false,
      0,
      0
    );

    gl.enableVertexAttribArray(shaderProgramDraw.vertexPositionAttribute);

    this.loadMatrix(this.pMatrix);
    this.setMatrixUniforms(shaderProgramDraw);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, coords.length / 2);
    gl.disableVertexAttribArray(shaderProgramDraw.vertexPositionAttribute);

    gl.colorMask(true, true, true, true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  drawMedium(
    x: number,
    y: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    x4: number,
    y4: number,
    m1: number,
    m2: number
  ) {
    const { gl, shaderProgramDraw, sourceBuffer, colorBuffer } = this;
    let rttFramebuffer = this.renderTexture1.framebuffer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, rttFramebuffer);
    gl.viewport(0, 0, rttFramebuffer.width || 0, rttFramebuffer.height || 0);
    gl.colorMask(false, false, true, false);
    //		gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(shaderProgramDraw);

    var medCoords = [x, y, x2, y2, x3, y3, x4, y4];
    var colors = [0, 0, m1, 1, 0, 0, m1, 1, 0, 0, m2, 1, 0, 0, m2, 1];
    gl.bindBuffer(gl.ARRAY_BUFFER, sourceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(medCoords), gl.STATIC_DRAW);
    gl.vertexAttribPointer(
      shaderProgramDraw.vertexPositionAttribute,
      sourceBuffer.itemSize || 0,
      gl.FLOAT,
      false,
      0,
      0
    );

    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
    gl.vertexAttribPointer(shaderProgramDraw.colorAttribute, colorBuffer.itemSize || 0, gl.FLOAT, false, 0, 0);

    this.loadMatrix(this.pMatrix);
    this.setMatrixUniforms(shaderProgramDraw);
    gl.enableVertexAttribArray(shaderProgramDraw.vertexPositionAttribute);
    gl.enableVertexAttribArray(shaderProgramDraw.colorAttribute);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(shaderProgramDraw.vertexPositionAttribute);
    gl.disableVertexAttribArray(shaderProgramDraw.colorAttribute);

    gl.colorMask(true, true, true, true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  drawModes(x: number, y: number, x2: number, y2: number, a: number, b: number, c: number, d: number) {
    const { gl, shaderProgramMode, sourceBuffer, colorBuffer } = this;
    var rttFramebuffer = this.renderTexture1.framebuffer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, rttFramebuffer);
    gl.viewport(0, 0, rttFramebuffer.width || 0, rttFramebuffer.height || 0);
    gl.colorMask(true, true, false, false);
    //		gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(shaderProgramMode);
    var z = 0;
    var z2 = 0;
    if (this.acoustic) {
      z = Math.PI / 2;
      a += z;
      b += z;
      if (c || d) {
        z2 = z;
        c += z;
        d += z;
      }
    }

    var medCoords = [x, y, x, y2, x2, y, x2, y2];
    var colors = [z, z, z2, z2, z, b, z2, d, a, z, c, z2, a, b, c, d];
    gl.bindBuffer(gl.ARRAY_BUFFER, sourceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(medCoords), gl.STATIC_DRAW);
    gl.vertexAttribPointer(
      shaderProgramMode.vertexPositionAttribute,
      sourceBuffer.itemSize || 0,
      gl.FLOAT,
      false,
      0,
      0
    );

    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
    gl.vertexAttribPointer(shaderProgramMode.colorAttribute, colorBuffer.itemSize || 0, gl.FLOAT, false, 0, 0);

    this.loadMatrix(this.pMatrix);
    this.setMatrixUniforms(shaderProgramMode);
    gl.enableVertexAttribArray(shaderProgramMode.vertexPositionAttribute);
    gl.enableVertexAttribArray(shaderProgramMode.colorAttribute);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(shaderProgramMode.vertexPositionAttribute);
    gl.disableVertexAttribArray(shaderProgramMode.colorAttribute);

    gl.colorMask(true, true, true, true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  drawTriangle(x: number, y: number, x2: number, y2: number, x3: number, y3: number, m: number) {
    const { gl, shaderProgramDraw, sourceBuffer } = this;
    var rttFramebuffer = this.renderTexture1.framebuffer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, rttFramebuffer);
    gl.viewport(0, 0, rttFramebuffer.width || 0, rttFramebuffer.height || 0);
    gl.colorMask(false, false, true, false);
    //		gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(shaderProgramDraw);
    //        console("draw triangle " + m);
    gl.vertexAttrib4f(shaderProgramDraw.colorAttribute, 0.0, 0.0, m, 1.0);

    var medCoords = [x, y, x2, y2, x3, y3];
    gl.bindBuffer(gl.ARRAY_BUFFER, sourceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(medCoords), gl.STATIC_DRAW);
    gl.vertexAttribPointer(
      shaderProgramDraw.vertexPositionAttribute,
      sourceBuffer.itemSize || 0,
      gl.FLOAT,
      false,
      0,
      0
    );

    this.loadMatrix(this.pMatrix);
    this.setMatrixUniforms(shaderProgramDraw);
    gl.enableVertexAttribArray(shaderProgramDraw.vertexPositionAttribute);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 3);
    gl.disableVertexAttribArray(shaderProgramDraw.vertexPositionAttribute);

    gl.colorMask(true, true, true, true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  getProbeValue(x: number, y: number): number {
    const { gl } = this;
    var rttFramebuffer = this.renderTexture1.framebuffer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, rttFramebuffer);
    gl.viewport(0, 0, rttFramebuffer.width || 0, rttFramebuffer.height || 0);
    var pixels = new Float32Array(4);
    gl.readPixels(
      this.windowOffsetX + x,
      this.gridSizeY - this.windowOffsetY - y - 1,
      1,
      1,
      gl.RGBA,
      gl.FLOAT,
      pixels
    );
    return pixels[0];
    //console.log("got pixel data " + pixels);
  }
}

export default RippleSim;
