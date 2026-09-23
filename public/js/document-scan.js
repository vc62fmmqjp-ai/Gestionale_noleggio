/*
 * document-scan.js - Rilevamento del documento e correzione prospettica (stile CamScanner).
 * Lavora su array tipizzati puri (ImageData RGBA) così da girare in browser E in Node per i test.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) { module.exports = factory(); }
    else { root.DocScan = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function grayscale(rgba, w, h) {
        const out = new Float32Array(w * h);
        for (let i = 0, j = 0; i < w * h; i++, j += 4) {
            out[i] = rgba[j] * 0.299 + rgba[j + 1] * 0.587 + rgba[j + 2] * 0.114;
        }
        return out;
    }

    function boxBlur(gray, w, h, passes) {
        let src = gray;
        for (let p = 0; p < passes; p++) {
            const tmp = new Float32Array(src.length);
            for (let y = 0; y < h; y++) {
                const row = y * w;
                let acc = src[row] * 2 + src[row + 1];
                tmp[row] = acc;
                for (let x = 1; x < w - 1; x++) {
                    const idx = row + x;
                    acc += src[idx + 1] - src[idx - 1];
                    tmp[idx] = acc;
                }
                tmp[row + w - 1] = src[row + w - 1] * 2 + src[row + w - 2];
            }
            const out = new Float32Array(src.length);
            for (let x = 0; x < w; x++) {
                let acc = tmp[x] * 2 + tmp[x + w];
                out[x] = acc;
                for (let y = 1; y < h - 1; y++) {
                    const idx = y * w + x;
                    acc += tmp[idx + w] - tmp[idx - w];
                    out[idx] = acc;
                }
                out[(h - 1) * w + x] = tmp[(h - 1) * w + x] * 2 + tmp[(h - 2) * w + x];
            }
            src = out;
        }
        return src;
    }

    function sobel(gray, w, h) {
        const mag = new Float32Array(w * h);
        let maxMag = 1;
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const i = y * w + x;
                const tl = gray[i - w - 1], tc = gray[i - w], tr = gray[i - w + 1];
                const ml = gray[i - 1], mr = gray[i + 1];
                const bl = gray[i + w - 1], bc = gray[i + w], br = gray[i + w + 1];
                const gx = (tr + 2 * mr + br) - (tl + 2 * ml + bl);
                const gy = (bl + 2 * bc + br) - (tl + 2 * tc + tr);
                const m = Math.sqrt(gx * gx + gy * gy);
                mag[i] = m;
                if (m > maxMag) maxMag = m;
            }
        }
        const norm = new Float32Array(w * h);
        for (let i = 0; i < mag.length; i++) norm[i] = (mag[i] / maxMag) * 255;
        return norm;
    }

    function otsuThreshold(values) {
        const hist = new Float64Array(256);
        for (let i = 0; i < values.length; i++) hist[(values[i] | 0)]++;
        const total = values.length;
        let sum = 0;
        for (let t = 0; t < 256; t++) sum += t * hist[t];
        let sumB = 0, wB = 0, best = 0, bestT = 127;
        for (let t = 0; t < 256; t++) {
            wB += hist[t];
            if (wB === 0) continue;
            const wF = total - wB;
            if (wF === 0) break;
            sumB += t * hist[t];
            const mB = sumB / wB, mF = (sum - sumB) / wF;
            const between = wB * wF * (mB - mF) * (mB - mF);
            if (between > best) { best = between; bestT = t; }
        }
        return bestT;
    }

    function cross(o, a, b) {
        return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    }

    function convexHull(points) {
        const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
        const lower = [];
        for (const p of pts) {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
            lower.push(p);
        }
        const upper = [];
        for (let i = pts.length - 1; i >= 0; i--) {
            const p = pts[i];
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
            upper.push(p);
        }
        lower.pop(); upper.pop();
        return lower.concat(upper);
    }

    function largestComponentAndPoints(mask, w, h, minSize) {
        const visited = new Uint8Array(mask.length);
        const stack = new Int32Array(mask.length);
        let bestSize = 0, bestSeed = -1, bestBBox = null;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const start = y * w + x;
                if (!mask[start] || visited[start]) continue;
                let sp = 0, size = 0, minX = w, minY = h, maxX = -1, maxY = -1;
                stack[sp++] = start;
                visited[start] = 1;
                while (sp > 0) {
                    const cur = stack[--sp];
                    const cx = cur % w, cy = (cur / w) | 0;
                    size++;
                    if (cx < minX) minX = cx;
                    if (cx > maxX) maxX = cx;
                    if (cy < minY) minY = cy;
                    if (cy > maxY) maxY = cy;
                    for (let dy = -1; dy <= 1; dy++) {
                        const ny = cy + dy;
                        if (ny < 0 || ny >= h) continue;
                        for (let dx = -1; dx <= 1; dx++) {
                            const nx = cx + dx;
                            if (nx < 0 || nx >= w) continue;
                            const ni = ny * w + nx;
                            if (mask[ni] && !visited[ni]) { visited[ni] = 1; stack[sp++] = ni; }
                        }
                    }
                }
                if (size > bestSize) {
                    bestSize = size;
                    bestSeed = start;
                    bestBBox = { minX, minY, maxX, maxY };
                }
            }
        }
        if (bestSeed < 0 || bestSize < minSize) return null;
        const visited2 = new Uint8Array(mask.length);
        const points = [];
        const stack2 = new Int32Array(mask.length);
        let sp = 0;
        stack2[sp++] = bestSeed;
        visited2[bestSeed] = 1;
        while (sp > 0) {
            const cur = stack2[--sp];
            const cx = cur % w, cy = (cur / w) | 0;
            points.push({ x: cx, y: cy });
            for (let dy = -1; dy <= 1; dy++) {
                const ny = cy + dy;
                if (ny < bestBBox.minY - 1 || ny > bestBBox.maxY + 1) continue;
                if (ny < 0 || ny >= h) continue;
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = cx + dx;
                    if (nx < bestBBox.minX - 1 || nx > bestBBox.maxX + 1) continue;
                    if (nx < 0 || nx >= w) continue;
                    const ni = ny * w + nx;
                    if (mask[ni] && !visited2[ni]) { visited2[ni] = 1; stack2[sp++] = ni; }
                }
            }
        }
        return { size: points.length, points, bbox: bestBBox };
    }

    function orderCorners(quad) {
        const pts = quad.slice();
        pts.sort((a, b) => a.y - b.y);
        const top = pts.slice(0, 2).sort((a, b) => a.x - b.x);
        const bot = pts.slice(2).sort((a, b) => a.x - b.x);
        return [top[0], top[1], bot[1], bot[0]];
    }

    function polygonArea(quad) {
        let area = 0;
        for (let i = 0; i < quad.length; i++) {
            const a = quad[i], b = quad[(i + 1) % quad.length];
            area += a.x * b.y - b.x * a.y;
        }
        return Math.abs(area) / 2;
    }

    function quadPlausible(quad, w, h) {
        if (!quad || quad.length !== 4) return false;
        let sign = 0;
        for (let i = 0; i < 4; i++) {
            const o = quad[i], a = quad[(i + 1) % 4], b = quad[(i + 2) % 4];
            const cr = (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
            const s = cr > 0 ? 1 : -1;
            if (sign === 0) sign = s;
            else if (sign !== s) return false;
        }
        for (let i = 0; i < 4; i++) {
            const a = quad[i], b = quad[(i + 1) % 4], c = quad[(i + 2) % 4];
            const v1x = a.x - b.x, v1y = a.y - b.y;
            const v2x = c.x - b.x, v2y = c.y - b.y;
            const dot = v1x * v2x + v1y * v2y;
            const m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y);
            if (m1 < 1 || m2 < 1) return false;
            const cos = dot / (m1 * m2);
            const angle = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
            if (angle < 25 || angle > 155) return false;
        }
        const area = polygonArea(quad);
        if (area < 0.10 * w * h) return false;
        return true;
    }

    function dilateMask(mask, w, h) {
        const out = new Uint8Array(mask.length);
        for (let y = 0; y < h; y++) {
            const y0 = y > 0 ? y - 1 : 0, y1 = y < h - 1 ? y + 1 : y;
            for (let x = 0; x < w; x++) {
                if (!mask[y * w + x]) continue;
                const x0 = x > 0 ? x - 1 : 0, x1 = x < w - 1 ? x + 1 : x;
                for (let yy = y0; yy <= y1; yy++) {
                    const base = yy * w;
                    for (let xx = x0; xx <= x1; xx++) out[base + xx] = 1;
                }
            }
        }
        return out;
    }

    function projectionQuad(mask, w, h) {
        let minX = w, minY = h, maxX = -1, maxY = -1;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (mask[y * w + x]) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        if (maxX < 0) return null;
        return [
            { x: minX, y: minY }, { x: maxX, y: minY },
            { x: maxX, y: maxY }, { x: minX, y: maxY }
        ];
    }

    function findDocumentCorners(rgba, w, h, opts) {
        opts = opts || {};
        if (w < 30 || h < 30) return null;
        const gray = boxBlur(grayscale(rgba, w, h), w, h, opts.blurPasses || 2);
        const mag = sobel(gray, w, h);
        const thr = otsuThreshold(mag);
        const rawMask = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) {
            if (mag[i] >= thr) rawMask[i] = 1;
        }
        const mask = dilateMask(rawMask, w, h);
        let edgeCount = 0;
        for (let i = 0; i < mask.length; i++) edgeCount += mask[i];
        const minEdge = Math.max(32, w * h * 0.001);
        if (edgeCount < minEdge) return null;
        const candidates = [];
        const comp = largestComponentAndPoints(mask, w, h, minEdge);
        if (comp) {
            const hull = convexHull(comp.points);
            if (hull.length === 4) candidates.push(hull);
            else if (hull.length > 4) {
                let top = null, bottom = null, left = null, right = null;
                for (const p of hull) {
                    if (!top || p.y < top.y) top = p;
                    if (!bottom || p.y > bottom.y) bottom = p;
                    if (!left || p.x < left.x) left = p;
                    if (!right || p.x > right.x) right = p;
                }
                const seen = new Set();
                const quad = [];
                for (const p of [top, bottom, left, right]) {
                    const id = `${p.x},${p.y}`;
                    if (!seen.has(id)) { seen.add(id); quad.push(p); }
                }
                if (quad.length === 4) candidates.push(quad);
            }
        }
        const fb = projectionQuad(mask, w, h);
        if (fb) candidates.push(fb);
        for (const quad of candidates) {
            const ordered = orderCorners(quad);
            if (quadPlausible(ordered, w, h)) {
                return { corners: ordered, srcW: w, srcH: h };
            }
        }
        return null;
    }

    function warpSize(corners) {
        const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
        const wTop = d(corners[0], corners[1]);
        const wBot = d(corners[3], corners[2]);
        const hLeft = d(corners[0], corners[3]);
        const hRight = d(corners[1], corners[2]);
        return { w: Math.max(2, Math.round(Math.max(wTop, wBot))), h: Math.max(2, Math.round(Math.max(hLeft, hRight))) };
    }

    function gaussianSolve(A, b) {
        const n = b.length;
        const M = A.map((row, i) => row.concat(b[i]));
        for (let col = 0; col < n; col++) {
            let piv = col;
            for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
            if (Math.abs(M[piv][col]) < 1e-12) return null;
            [M[col], M[piv]] = [M[piv], M[col]];
            const diag = M[col][col];
            for (let c = col; c <= n; c++) M[col][c] /= diag;
            for (let r = 0; r < n; r++) {
                if (r === col) continue;
                const f = M[r][col];
                if (Math.abs(f) < 1e-15) continue;
                for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
            }
        }
        return M.map(row => row[n]);
    }

    function homographyFromQuad(src, dst) {
        const A = [], b = [];
        for (let i = 0; i < 4; i++) {
            const sx = src[i].x, sy = src[i].y, dx = dst[i].x, dy = dst[i].y;
            A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
            b.push(dx);
            A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
            b.push(dy);
        }
        const sol = gaussianSolve(A, b);
        if (!sol) return null;
        sol.push(1);
        return sol;
    }

    function inverse3x3(h) {
        const a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], k = h[7], l = h[8];
        const det = a * (e * l - f * k) - b * (d * l - f * g) + c * (d * k - e * g);
        if (Math.abs(det) < 1e-12) return null;
        return [
            (e * l - f * k) / det, (c * k - b * l) / det, (b * f - c * e) / det,
            (f * g - d * l) / det, (a * l - c * g) / det, (c * d - a * f) / det,
            (d * k - e * g) / det, (b * g - a * k) / det, (a * e - b * d) / det
        ];
    }

    function warp(rgba, w, h, corners, outW, outH) {
        const from = homographyFromQuad(corners, [{ x: 0, y: 0 }, { x: outW - 1, y: 0 }, { x: outW - 1, y: outH - 1 }, { x: 0, y: outH - 1 }]);
        if (!from) return null;
        const inv = inverse3x3(from);
        if (!inv) return null;
        const out = new Uint8ClampedArray(outW * outH * 4);
        for (let y = 0; y < outH; y++) {
            for (let x = 0; x < outW; x++) {
                const wIn = inv[6] * x + inv[7] * y + inv[8];
                const sx = (inv[0] * x + inv[1] * y + inv[2]) / wIn;
                const sy = (inv[3] * x + inv[4] * y + inv[5]) / wIn;
                if (sx < 0 || sy < 0 || sx > w - 1 || sy > h - 1) continue;
                const x0 = sx | 0, y0 = sy | 0;
                const x1 = x0 < w - 1 ? x0 + 1 : x0;
                const y1 = y0 < h - 1 ? y0 + 1 : y0;
                const fx = sx - x0, fy = sy - y0;
                const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4;
                const i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
                const o = (y * outW + x) * 4;
                for (let ch = 0; ch < 3; ch++) {
                    const top = rgba[i00 + ch] * (1 - fx) + rgba[i10 + ch] * fx;
                    const bot = rgba[i01 + ch] * (1 - fx) + rgba[i11 + ch] * fx;
                    out[o + ch] = top * (1 - fy) + bot * fy;
                }
                out[o + 3] = 255;
            }
        }
        return { data: out, width: outW, height: outH };
    }

    return {
        findDocumentCorners: findDocumentCorners,
        orderCorners: orderCorners,
        warpSize: warpSize,
        warp: warp,
        polygonArea: polygonArea,
        convexHull: convexHull
    };
});