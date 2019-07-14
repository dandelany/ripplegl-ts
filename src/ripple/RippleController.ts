import RippleSim from "./ripple";

import {COLOR_SCHEMES, WAVE_TYPES} from './constants';
import Source from "./objects/Source";

const sourceRadius = 17;
const freqMult = .0233333 * 5;

const mediumMax = 191;
const mediumMaxIndex = .5;
const SWF_SIN = 0;
const SWF_SQUARE = 1;
const SWF_PULSE = 2;
const timeStep = .25;

export default class RippleController {
  sim: RippleSim;
  t: number = 0;
  iters: number = 0;
  dampcoef: number = 1;

  lengthScale: number = 0;
  waveSpeed: number = 0;

  dragObjects: any[];
  
  changedWalls: boolean = false;

  timer: number | null = null;
  
  constructor(canvas: HTMLCanvasElement) {
    this.sim = new RippleSim(canvas);
    this.t = 0;
    this.iters = 0;

    this.dragObjects = [];

    // setCanvasSize();
    //int res = 512;
    this.setResolution();


    // todo load state from URL query parameters (QueryParameters)
    // todo warn on unsupported canvas/webgl

    //schemeColors = new Color[20][8];
    // 		if (colorChooser.getItemCount() == 0)
    // 		    addDefaultColorScheme();
    this.setWaveType();
    this.setDamping();

    this.reinit();
    // set3dViewZoom(zoom3d);
    // setCanvasSize();

    this.sim.setColorScheme(COLOR_SCHEMES[0]);

  }
  start() {
    console.log('hi')
    this.timer = window.setInterval(() => {
      // console.log('hi');
      this.updateRipple();
    }, 50);


  }
  
  reinit(setup: boolean = true) {
    // sourceCount = -1;
    // console.log("reinit " + gridSizeX + " " + gridSizeY + "\n");
    // gridSizeXY = gridSizeX * gridSizeY;
    if (setup)
      this.doSetup();
  }

  resetTime() {
    this.t = 0;
    this.iters = 0;
  }
  doSetup() {
    // if (setupList.size() == 0)
    //   return;
    this.resetTime();
    // if (resBar.getValue() < 32)
    //   setResolution(32);
    this.sim.doBlank();
    // deleteAllObjects();
    // dampingBar.setValue(10);
    // setFreqBar(5);
    // setBrightness(10);
    // waveChooser.setSelectedIndex(1);
    this.setWaveType();
    // setup = (Setup) setupList.elementAt(setupChooser.getSelectedIndex());

    // setup.select();
    this.readImport();

    this.setDamping();
    // enableDisableUI();
  }

  readImport(retain: boolean = false) {
    if (!retain) {
      this.sim.doBlank();
      this.resetTime();
      // this.deleteAllObjects();
    }
    // todo - read import string and parse it
    // first line starts with $ and denotes general setup options
    // other lines are objects

    const obj = this.createObj();
    this.dragObjects = [obj];

    this.setDamping();
    this.wallsChanged();
    // this.enableDisableUI();
  }

  createObj() {
    return new Source(this);
  }

  wallsChanged() {
    this.changedWalls = true;
  }

  // set length scale and speed for a particular wave type, which determines what units we report
  // in coordinates box and editing values.  Also, choice of sound/non-sound affects boundary conditions
  // at walls.
  setWaveType() {
    // todo plug this in;
    const waveTypeIndex = 0;
    const waveType = WAVE_TYPES[waveTypeIndex];
    this.waveSpeed = waveType.waveSpeed;
    this.lengthScale = waveType.windowScale / 512;
  }
  prepareObjects() {
    const {sim, dragObjects} = this;
    sim.doBlankWalls();
    this.setAcoustic(false); // todo

    for (let i = 0; i != this.dragObjects.length; i++) {
      const obj = dragObjects[i];
      // double xform[] = obj.transform;
      // setTransform(xform[0], xform[1], xform[2], xform[3], xform[4], xform[5]);
      if(obj.prepare) obj.prepare();
    }
    sim.setTransform(1, 0, 0, 0, 1, 0);
  }

  updateRipple() {
    const {sim, dragObjects} = this;
    if (this.changedWalls) {
      this.prepareObjects();
      this.changedWalls = false;
    }

    // todo get from speedBar
    const iterCount = 10;
    // dont run if stopped
    // if (stoppedCheck.getState())
    //   iterCount = 0;
    
    // this.setAcoustic(waveChooser.getSelectedIndex() == WAVE_SOUND);
    
    for (let i = 0; i != iterCount; i++) {
      sim.simulate();
      this.t += timeStep;
      for (let j = 0; j != dragObjects.length; j++) {
          dragObjects[j].run();
      }

      this.iters++;
    }
    
    const is3D = false;
    //brightMult = Math.exp(brightnessBar.getValue() / 100. - 5.);
    // this.updateRippleGL(brightMult, view3dCheck.getState());
    //todo 3d
    const brightness = 0.5;
    sim.updateRipple(6.8);
    
    if (!is3D) {
      // for (i = 0; i != dragObjects.size(); i++) {
      //   DragObject obj = dragObjects.get(i);
      //   setDrawingColor(1, 1, 0, .5);
      //   if (obj.selected)
      //     setDrawingSelection(.6+.4*Math.sin(t*.2));
      //   else
      //     setDrawingSelection(-1);
      //   double xform[] = obj.transform;
      //   setTransform(xform[0], xform[1], xform[2], xform[3], xform[4], xform[5]);
      //   obj.draw();
      // }
      sim.setTransform(1, 0, 0, 0, 1, 0);
      
      // this.setDrawingSelection(-1);
      // this.doCoordsLabel();
    }
  }

  setDamping() {
    /*
     * int i; double damper = dampingBar.getValue() * .00002;// was 5
     * dampcoef = Math.exp(-damper);
     */
    this.dampcoef = 1;
  }

  setAcoustic(ac: boolean) {
		this.sim.acoustic = ac;
	}

  setDrawingSelection(ds: number) {
		this.sim.drawingSelection = ds;
	}

  setDrawingColor(r: number, g: number, b: number, a: number) {
		this.sim.drawingColor = [ r, g, b, a ];
	}

  setResolution(size: number = 512, border: number = 0): void {
    const {sim} = this;
    const oldSize = this.sim.windowWidth;
    if(size === oldSize && border === 0)
      return;

    if (border == 0) {
      border = Math.max(20, size / 8);
    }
    const windowWidth = size;
    const windowHeight = size;
    const windowOffsetX  = border;
    const windowOffsetY = border;
    const gridSizeX = windowWidth + windowOffsetX * 2;
    const gridSizeY = windowHeight + windowOffsetY * 2;

    // todo are these necessary??
    // const windowBottom = windowOffsetY + windowHeight - 1;
    // const windowRight = windowOffsetX + windowWidth - 1;

    sim.setResolution(gridSizeX, gridSizeY, windowOffsetX, windowOffsetY);

    for (let i = 0; i != this.dragObjects.length; i++) {
      const obj = this.dragObjects[i];
      // obj.rescale(windowWidth/(double)oldWidth);
    }
    this.changedWalls = true;
}


}