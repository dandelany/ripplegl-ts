attribute vec3 aVertexPosition;
attribute vec2 aTextureCoord;
attribute float aDamping;

uniform mat4 uMVMatrix;
uniform mat4 uPMatrix;

varying vec2 vTextureCoord;
varying vec4 vPosition;
varying float vDamping;


void main(void) {
    vPosition = uMVMatrix * vec4(aVertexPosition, 1.0);
    gl_Position = uPMatrix * vPosition;
    vTextureCoord = aTextureCoord;
    vDamping = aDamping;
}
