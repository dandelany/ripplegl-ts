#define TS_COL_WALL 0
#define TS_COL_POS 1
#define TS_COL_NEG 2

#define TS_COL_POS_MED 4
#define TS_COL_NEG_MED 5
#define TS_COL_MED 6
#define TS_COL_SOURCE 7
#define TS_COL_NEUTRAL 8
#define TS_COL_COUNT 9

attribute highp vec2 aTextureCoord;
uniform mat4 uMVMatrix;
uniform mat4 uPMatrix;
uniform highp float xOffset;

varying vec2 vTextureCoord;
varying vec4 vPosition;
varying vec4 vColor;
uniform sampler2D uSampler;
uniform float brightness;
uniform lowp vec3 colors[TS_COL_COUNT];

void main(void) {
    highp vec2 tc  = vec2(aTextureCoord.x+xOffset, aTextureCoord.y);
    vec4 pv = texture2D(uSampler, tc);
    float r =  pv.r*brightness;
    vPosition = uMVMatrix * vec4(-1.0+2.0*tc.x, -1.0+2.0*tc.y, r, 1.0);
    gl_Position = uPMatrix * vPosition;
    vTextureCoord = tc;
    float med = pv.b;
    vec3 col;
    if (med == 0.0)
    col = colors[TS_COL_WALL];
    else {
        // calculate normal
        float qx = texture2D(uSampler, vec2(aTextureCoord.x+xOffset+1./200., aTextureCoord.y)).r-pv.r;
        float qy = texture2D(uSampler, vec2(aTextureCoord.x+xOffset, aTextureCoord.y+1./200.)).r-pv.r;
        qx *= brightness;  qy *= brightness;

        // calculate lighting
        float normdot = (qx+qy+0.1)*(1./1.73)/length(vec3(qx, qy, 0.1));
        r = 40.*clamp(r, -1., 1.);
        if (r > 0.0)
        col = mix(mix(colors[TS_COL_MED], colors[TS_COL_NEUTRAL], med),
        mix(colors[TS_COL_POS_MED], colors[TS_COL_POS], med), r);
        else
        col = mix(mix(colors[TS_COL_MED], colors[TS_COL_NEUTRAL], med),
        mix(colors[TS_COL_NEG_MED], colors[TS_COL_NEG], med), -r);
        col = mix(col, vec3(1., 1., 1.), normdot);
    }
    vColor = vec4(col, 1.);

}
