#define TS_COL_WALL 0
#define TS_COL_POS 1
#define TS_COL_NEG 2
#define TS_COL_NEUTRAL 3
#define TS_COL_POS_MED 4
#define TS_COL_NEG_MED 5
#define TS_COL_MED 6
#define TS_COL_SOURCE 7
#define TS_COL_COUNT  9

precision mediump float;

varying vec2 vTextureCoord;
varying vec4 vPosition;

uniform sampler2D uSampler;
uniform float brightness;
uniform lowp vec3 colors[TS_COL_COUNT];

// shader for displaying waves on screen
void main(void) {
    float alpha = 1.0;
    vec4 textureColor = texture2D(uSampler, vec2(vTextureCoord.s, vTextureCoord.t));

    // blue channel used to store walls/media
    float med = textureColor.b;
    vec3 col;
    if (med == 0.0)
    col = colors[TS_COL_WALL];
    else {
        // red channel used to store wave height
        float r =  textureColor.r*brightness;
        r = clamp(r, -1., 1.);
        if (r > 0.0)
        col = mix(mix(colors[TS_COL_MED], colors[TS_COL_NEUTRAL], med),
        mix(colors[TS_COL_POS_MED], colors[TS_COL_POS], med), r);
        else
        col = mix(mix(colors[TS_COL_MED], colors[TS_COL_NEUTRAL], med),
        mix(colors[TS_COL_NEG_MED], colors[TS_COL_NEG], med), -r);
    }
    gl_FragColor = vec4(col, 1.);
}
