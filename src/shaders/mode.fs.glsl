precision mediump float;

varying vec4 vPosition;
varying vec4 vColor;

void main(void) {
    // used to paint mode boxes
    gl_FragColor = vec4(sin(vColor.r)*sin(vColor.g)+sin(vColor.b)*sin(vColor.a), 0., 0., 0.);
}
