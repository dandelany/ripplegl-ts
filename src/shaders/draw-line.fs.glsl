precision mediump float;

//varying vec4 vPosition;
varying vec4 vColor;

void main(void) {
    gl_FragColor = vec4(vColor.r * exp(-vColor.a*vColor.a), 0., 1., 0.);
}
