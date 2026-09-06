/* ==========================================================================
   SPACIAL AXIS - v0.1
   A procedural solar system and galaxy explorer
   ========================================================================== */

(function() {
    'use strict';

    // -------------------------------------------------------------------------
    // Utility: Simplex-like noise for procedural textures
    // -------------------------------------------------------------------------
    function mulberry32(seed) {
        return function() {
            seed |= 0; seed = seed + 0x6D2B79F5 | 0;
            let t = seed;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    function makeNoise2D(seed) {
        const rand = mulberry32(seed);
        const perm = new Uint8Array(512);
        const p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) p[i] = i;
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [p[i], p[j]] = [p[j], p[i]];
        }
        for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

        function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
        function lerp(a, b, t) { return a + t * (b - a); }
        function grad(h, x, y) {
            const u = (h & 1) ? -x : x;
            const v = (h & 2) ? -y : y;
            return u + v;
        }

        return function noise2D(x, y) {
            const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
            x -= Math.floor(x); y -= Math.floor(y);
            const u = fade(x), v = fade(y);
            const A = perm[X] + Y, B = perm[X + 1] + Y;
            return lerp(
                lerp(grad(perm[A], x, y), grad(perm[B], x - 1, y), u),
                lerp(grad(perm[A + 1], x, y - 1), grad(perm[B + 1], x - 1, y - 1), u),
                v
            );
        };
    }

    function fbm(noise, x, y, octaves, lacunarity, gain) {
        let val = 0, amp = 1, freq = 1, max = 0;
        for (let i = 0; i < octaves; i++) {
            val += amp * noise(x * freq, y * freq);
            max += amp;
            amp *= gain;
            freq *= lacunarity;
        }
        return val / max;
    }

    // -------------------------------------------------------------------------
    // Procedural texture generation
    // -------------------------------------------------------------------------
    function createCanvas(w, h) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        return { canvas: c, ctx: c.getContext('2d') };
    }

    function createStarTexture() {
        const size = 512;
        const { canvas, ctx } = createCanvas(size, size);
        const noise = makeNoise2D(12345);
        const img = ctx.createImageData(size, size);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const u = x / size, v = y / size;
                const dx = u - 0.5, dy = v - 0.5;
                const dist = Math.sqrt(dx*dx + dy*dy) * 2;
                
                let n = fbm((a,b)=>noise(a*6, b*6), u, v, 6, 2.0, 0.5);
                n = (n + 1) * 0.5;
                
                let n2 = fbm((a,b)=>noise(a*15, b*15), u+100, v+100, 4, 2.0, 0.5);
                n2 = (n2 + 1) * 0.5;
                
                const sunspots = fbm((a,b)=>noise(a*3, b*3), u+50, v+50, 4, 2.0, 0.5);
                const spotMask = Math.max(0, sunspots - 0.1) * 2;
                
                let r = 255, g = 200, b = 100;
                if (dist < 1) {
                    const edge = 1 - dist * dist;
                    r = Math.min(255, 255 * edge + 50);
                    g = Math.min(255, (180 + n*60 - spotMask*60) * edge);
                    b = Math.min(255, (60 + n2*40) * edge * edge);
                } else {
                    r = g = b = 0;
                }
                
                const i = (y * size + x) * 4;
                img.data[i]   = Math.max(0, Math.min(255, r));
                img.data[i+1] = Math.max(0, Math.min(255, g));
                img.data[i+2] = Math.max(0, Math.min(255, b));
                img.data[i+3] = dist < 1 ? 255 : 0;
            }
        }
        ctx.putImageData(img, 0, 0);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    function createRockyTexture(seed, baseColors, roughness, craterDensity) {
        const size = 1024;
        const { canvas, ctx } = createCanvas(size, size);
        const noise = makeNoise2D(seed);
        const craterNoise = makeNoise2D(seed + 777);
        const img = ctx.createImageData(size, size);
        
        function lerpColor(c1, c2, t) {
            return [
                c1[0] + (c2[0]-c1[0])*t,
                c1[1] + (c2[1]-c1[1])*t,
                c1[2] + (c2[2]-c1[2])*t
            ];
        }

        const rand = mulberry32(seed + 999);
        const craters = [];
        for (let i = 0; i < craterDensity; i++) {
            craters.push({
                x: rand(), y: rand(),
                r: 0.005 + rand() * 0.04,
                depth: 0.3 + rand() * 0.7
            });
        }

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const u = x / size, v = y / size;
                
                let n = fbm((a,b)=>noise(a*8,b*8), u, v, 7, 2.1, 0.5);
                n = (n + 1) * 0.5;
                
                let fine = fbm((a,b)=>noise(a*40,b*40), u, v, 4, 2.0, 0.5);
                fine = (fine + 1) * 0.5;
                
                let craterVal = 0;
                for (const c of craters) {
                    const dx = u - c.x, dy = v - c.y;
                    const d = Math.sqrt(dx*dx + dy*dy);
                    if (d < c.r) {
                        const t = d / c.r;
                        craterVal -= c.depth * (1 - t*t) * 0.3;
                        if (t > 0.7) craterVal += c.depth * (t - 0.7) * 2;
                    }
                }
                
                let tColor = n + craterVal + (fine - 0.5) * roughness * 0.2;
                tColor = Math.max(0, Math.min(1, tColor));
                
                let col;
                if (tColor < 0.33) {
                    col = lerpColor(baseColors[0], baseColors[1], tColor / 0.33);
                } else if (tColor < 0.66) {
                    col = lerpColor(baseColors[1], baseColors[2], (tColor-0.33)/0.33);
                } else {
                    col = lerpColor(baseColors[2], baseColors[3], (tColor-0.66)/0.34);
                }
                
                const light = 0.85 + (n - 0.5) * 0.3 + craterVal;
                
                const i = (y * size + x) * 4;
                img.data[i]   = Math.max(0, Math.min(255, col[0] * light));
                img.data[i+1] = Math.max(0, Math.min(255, col[1] * light));
                img.data[i+2] = Math.max(0, Math.min(255, col[2] * light));
                img.data[i+3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    function createEarthTexture(seed) {
        const size = 1024;
        const { canvas, ctx } = createCanvas(size, size);
        const noise = makeNoise2D(seed);
        const img = ctx.createImageData(size, size);
        
        const deepOcean = [15, 30, 80];
        const shallowOcean = [40, 90, 160];
        const beach = [194, 178, 128];
        const grass = [50, 120, 50];
        const forest = [30, 80, 30];
        const mountain = [100, 90, 70];
        const snow = [240, 245, 255];
        const desert = [200, 170, 110];

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const u = x / size, v = y / size;
                const lat = Math.abs(v - 0.5) * 2;
                
                let continent = fbm((a,b)=>noise(a*4,b*8), u, v, 7, 2.2, 0.5);
                continent = (continent + 1) * 0.5;
                
                let detail = fbm((a,b)=>noise(a*20,b*20), u+50, v+50, 5, 2.0, 0.5);
                detail = (detail + 1) * 0.5;
                
                let elevation = continent + (detail - 0.5) * 0.15;
                
                const polar = lat > 0.75;
                const polarT = Math.min(1, (lat - 0.75) / 0.15);
                
                let r, g, b;
                if (elevation < 0.42) {
                    const t = elevation / 0.42;
                    r = deepOcean[0] + (shallowOcean[0]-deepOcean[0])*t;
                    g = deepOcean[1] + (shallowOcean[1]-deepOcean[1])*t;
                    b = deepOcean[2] + (shallowOcean[2]-deepOcean[2])*t;
                } else if (elevation < 0.46) {
                    r = beach[0]; g = beach[1]; b = beach[2];
                } else if (elevation < 0.6) {
                    const desertBias = (lat > 0.2 && lat < 0.4) ? 0.3 : 0;
                    if (desertBias > 0 && detail > 0.5) {
                        r = desert[0] + (detail-0.5)*40;
                        g = desert[1] + (detail-0.5)*20;
                        b = desert[2];
                    } else {
                        r = grass[0] + (forest[0]-grass[0])*(1-detail);
                        g = grass[1] + (forest[1]-grass[1])*(1-detail);
                        b = grass[2] + (forest[2]-grass[2])*(1-detail);
                    }
                } else if (elevation < 0.75) {
                    const t = (elevation-0.6)/0.15;
                    r = forest[0] + (mountain[0]-forest[0])*t;
                    g = forest[1] + (mountain[1]-forest[1])*t;
                    b = forest[2] + (mountain[2]-forest[2])*t;
                } else {
                    const t = Math.min(1, (elevation-0.75)/0.1);
                    r = mountain[0] + (snow[0]-mountain[0])*t;
                    g = mountain[1] + (snow[1]-mountain[1])*t;
                    b = mountain[2] + (snow[2]-mountain[2])*t;
                }
                
                if (polar) {
                    r = r + (snow[0]-r)*polarT;
                    g = g + (snow[1]-g)*polarT;
                    b = b + (snow[2]-b)*polarT;
                }
                
                const cloudN = fbm((a,b)=>noise(a*6+200,b*6+200), u*1.5, v, 5, 2.0, 0.5);
                const cloud = Math.max(0, (cloudN + 0.2) * 0.8);
                
                r = r + (255-r)*cloud*0.5;
                g = g + (255-g)*cloud*0.5;
                b = b + (255-b)*cloud*0.5;

                const i = (y * size + x) * 4;
                img.data[i]   = Math.max(0, Math.min(255, r));
                img.data[i+1] = Math.max(0, Math.min(255, g));
                img.data[i+2] = Math.max(0, Math.min(255, b));
                img.data[i+3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    function createEarthBump(seed) {
        const size = 512;
        const { canvas, ctx } = createCanvas(size, size);
        const noise = makeNoise2D(seed);
        const img = ctx.createImageData(size, size);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const u = x/size, v = y/size;
                let n = fbm((a,b)=>noise(a*4,b*8), u, v, 7, 2.2, 0.5);
                n = (n + 1) * 0.5;
                const val = n > 0.45 ? Math.min(255, (n-0.42)*600) : n*30;
                const i = (y*size+x)*4;
                img.data[i]=img.data[i+1]=img.data[i+2]=val;
                img.data[i+3]=255;
            }
        }
        ctx.putImageData(img, 0, 0);
        return new THREE.CanvasTexture(canvas);
    }

    function createEarthClouds(seed) {
        const size = 512;
        const { canvas, ctx } = createCanvas(size, size);
        const noise = makeNoise2D(seed + 42);
        const img = ctx.createImageData(size, size);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const u = x/size, v = y/size;
                let n = fbm((a,b)=>noise(a*6,b*6), u*2, v, 6, 2.0, 0.5);
                n = (n + 1) * 0.5;
                let alpha = Math.max(0, (n - 0.45)) * 2.5;
                alpha = Math.min(1, alpha);
                const lat = Math.abs(v-0.5)*2;
                if (lat > 0.7) alpha *= (1 - (lat-0.7)/0.3);
                const i = (y*size+x)*4;
                img.data[i] = img.data[i+1] = img.data[i+2] = 255;
                img.data[i+3] = alpha * 220;
            }
        }
        ctx.putImageData(img, 0, 0);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    function createGasGiantTexture(seed, bands, hasStorms, stormCount) {
        const size = 1024;
        const { canvas, ctx } = createCanvas(size, size / 2);
        const w = size, h = size / 2;
        const noise = makeNoise2D(seed);
        const stormNoise = makeNoise2D(seed + 123);
        const img = ctx.createImageData(w, h);
        
        const rand = mulberry32(seed + 555);
        const storms = [];
        if (hasStorms) {
            for (let i = 0; i < stormCount; i++) {
                storms.push({
                    x: rand(), y: 0.2 + rand() * 0.6,
                    r: 0.02 + rand() * 0.05,
                    color: [180+rand()*75, 100+rand()*80, 80+rand()*60],
                    rotation: rand() * Math.PI * 2
                });
            }
        }
        
        // Primary storm (like Great Red Spot)
        if (hasStorms) {
            storms.push({
                x: 0.6, y: 0.6,
                r: 0.08,
                color: [200, 100, 80],
                rotation: 0.3,
                isGreat: true
            });
        }

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const u = x/w, v = y/h;
                
                const bandNoise = fbm((a,b)=>noise(a*3,b*20), u, v, 5, 2.0, 0.55);
                const vv = v + bandNoise * 0.03;
                
                const bandIndex = vv * bands.length;
                const bi = Math.floor(bandIndex) % bands.length;
                const bf = bandIndex - Math.floor(bandIndex);
                const b1 = bands[((bi % bands.length) + bands.length) % bands.length];
                const b2 = bands[((bi+1) % bands.length + bands.length) % bands.length];
                
                let turbulence = fbm((a,b)=>noise(a*15,b*50), u, v, 5, 2.3, 0.5);
                turbulence = (turbulence + 1) * 0.5;
                
                let r = b1[0] + (b2[0]-b1[0])*bf;
                let g = b1[1] + (b2[1]-b1[1])*bf;
                let b = b1[2] + (b2[2]-b1[2])*bf;
                
                const t = (turbulence - 0.5) * 40;
                r += t; g += t; b += t;
                
                for (const s of storms) {
                    const dx = (u - s.x), dy = (v - s.y) * 2;
                    const d = Math.sqrt(dx*dx + dy*dy);
                    if (d < s.r) {
                        const edge = d / s.r;
                        const swirl = fbm((a,b)=>stormNoise(a*30,b*30), u*10, v*10, 4, 2.0, 0.5);
                        const alpha = (1 - edge*edge) * (0.6 + swirl * 0.4);
                        r = r*(1-alpha) + s.color[0]*alpha;
                        g = g*(1-alpha) + s.color[1]*alpha;
                        b = b*(1-alpha) + s.color[2]*alpha;
                    }
                }
                
                const i = (y*w + x)*4;
                img.data[i]   = Math.max(0, Math.min(255, r));
                img.data[i+1] = Math.max(0, Math.min(255, g));
                img.data[i+2] = Math.max(0, Math.min(255, b));
                img.data[i+3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    function createIceGiantTexture(seed, baseColor, bandStrength) {
        const size = 1024;
        const { canvas, ctx } = createCanvas(size, size/2);
        const w = size, h = size/2;
        const noise = makeNoise2D(seed);
        const img = ctx.createImageData(w, h);
        
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const u = x/w, v = y/h;
                const n = fbm((a,b)=>noise(a*5,b*15), u*2, v, 6, 2.2, 0.5);
                const n2 = fbm((a,b)=>noise(a*12,b*40), u+100, v, 4, 2.0, 0.5);
                
                let r = baseColor[0] + n*bandStrength + n2*15;
                let g = baseColor[1] + n*bandStrength*0.7 + n2*10;
                let b = baseColor[2] + n*bandStrength*0.5 + n2*20;
                
                const i = (y*w+x)*4;
                img.data[i]   = Math.max(0, Math.min(255, r));
                img.data[i+1] = Math.max(0, Math.min(255, g));
                img.data[i+2] = Math.max(0, Math.min(255, b));
                img.data[i+3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    function createVenusTexture(seed) {
        const size = 1024;
        const { canvas, ctx } = createCanvas(size, size/2);
        const w = size, h = size/2;
        const noise = makeNoise2D(seed);
        const img = ctx.createImageData(w, h);
        
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const u = x/w, v = y/h;
                const n = fbm((a,b)=>noise(a*4,b*20), u*3, v*1.5, 7, 2.2, 0.5);
                const n2 = fbm((a,b)=>noise(a*10,b*30), u+50, v, 4, 2.0, 0.5);
                const clouds = (n + n2 * 0.3) * 0.5 + 0.5;
                
                const bands = Math.sin(v * Math.PI * 4) * 0.05;
                
                let r = 200 + clouds * 40 + bands * 20;
                let g = 150 + clouds * 40 + bands * 20;
                let b = 80 + clouds * 30 + bands * 10;
                
                const polar = Math.abs(v-0.5)*2;
                if (polar > 0.8) {
                    const t = (polar-0.8)/0.2;
                    r = r*(1-t) + 240*t; g = g*(1-t) + 220*t; b = b*(1-t) + 180*t;
                }
                
                const i = (y*w+x)*4;
                img.data[i]   = Math.max(0, Math.min(255, r));
                img.data[i+1] = Math.max(0, Math.min(255, g));
                img.data[i+2] = Math.max(0, Math.min(255, b));
                img.data[i+3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    function createRingTexture(seed, innerColor, outerColor) {
        const size = 512;
        const { canvas, ctx } = createCanvas(size, 64);
        const w = size, h = 64;
        const noise = makeNoise2D(seed);
        const img = ctx.createImageData(w, h);
        
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const u = x/w;
                const n = fbm((a,b)=>noise(a*30, b*3), u, 0.5, 6, 2.3, 0.5);
                const n2 = fbm((a,b)=>noise(a*80, b), u+10, 0.5, 4, 2.0, 0.5);
                
                // Cassini division
                const cassini = 1 - Math.exp(-Math.pow((u-0.68)*30, 2)) * 0.8;
                
                let density = (0.5 + n*0.5) * cassini;
                density *= (0.8 + n2*0.4);
                
                // Encke gap
                if (Math.abs(u - 0.85) < 0.01) density *= 0.1;
                
                const alpha = Math.max(0, Math.min(1, density)) * 255;
                
                const r = innerColor[0] + (outerColor[0]-innerColor[0])*u + n2*20;
                const g = innerColor[1] + (outerColor[1]-innerColor[1])*u + n2*15;
                const b = innerColor[2] + (outerColor[2]-innerColor[2])*u + n2*10;
                
                const i = (y*w+x)*4;
                img.data[i]   = Math.max(0, Math.min(255, r));
                img.data[i+1] = Math.max(0, Math.min(255, g));
                img.data[i+2] = Math.max(0, Math.min(255, b));
                img.data[i+3] = alpha;
            }
        }
        ctx.putImageData(img, 0, 0);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    function createLensFlareTexture() {
        const size = 256;
        const { canvas, ctx } = createCanvas(size, size);
        const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
        grad.addColorStop(0, 'rgba(255,230,150,0.8)');
        grad.addColorStop(0.1, 'rgba(255,200,100,0.4)');
        grad.addColorStop(0.3, 'rgba(255,150,50,0.1)');
        grad.addColorStop(1, 'rgba(255,100,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        const tex = new THREE.CanvasTexture(canvas);
        return tex;
    }

    function createCoronaTexture() {
        const size = 512;
        const { canvas, ctx } = createCanvas(size, size);
        const grad = ctx.createRadialGradient(size/2, size/2, size*0.2, size/2, size/2, size/2);
        grad.addColorStop(0, 'rgba(255,200,80,0.6)');
        grad.addColorStop(0.3, 'rgba(255,150,50,0.2)');
        grad.addColorStop(0.6, 'rgba(255,100,20,0.05)');
        grad.addColorStop(1, 'rgba(255,50,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        const tex = new THREE.CanvasTexture(canvas);
        return tex;
    }

    // -------------------------------------------------------------------------
    // Main Application
    // -------------------------------------------------------------------------
    let scene, camera, renderer;
    let solarSystem, planets = {}, orbits = {};
    let localStars, galaxyStars, galaxyCore, galaxyArms;
    let clock = new THREE.Clock();
    let timeScale = 1;
    let sunLight, ambientLight;
    
    // Camera control state
    let controls = {
        target: new THREE.Vector3(0,0,0),
        distance: 60,
        azimuth: 0.5,
        polar: Math.PI * 0.35,
        followPlanet: null,
        followOffset: new THREE.Vector3(0, 5, 15),
        isDragging: false,
        lastX: 0, lastY: 0,
        lastPinchDist: 0,
        isFreeFlight: false,
        velocity: new THREE.Vector3(),
        moveSpeed: 50
    };
    
    let nebulaClouds;

    function updateLoading(percent, text) {
        document.getElementById('loading-bar').style.width = percent + '%';
        if (text) document.getElementById('loading-text').textContent = text;
    }

    function init() {
        // Renderer
        const canvas = document.getElementById('canvas');
        renderer = new THREE.WebGLRenderer({ 
            canvas, 
            antialias: window.devicePixelRatio < 2,
            powerPreference: 'high-performance',
            logarithmicDepthBuffer: true
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x000000);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        renderer.outputColorSpace = THREE.SRGBColorSpace;

        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500000);
        camera.position.set(0, 60, 140);
        controls.distance = 140;
        
        updateLoading(10, 'Generating star texture...');
        
        // Lighting
        ambientLight = new THREE.AmbientLight(0x222233, 0.3);
        scene.add(ambientLight);
        
        sunLight = new THREE.PointLight(0xfff0d0, 3.5, 10000, 1.2);
        sunLight.position.set(0, 0, 0);
        // (added to sun mesh later so it moves with the star)
        
        updateLoading(20, 'Building solar system...');
        buildSolarSystem();
        
        updateLoading(40, 'Spawning local stars...');
        buildLocalStars();
        
        updateLoading(60, 'Generating galaxy...');
        buildGalaxy();
        
        updateLoading(80, 'Adding nebulae...');
        buildNebulae();
        
        updateLoading(90, 'Setting up controls...');
        setupControls();
        setupUI();
        
        updateLoading(100, 'Ready');
        
        setTimeout(() => {
            document.getElementById('loading-screen').classList.add('fade-out');
        }, 500);
        
        window.addEventListener('resize', onResize);
        
        animate();
    }

    function buildSolarSystem() {
        solarSystem = new THREE.Group();
        scene.add(solarSystem);
        
        const sunGeo = new THREE.SphereGeometry(5, 64, 64);
        const sunTex = createStarTexture();
        const sunMat = new THREE.MeshBasicMaterial({
            map: sunTex,
            color: 0xffffff
        });
        const sun = new THREE.Mesh(sunGeo, sunMat);
        sun.userData = { name: 'Sol', info: 'A G-type main-sequence star (Sol). Surface temp ~5700K.' };
        sun.add(sunLight); // Light moves with Sol
        sunLight.position.set(0, 0, 0);
        solarSystem.add(sun);
        planets.sun = sun;
        
        // Sun glow
        const coronaGeo = new THREE.SphereGeometry(7, 32, 32);
        const coronaMat = new THREE.MeshBasicMaterial({
            map: createCoronaTexture(),
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide
        });
        const corona = new THREE.Mesh(coronaGeo, coronaMat);
        sun.add(corona);
        
        // Outer corona
        const corona2Geo = new THREE.SphereGeometry(12, 32, 32);
        const corona2Mat = new THREE.MeshBasicMaterial({
            color: 0xff8833,
            transparent: true,
            opacity: 0.08,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide
        });
        const corona2 = new THREE.Mesh(corona2Geo, corona2Mat);
        sun.add(corona2);
        
        // Lens flare sprite
        const flareMat = new THREE.SpriteMaterial({
            map: createLensFlareTexture(),
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const flare = new THREE.Sprite(flareMat);
        flare.scale.set(40, 40, 1);
        sun.add(flare);
        
        // Planet definitions (slightly alien from ours)
        const planetDefs = [
            {
                key: 'mercury',
                name: 'Aether',
                info: 'A small, airless rocky world closest to Sol. Heavily cratered.',
                radius: 0.5, distance: 10, speed: 4.15, rotSpeed: 0.004, tilt: 0.01,
                colors: [[120,100,80],[160,140,120],[90,80,70],[60,55,50]], roughness: 1.0, craters: 200,
                hasAtmo: false
            },
            {
                key: 'venus',
                name: 'Aphrodite',
                info: 'A scorching world perpetually shrouded in sulfuric clouds.',
                radius: 1.0, distance: 15, speed: 1.62, rotSpeed: -0.0002, tilt: 2.6,
                isVenus: true,
                hasAtmo: true, atmoColor: 0xffcc88, atmoIntensity: 0.6
            },
            {
                key: 'earth',
                name: 'Gaia',
                info: 'A blue marble with liquid water, breathable atmosphere, and life.',
                radius: 1.1, distance: 21, speed: 1.0, rotSpeed: 0.02, tilt: 0.41,
                isEarth: true,
                hasAtmo: true, atmoColor: 0x6699ff, atmoIntensity: 0.8,
                hasMoon: true, moonDist: 2, moonSize: 0.28
            },
            {
                key: 'mars',
                name: 'Ares',
                info: 'The red planet with iron oxide dust, ancient riverbeds, and polar ice.',
                radius: 0.7, distance: 28, speed: 0.53, rotSpeed: 0.018, tilt: 0.44,
                colors: [[180,80,40],[220,120,60],[150,60,30],[80,30,15]], roughness: 0.8, craters: 120,
                hasAtmo: true, atmoColor: 0xff8866, atmoIntensity: 0.2
            },
            {
                key: 'jupiter',
                name: 'Zeus',
                info: 'A gas giant more massive than all other planets combined.',
                radius: 3.0, distance: 42, speed: 0.084, rotSpeed: 0.04, tilt: 0.05,
                isGasGiant: true,
                bands: [
                    [180,140,100],[220,190,150],[180,130,80],[200,160,110],
                    [150,100,60],[210,180,140],[170,120,70],[200,170,130]
                ],
                storms: true, stormCount: 8,
                hasRings: true, ringInner: 3.5, ringOuter: 4.2,
                ringColors: [[180,150,120],[150,120,100]]
            },
            {
                key: 'saturn',
                name: 'Kronos',
                info: 'Famous for its spectacular ring system of ice and rock.',
                radius: 2.5, distance: 60, speed: 0.034, rotSpeed: 0.038, tilt: 0.47,
                isGasGiant: true,
                bands: [
                    [220,190,140],[240,220,170],[200,170,120],[230,200,150],
                    [190,160,110],[230,210,160]
                ],
                storms: true, stormCount: 4,
                hasRings: true, ringInner: 3.3, ringOuter: 6.5,
                ringColors: [[230,210,170],[200,170,130]]
            },
            {
                key: 'uranus',
                name: 'Ouranos',
                info: 'An ice giant tilted on its side, with methane-rich atmosphere.',
                radius: 1.6, distance: 78, speed: 0.012, rotSpeed: -0.03, tilt: 1.71,
                isIce: true,
                iceColor: [160,220,220], bandStrength: 20,
                hasRings: true, ringInner: 2.0, ringOuter: 2.5,
                ringColors: [[150,180,180],[100,130,130]]
            },
            {
                key: 'neptune',
                name: 'Poseidon',
                info: 'A deep blue ice giant with supersonic winds and dark storms.',
                radius: 1.5, distance: 92, speed: 0.006, rotSpeed: 0.032, tilt: 0.49,
                isIce: true,
                iceColor: [60,80,200], bandStrength: 30,
                storms: true, stormCount: 3,
                hasRings: true, ringInner: 1.9, ringOuter: 2.6,
                ringColors: [[80,100,160],[60,70,120]]
            },
            {
                key: 'nemesis',
                name: 'Nemesis',
                info: 'A mysterious dwarf planet in eccentric orbit beyond Poseidon.',
                radius: 0.35, distance: 110, speed: 0.003, rotSpeed: 0.01, tilt: 0.3,
                colors: [[120,60,80],[160,80,110],[90,40,60],[60,20,30]], roughness: 0.9, craters: 80,
                hasAtmo: false
            }
        ];
        
        for (const def of planetDefs) {
            const pivot = new THREE.Group(); // For orbit
            solarSystem.add(pivot);
            
            // Random starting position
            pivot.rotation.y = Math.random() * Math.PI * 2;
            
            const geometry = new THREE.SphereGeometry(def.radius, 48, 48);
            let material, mesh;
            
            if (def.isEarth) {
                const tex = createEarthTexture(def.key.charCodeAt(0)*100);
                const bump = createEarthBump(def.key.charCodeAt(0)*100);
                material = new THREE.MeshStandardMaterial({
                    map: tex,
                    bumpMap: bump,
                    bumpScale: 0.05,
                    roughness: 0.8,
                    metalness: 0.0
                });
            } else if (def.isVenus) {
                const tex = createVenusTexture(def.key.charCodeAt(0)*100);
                material = new THREE.MeshStandardMaterial({
                    map: tex,
                    roughness: 1.0,
                    metalness: 0.0
                });
            } else if (def.isGasGiant) {
                const tex = createGasGiantTexture(def.key.charCodeAt(0)*100, def.bands, def.storms, def.stormCount || 0);
                material = new THREE.MeshStandardMaterial({
                    map: tex,
                    roughness: 0.9,
                    metalness: 0.0
                });
            } else if (def.isIce) {
                const tex = createIceGiantTexture(def.key.charCodeAt(0)*100, def.iceColor, def.bandStrength);
                material = new THREE.MeshStandardMaterial({
                    map: tex,
                    roughness: 0.7,
                    metalness: 0.0
                });
            } else {
                const tex = createRockyTexture(
                    def.key.charCodeAt(0)*100 + 13,
                    def.colors,
                    def.roughness,
                    def.craters
                );
                const bump = createRockyTexture(
                    def.key.charCodeAt(0)*100 + 77,
                    [[50,50,50],[120,120,120],[180,180,180],[220,220,220]],
                    1.0, Math.floor(def.craters*0.5)
                );
                material = new THREE.MeshStandardMaterial({
                    map: tex,
                    bumpMap: bump,
                    bumpScale: 0.04,
                    roughness: 0.9,
                    metalness: 0.0
                });
            }
            
            mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(def.distance, 0, 0);
            mesh.rotation.z = def.tilt;
            mesh.userData = { name: def.name, info: def.info, radius: def.radius, isPlanet: true };
            pivot.add(mesh);
            
            // Atmosphere
            if (def.hasAtmo) {
                const atmoGeo = new THREE.SphereGeometry(def.radius * 1.08, 48, 48);
                const atmoMat = new THREE.MeshBasicMaterial({
                    color: def.atmoColor,
                    transparent: true,
                    opacity: def.atmoIntensity * 0.25,
                    side: THREE.BackSide,
                    blending: THREE.AdditiveBlending
                });
                const atmo = new THREE.Mesh(atmoGeo, atmoMat);
                mesh.add(atmo);
            }
            
            // Earth clouds
            if (def.isEarth) {
                const cloudTex = createEarthClouds(def.key.charCodeAt(0)*100);
                const cloudGeo = new THREE.SphereGeometry(def.radius * 1.02, 48, 48);
                const cloudMat = new THREE.MeshStandardMaterial({
                    map: cloudTex,
                    transparent: true,
                    opacity: 0.8,
                    depthWrite: false
                });
                const clouds = new THREE.Mesh(cloudGeo, cloudMat);
                mesh.add(clouds);
                mesh.userData.clouds = clouds;
            }
            
            // Rings
            if (def.hasRings) {
                const ringTex = createRingTexture(
                    def.key.charCodeAt(0)*100 + 200,
                    def.ringColors[0],
                    def.ringColors[1]
                );
                const ringGeo = new THREE.RingGeometry(def.ringInner, def.ringOuter, 128, 8);
                // Fix UVs for proper radial mapping
                const pos = ringGeo.attributes.position;
                const uv = ringGeo.attributes.uv;
                for (let i = 0; i < pos.count; i++) {
                    const x = pos.getX(i), y = pos.getY(i);
                    const r = Math.sqrt(x*x + y*y);
                    const t = (r - def.ringInner) / (def.ringOuter - def.ringInner);
                    uv.setXY(i, t, (Math.atan2(y,x) / (Math.PI*2) + 0.5) * 8);
                }
                
                const ringMat = new THREE.MeshBasicMaterial({
                    map: ringTex,
                    transparent: true,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                const rings = new THREE.Mesh(ringGeo, ringMat);
                rings.rotation.x = Math.PI / 2;
                // Tilt rings slightly
                rings.rotation.x += def.tilt * 0.5;
                mesh.add(rings);
                
                // Shadow ring
                const shadowRingGeo = new THREE.RingGeometry(def.ringInner, def.ringOuter, 128);
                const shadowRingMat = new THREE.MeshBasicMaterial({
                    color: 0x000000,
                    transparent: true,
                    opacity: 0.3,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                const shadowRings = new THREE.Mesh(shadowRingGeo, shadowRingMat);
                shadowRings.rotation.x = Math.PI / 2 - 0.05;
                mesh.add(shadowRings);
            }
            
            // Moon for Earth-like
            if (def.hasMoon) {
                const moonTex = createRockyTexture(999, [[80,80,80],[120,120,120],[160,160,160],[200,200,200]], 1.0, 150);
                const moonGeo = new THREE.SphereGeometry(def.moonSize, 32, 32);
                const moonMat = new THREE.MeshStandardMaterial({ map: moonTex, roughness: 1.0 });
                const moon = new THREE.Mesh(moonGeo, moonMat);
                moon.userData = { name: 'Luna', info: 'The only natural satellite of Gaia.' };
                mesh.userData.moon = moon;
                mesh.userData.moonPivot = new THREE.Group();
                mesh.userData.moonPivot.add(moon);
                moon.position.set(def.moonDist, 0.3, 0);
                mesh.add(mesh.userData.moonPivot);
            }
            
            // Orbit line
            const orbitPoints = [];
            const segments = 128;
            for (let i = 0; i <= segments; i++) {
                const a = (i / segments) * Math.PI * 2;
                orbitPoints.push(new THREE.Vector3(
                    Math.cos(a) * def.distance,
                    0,
                    Math.sin(a) * def.distance
                ));
            }
            const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPoints);
            const orbitMat = new THREE.LineBasicMaterial({ 
                color: 0x446688, 
                transparent: true, 
                opacity: 0.25 
            });
            const orbitLine = new THREE.Line(orbitGeo, orbitMat);
            solarSystem.add(orbitLine);
            
            planets[def.key] = mesh;
            orbits[def.key] = { pivot, def, angle: Math.random() * Math.PI * 2 };
        }
    }

    function buildLocalStars() {
        // Distant background stars (spherical skybox of points)
        const starCount = 15000;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);
        const sizes = new Float32Array(starCount);
        
        const rand = mulberry32(42);
        
        for (let i = 0; i < starCount; i++) {
            // Random spherical distribution
            const theta = rand() * Math.PI * 2;
            const phi = Math.acos(2 * rand() - 1);
            const r = 2000 + rand() * 500;
            
            positions[i*3]   = r * Math.sin(phi) * Math.cos(theta);
            positions[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i*3+2] = r * Math.cos(phi);
            
            // Star colors (roughly OBAFGKM)
            const type = rand();
            let cr, cg, cb;
            if (type < 0.05) { cr = 0.7; cg = 0.8; cb = 1.0; }       // Blue O/B
            else if (type < 0.2) { cr = 0.9; cg = 0.95; cb = 1.0; }  // White A/F
            else if (type < 0.7) { cr = 1.0; cg = 1.0; cb = 0.9; }   // Yellow G
            else if (type < 0.9) { cr = 1.0; cg = 0.8; cb = 0.6; }   // Orange K
            else { cr = 1.0; cg = 0.6; cb = 0.4; }                   // Red M
            
            // Slight variation
            cr += (rand()-0.5)*0.1; cg += (rand()-0.5)*0.1; cb += (rand()-0.5)*0.1;
            
            colors[i*3] = cr; colors[i*3+1] = cg; colors[i*3+2] = cb;
            sizes[i] = 0.5 + rand() * 2.0;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        const material = new THREE.PointsMaterial({
            size: 1.5,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            sizeAttenuation: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        
        localStars = new THREE.Points(geometry, material);
        // Parent to solar system so nearby stars move with us relative to the galaxy
        solarSystem.add(localStars);
    }

    function buildGalaxy() {
        // The galaxy is a huge disk visible when far away.
        // We use multiple layers: core bulge, spiral arms, halo.
        const galaxyGroup = new THREE.Group();
        
        // Core (spherical bulge)
        const coreCount = 80000;
        const coreGeo = new THREE.BufferGeometry();
        const corePos = new Float32Array(coreCount * 3);
        const coreCol = new Float32Array(coreCount * 3);
        const rand = mulberry32(100);
        
        for (let i = 0; i < coreCount; i++) {
            // Use Gaussian-like distribution for bulge
            const r = Math.pow(rand(), 0.5) * 300;
            const theta = rand() * Math.PI * 2;
            const phi = Math.acos(2*rand() - 1);
            const yFactor = 0.3; // Flattened
            
            corePos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
            corePos[i*3+1] = r * Math.cos(phi) * yFactor;
            corePos[i*3+2] = r * Math.sin(phi) * Math.sin(theta);
            
            const temp = 0.7 + rand() * 0.3;
            coreCol[i*3]   = 1.0 * temp + 0.2;
            coreCol[i*3+1] = 0.85 * temp + 0.1;
            coreCol[i*3+2] = 0.6 * temp;
        }
        coreGeo.setAttribute('position', new THREE.BufferAttribute(corePos, 3));
        coreGeo.setAttribute('color', new THREE.BufferAttribute(coreCol, 3));
        const coreMat = new THREE.PointsMaterial({
            size: 1.8, vertexColors: true, transparent: true, opacity: 0.85,
            blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
        });
        galaxyCore = new THREE.Points(coreGeo, coreMat);
        galaxyGroup.add(galaxyCore);
        
        // Bright central glow
        const glowGeo = new THREE.SphereGeometry(80, 32, 32);
        const glowMat = new THREE.MeshBasicMaterial({
            color: 0xffdd99,
            transparent: true,
            opacity: 0.15,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        galaxyGroup.add(glow);
        
        // Spiral arms (two main arms)
        const armCount = 2;
        const starsPerArm = 150000;
        const armGeo = new THREE.BufferGeometry();
        const armPos = new Float32Array(starsPerArm * armCount * 3);
        const armCol = new Float32Array(starsPerArm * armCount * 3);
        
        for (let arm = 0; arm < armCount; arm++) {
            const armAngleOffset = (arm / armCount) * Math.PI * 2;
            for (let i = 0; i < starsPerArm; i++) {
                const idx = (arm * starsPerArm + i) * 3;
                
                // Logarithmic spiral: r = a*e^(b*theta)
                const t = Math.pow(rand(), 0.5); // 0-1
                const r = 100 + t * 1200;
                const spiralTightness = 0.35;
                const theta = armAngleOffset + t * Math.PI * 4 * spiralTightness + (rand()-0.5)*0.4;
                
                // Arm thickness decreases with distance
                const armSpread = (1 - t * 0.5) * 60;
                const spread = (Math.pow(rand(), 0.5) * armSpread) * (rand() > 0.5 ? 1 : -1);
                const spreadAngle = rand() * Math.PI * 2;
                
                const yThickness = 15 * (1 - t * 0.7);
                
                armPos[idx]   = Math.cos(theta)*r + Math.cos(spreadAngle)*spread;
                armPos[idx+1] = (rand()-0.5) * yThickness * 2;
                armPos[idx+2] = Math.sin(theta)*r + Math.sin(spreadAngle)*spread;
                
                // Color gradient: blue/white in arms, orange near core
                const blueness = t * 0.8 + rand()*0.2;
                armCol[idx]   = 0.7 + blueness*0.3;
                armCol[idx+1] = 0.7 + (1-blueness)*0.2;
                armCol[idx+2] = 0.5 + (1-blueness)*0.4;
                
                // Bright young blue stars (OB associations) scattered
                if (rand() < 0.02) {
                    armCol[idx] = 0.6; armCol[idx+1] = 0.7; armCol[idx+2] = 1.0;
                }
                // Red giants
                if (rand() < 0.01) {
                    armCol[idx] = 1.0; armCol[idx+1] = 0.4; armCol[idx+2] = 0.2;
                }
            }
        }
        armGeo.setAttribute('position', new THREE.BufferAttribute(armPos, 3));
        armGeo.setAttribute('color', new THREE.BufferAttribute(armCol, 3));
        const armMat = new THREE.PointsMaterial({
            size: 1.5, vertexColors: true, transparent: true, opacity: 0.9,
            blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
        });
        galaxyArms = new THREE.Points(armGeo, armMat);
        galaxyGroup.add(galaxyArms);
        
        // Halo stars (globular clusters and old stars)
        const haloCount = 20000;
        const haloGeo = new THREE.BufferGeometry();
        const haloPos = new Float32Array(haloCount * 3);
        const haloCol = new Float32Array(haloCount * 3);
        for (let i = 0; i < haloCount; i++) {
            const r = 300 + Math.pow(rand(), 2) * 1800;
            const theta = rand() * Math.PI * 2;
            const phi = Math.acos(2*rand()-1);
            haloPos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
            haloPos[i*3+1] = r * Math.cos(phi) * 0.5;
            haloPos[i*3+2] = r * Math.sin(phi) * Math.sin(theta);
            haloCol[i*3] = 1.0; haloCol[i*3+1] = 0.9; haloCol[i*3+2] = 0.7;
        }
        haloGeo.setAttribute('position', new THREE.BufferAttribute(haloPos, 3));
        haloGeo.setAttribute('color', new THREE.BufferAttribute(haloCol, 3));
        const haloMat = new THREE.PointsMaterial({
            size: 1.2, vertexColors: true, transparent: true, opacity: 0.5,
            blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
        });
        const halo = new THREE.Points(haloGeo, haloMat);
        galaxyGroup.add(halo);
        
        // Dust lanes (sparse dark-ish cloud sprites along arms)
        const dustCount = 3000;
        const dustGeo = new THREE.BufferGeometry();
        const dustPos = new Float32Array(dustCount * 3);
        const dustCol = new Float32Array(dustCount * 3);
        const dustSizes = new Float32Array(dustCount);
        for (let i = 0; i < dustCount; i++) {
            const t = Math.pow(rand(), 0.6);
            const r = 200 + t * 1000;
            const theta = (rand() < 0.5 ? 0 : Math.PI) + t * Math.PI * 4 * 0.35 + (rand()-0.5)*0.3;
            const spread = 40 * (1-t*0.5);
            dustPos[i*3]   = Math.cos(theta)*r + (rand()-0.5)*spread*2;
            dustPos[i*3+1] = (rand()-0.5) * 8;
            dustPos[i*3+2] = Math.sin(theta)*r + (rand()-0.5)*spread*2;
            
            const h = rand();
            if (h < 0.4) { dustCol[i*3]=0.3; dustCol[i*3+1]=0.2; dustCol[i*3+2]=0.4; }
            else if (h < 0.7) { dustCol[i*3]=0.4; dustCol[i*3+1]=0.2; dustCol[i*3+2]=0.2; }
            else { dustCol[i*3]=0.2; dustCol[i*3+1]=0.3; dustCol[i*3+2]=0.3; }
            
            dustSizes[i] = 8 + rand() * 20;
        }
        dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
        dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));
        const dustMat = new THREE.PointsMaterial({
            size: 15, vertexColors: true, transparent: true, opacity: 0.15,
            blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
        });
        const dust = new THREE.Points(dustGeo, dustMat);
        galaxyGroup.add(dust);
        
        // Position galaxy far away but still reachable
        galaxyGroup.position.set(0, 0, 0); // Centered; our solar system is offset slightly
        galaxyGroup.rotation.x = 0.3;
        galaxyGroup.rotation.z = 0.1;
        galaxyStars = galaxyGroup;
        scene.add(galaxyStars);
        
        // Scale galaxy to be huge but offset our solar system so you can fly TO it
        // We'll put our solar system at some offset inside the galaxy
        solarSystem.position.set(-400, 20, 200); // Offset from galaxy center
    }

    function buildNebulae() {
        // Add colorful nebula sprites around the solar neighborhood
        nebulaClouds = new THREE.Group();
        solarSystem.add(nebulaClouds);
        
        const nebulaColors = [
            { c: new THREE.Color(0x4466ff), p: new THREE.Vector3(400, 40, 200), s: 300 },
            { c: new THREE.Color(0xff4488), p: new THREE.Vector3(-300, -20, 500), s: 250 },
            { c: new THREE.Color(0x44ffaa), p: new THREE.Vector3(600, 60, -300), s: 350 },
            { c: new THREE.Color(0xff8844), p: new THREE.Vector3(-500, 30, -400), s: 280 },
            { c: new THREE.Color(0xaa44ff), p: new THREE.Vector3(150, -40, 600), s: 220 },
            { c: new THREE.Color(0x44ddff), p: new THREE.Vector3(-100, 100, -600), s: 200 }
        ];
        
        const nebulaTex = (function() {
            const size = 256;
            const {canvas, ctx} = createCanvas(size, size);
            const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
            g.addColorStop(0, 'rgba(255,255,255,0.7)');
            g.addColorStop(0.3, 'rgba(255,255,255,0.3)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0,0,size,size);
            return new THREE.CanvasTexture(canvas);
        })();
        
        for (const n of nebulaColors) {
            const mat = new THREE.SpriteMaterial({
                map: nebulaTex,
                color: n.c,
                transparent: true,
                opacity: 0.3,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const sprite = new THREE.Sprite(mat);
            sprite.position.copy(n.p);
            sprite.scale.set(n.s, n.s, 1);
            nebulaClouds.add(sprite);
        }
    }

    // -------------------------------------------------------------------------
    // Camera Controls (touch + mouse)
    // -------------------------------------------------------------------------
    function setupControls() {
        const canvas = renderer.domElement;
        let touchId1 = null, touchId2 = null;
        
        function getEventPos(e) {
            if (e.touches) {
                return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
            return { x: e.clientX, y: e.clientY };
        }
        
        function onPointerDown(e) {
            e.preventDefault();
            if (e.touches && e.touches.length === 2) {
                touchId1 = e.touches[0].identifier;
                touchId2 = e.touches[1].identifier;
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                controls.lastPinchDist = Math.sqrt(dx*dx + dy*dy);
                return;
            }
            controls.isDragging = true;
            const pos = getEventPos(e);
            controls.lastX = pos.x;
            controls.lastY = pos.y;
        }
        
        function onPointerMove(e) {
            e.preventDefault();
            if (e.touches && e.touches.length === 2) {
                let t1, t2;
                for (let i = 0; i < e.touches.length; i++) {
                    if (e.touches[i].identifier === touchId1) t1 = e.touches[i];
                    if (e.touches[i].identifier === touchId2) t2 = e.touches[i];
                }
                if (t1 && t2) {
                    const dx = t1.clientX - t2.clientX;
                    const dy = t1.clientY - t2.clientY;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if (controls.lastPinchDist > 0) {
                        const factor = controls.lastPinchDist / dist;
                        controls.distance = Math.max(2, Math.min(5000, controls.distance * factor));
                    }
                    controls.lastPinchDist = dist;
                }
                return;
            }
            if (!controls.isDragging) return;
            const pos = getEventPos(e);
            const dx = pos.x - controls.lastX;
            const dy = pos.y - controls.lastY;
            controls.lastX = pos.x;
            controls.lastY = pos.y;
            
            const rotSpeed = 0.005;
            controls.azimuth -= dx * rotSpeed;
            controls.polar = Math.max(0.1, Math.min(Math.PI - 0.1, controls.polar - dy * rotSpeed));
        }
        
        function onPointerUp(e) {
            controls.isDragging = false;
            controls.lastPinchDist = 0;
            touchId1 = touchId2 = null;
        }
        
        function onWheel(e) {
            e.preventDefault();
            const zoomSpeed = 0.001;
            const factor = 1 + e.deltaY * zoomSpeed;
            controls.distance = Math.max(2, Math.min(5000, controls.distance * factor));
        }
        
        canvas.addEventListener('mousedown', onPointerDown);
        canvas.addEventListener('mousemove', onPointerMove);
        window.addEventListener('mouseup', onPointerUp);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        
        canvas.addEventListener('touchstart', onPointerDown, { passive: false });
        canvas.addEventListener('touchmove', onPointerMove, { passive: false });
        canvas.addEventListener('touchend', onPointerUp);
        canvas.addEventListener('touchcancel', onPointerUp);
        
        // Double click / double tap to toggle free flight? Keep simple.
    }

    function setupUI() {
        const slider = document.getElementById('speed-slider');
        const speedValue = document.getElementById('speed-value');
        
        slider.addEventListener('input', () => {
            const v = parseInt(slider.value);
            timeScale = v / 10;
            speedValue.textContent = timeScale.toFixed(1) + 'x';
        });
        
        // Planet buttons
        document.querySelectorAll('.planet-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.planet-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const planet = btn.dataset.planet;
                focusOnPlanet(planet);
            });
        });
        
        // Keyboard free-flight
        const keys = {};
        window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
        window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
        controls.keys = keys;
    }

    function focusOnPlanet(key) {
        if (key === 'sun' || planets[key]) {
            controls.followPlanet = key;
            const p = planets[key];
            // Set appropriate viewing distance based on body size
            controls.distance = key === 'sun' ? 25 : (p.userData.radius * 6 + 5);
            // Tilted view
            controls.polar = Math.PI * 0.3;
            controls.azimuth = 0.5;
            controls.followOffset.set(0,0,0);
            document.getElementById('planet-name').textContent = p.userData.name;
            document.getElementById('planet-info').textContent = p.userData.info;
        }
    }

    function onResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // -------------------------------------------------------------------------
    // Animation loop
    // -------------------------------------------------------------------------
    function animate() {
        requestAnimationFrame(animate);
        const dt = Math.min(0.05, clock.getDelta());
        const t = dt * timeScale;
        
        // Animate planets
        for (const key in orbits) {
            const o = orbits[key];
            o.angle += o.def.speed * t * 0.3;
            const x = Math.cos(o.angle) * o.def.distance;
            const z = Math.sin(o.angle) * o.def.distance;
            o.pivot.rotation.y = o.angle;
            planets[key].rotation.y += o.def.rotSpeed * timeScale;
            
            // Moon
            if (planets[key].userData.moonPivot) {
                planets[key].userData.moonPivot.rotation.y += t * 2;
            }
            // Clouds
            if (planets[key].userData.clouds) {
                planets[key].userData.clouds.rotation.y += t * 0.005;
            }
        }
        
        // Sun rotation
        planets.sun.rotation.y += t * 0.002;
        
        // Very slow galaxy rotation
        if (galaxyStars) {
            galaxyStars.rotation.y += t * 0.0001;
        }
        
        // Camera
        updateCamera(dt);
        
        // Fade galaxy based on camera distance from SS (far away -> galaxy visible)
        if (galaxyStars && localStars) {
            const camDistFromSS = camera.position.distanceTo(solarSystem.position);
            // Local stars fade when too far, galaxy stays visible
            const galaxyOpacity = Math.min(1, Math.max(0, (camDistFromSS - 300) / 500));
            localStars.material.opacity = Math.max(0.1, 1 - galaxyOpacity * 0.8);
            galaxyStars.children.forEach(child => {
                if (child.material) {
                    const base = child === galaxyCore ? 0.85 : (child === galaxyArms ? 0.9 : 0.5);
                    child.material.opacity = base * Math.min(1, galaxyOpacity + 0.1);
                }
            });
            
            const distanceDisplay = document.getElementById('distance-display');
            const hint = document.getElementById('controls-hint');
            if (camDistFromSS > 150) {
                hint.classList.remove('hidden');
                if (camDistFromSS > 2000) {
                    distanceDisplay.textContent = 'Interstellar space — galaxy ahead';
                } else {
                    distanceDisplay.textContent = `Distance from Sol: ${Math.round(camDistFromSS)} AU`;
                }
            } else {
                hint.classList.add('hidden');
            }
        }
        
        // Adjust exposure based on sun proximity
        const camToSun = camera.position.distanceTo(planets.sun.getWorldPosition(new THREE.Vector3()));
        renderer.toneMappingExposure = Math.max(0.3, Math.min(1.5, 1.2 - (50 / Math.max(10, camToSun))));
        
        // Lens flare visibility (sprite that faces camera, fades by distance)
        if (planets.sun.children.length > 1) {
            const flare = planets.sun.children[2]; // corona, corona2, flare
            if (flare && flare.material) {
                flare.material.opacity = Math.max(0, Math.min(0.8, 30 / camToSun));
            }
        }
        
        renderer.render(scene, camera);
    }

    function updateCamera(dt) {
        const keys = controls.keys || {};
        const freeFlightSpeed = controls.distance * 0.8;
        
        // Determine target position
        let targetPos = new THREE.Vector3(0,0,0);
        let lookTarget = new THREE.Vector3(0,0,0);
        
        if (controls.followPlanet && planets[controls.followPlanet]) {
            targetPos.copy(planets[controls.followPlanet].getWorldPosition(new THREE.Vector3()));
            lookTarget.copy(targetPos);
        } else {
            targetPos.copy(solarSystem.position);
            lookTarget.copy(targetPos);
        }
        
        // Smoothly move camera look target
        controls.target.lerp(lookTarget, 0.08);
        
        // Calculate desired camera position from spherical coordinates
        const camX = controls.target.x + controls.distance * Math.sin(controls.polar) * Math.sin(controls.azimuth);
        const camY = controls.target.y + controls.distance * Math.cos(controls.polar);
        const camZ = controls.target.z + controls.distance * Math.sin(controls.polar) * Math.cos(controls.azimuth);
        
        // WASD free flight when very far out (or keyboard user)
        let freeMove = new THREE.Vector3();
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();
        const up = new THREE.Vector3(0,1,0);
        
        if (keys['w']) freeMove.add(forward);
        if (keys['s']) freeMove.sub(forward);
        if (keys['a']) freeMove.sub(right);
        if (keys['d']) freeMove.add(right);
        if (keys['q']) freeMove.sub(up);
        if (keys['e']) freeMove.add(up);
        
        if (freeMove.lengthSq() > 0) {
            freeMove.normalize().multiplyScalar(freeFlightSpeed * dt * 5);
            controls.velocity.add(freeMove);
            controls.followPlanet = null;
            document.querySelectorAll('.planet-btn').forEach(b => b.classList.remove('active'));
        }
        controls.velocity.multiplyScalar(0.92);
        
        // Apply velocity to target position (for free flight)
        if (controls.velocity.lengthSq() > 0.01) {
            controls.target.add(controls.velocity);
        }
        
        camera.position.set(camX, camY, camZ);
        camera.position.add(controls.velocity);
        camera.lookAt(controls.target);
        
        // Update controls distance based on actual position
        const actualDist = camera.position.distanceTo(controls.target);
        if (Math.abs(actualDist - controls.distance) > controls.distance * 0.5) {
            // Velocity moved us significantly; sync distance
            controls.distance = actualDist;
        }
    }

    // -------------------------------------------------------------------------
    // Start
    // -------------------------------------------------------------------------
    window.addEventListener('load', init);
})();
