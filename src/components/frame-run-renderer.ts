import { score, type State } from '../../shared/frame-run/simulation';
// Responsive camera changes only what is visible, never the simulation or its collision boxes.
export function draw(ctx: CanvasRenderingContext2D, s: State) {
    const canvas = ctx.canvas, width = canvas.clientWidth, height = canvas.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    if (!width || !height)
        return;
    const pixelsW = Math.round(width * dpr), pixelsH = Math.round(height * dpr);
    if (canvas.width !== pixelsW || canvas.height !== pixelsH) {
        canvas.width = pixelsW;
        canvas.height = pixelsH;
    }
    const viewport = width < 600 ? 480 : 1000;
    ctx.setTransform(pixelsW / viewport, 0, 0, pixelsH / 300, 0, 0);
    ctx.fillStyle = '#10131e';
    ctx.fillRect(0, 0, viewport, 300);
    ctx.strokeStyle = '#273044';
    ctx.lineWidth = 1;
    for (let x = 0; x < viewport + 120; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x - 120, 300);
        ctx.stroke();
    }
    ctx.fillStyle = '#8f9cff';
    ctx.fillRect(0, 265, viewport, 2);
    for (const o of s.obstacles) {
        ctx.fillStyle = '#edb882';
        ctx.fillRect(o.x / 100, 265 - o.height / 100, o.width / 100, o.height / 100);
        ctx.fillStyle = '#10131e';
        ctx.fillRect(o.x / 100 + 6, 265 - o.height / 100 + 6, 6, 6);
    }
    ctx.save();
    ctx.translate(136, 249 - s.y / 100);
    ctx.strokeStyle = '#b9afff';
    ctx.fillStyle = '#262d49';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = Math.PI / 3 * i;
        ctx.lineTo(Math.cos(a) * 19, Math.sin(a) * 19);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('F', -7, 8);
    ctx.restore();
    ctx.fillStyle = '#e9edff';
    ctx.font = '18px monospace';
    ctx.fillText('FRAME RUN', 24, 34);
    ctx.fillText(String(score(s.tick)).padStart(4, '0'), viewport - 100, 34);
}
