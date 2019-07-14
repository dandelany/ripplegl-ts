// shader for running simulation
precision mediump float;

varying vec2 vTextureCoord;
varying vec4 vPosition;
varying float vDamping;

uniform sampler2D uSampler;
uniform float stepSizeX;
uniform float stepSizeY;

// get wave value for adjacent square, handling walls properly depending on acoustic flag
highp float getSquare(highp vec2 offset)
{
    highp vec2 x = offset+vTextureCoord;
    highp vec4 pv = texture2D(uSampler, x);
    if (pv.b > 0.0)
    return pv.r;
    #ifdef ACOUSTIC
    return texture2D(uSampler, vTextureCoord-offset).r;
    #else
    return 0.0;
    #endif
}

void main()
{
    highp float newvel = 0.;
    highp float newpos = 0.;
    highp vec4 pv = texture2D(uSampler, vTextureCoord);
    if (pv.b > 0.0) {
        highp float pos = pv.r;
        highp float vel = pv.g;
        highp float mid1 = getSquare(vec2(stepSizeX, 0.));
        highp float mid2 = getSquare(vec2(-stepSizeX, 0.));
        highp float mid3 = getSquare(vec2(0., stepSizeY));
        highp float mid4 = getSquare(vec2(0., -stepSizeY));
        highp float mid = .25*(mid1+mid2+mid3+mid4); // equilibrium position is average of neighbors
        highp float med = pv.b;
        med *= 1.5;
        newvel = med*(mid-pos)+vel*vDamping;
        newpos = pos+newvel;
    }
    // update position and velocity
    gl_FragColor = vec4(newpos, newvel, pv.b, 1.);
}
