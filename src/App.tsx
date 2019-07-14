import React from 'react';
import logo from './logo.svg';
import './App.css';

// import RippleSim from "./ripple/ripple";
import RippleController from "./ripple/RippleController";


// verticalPanel.add(setupChooser);
// verticalPanel.add(waveChooser);
// verticalPanel.add(colorChooser);
// verticalPanel.add(blankButton = new Button("Clear Waves"));
// verticalPanel.add(stoppedCheck = new Checkbox("Stopped"));
// verticalPanel.add(view3dCheck = new Checkbox("3-D View"));


class App extends React.Component {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  sim?: RippleController;

  constructor(props: {}) {
    super(props);
    this.canvasRef = React.createRef();
  }
  componentDidMount() {
    const canvas = this.canvasRef.current;
    console.log('canvas', canvas);
    if(!canvas) return;
    this.sim = new RippleController(canvas);
    console.log(this.sim);
    this.sim.start();
  }

  render() {
    return (
      <div className="App">
        <header className="App-header">
          <canvas width={512} height={512} ref={this.canvasRef}/>
        </header>
      </div>
    );
  }
}

export default App;
