// Integer physics shared verbatim by the renderer and verifier. No wall clock or Math.random.
export const RULES = { version: 1, generator: 1, inputFormat: 1, hz: 60, maxTicks: 5400, minTicks: 900, rewardTicks: 600, maxReward: 9, dailyCap: 30, expiryMs: 600000 } as const;
export type RunSession = {
    runId: string;
    seed: number;
    rules: typeof RULES;
    startedAt: number;
    expiresAt: number;
    accountId: string;
};
export type Obstacle = {
    x: number;
    width: number;
    height: number;
};
export type State = {
    tick: number;
    y: number;
    velocity: number;
    rng: number;
    next: number;
    obstacles: Obstacle[];
    ended: boolean;
};
export function initial(seed: number): State { return { tick: 0, y: 0, velocity: 0, rng: seed >>> 0 || 1, next: 100, obstacles: [], ended: false }; }
function random(s: State) { let x = s.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; s.rng = x >>> 0; return s.rng; }
export function step(s: State, jump: boolean) {
    if (s.ended)
        return s;
    if (jump && s.y === 0)
        s.velocity = 1050;
    s.y = Math.max(0, s.y + s.velocity);
    s.velocity = s.y ? s.velocity - 45 : 0;
    const speed = 600 + Math.floor(s.tick / 900) * 60;
    for (const o of s.obstacles)
        o.x -= speed;
    s.obstacles = s.obstacles.filter(o => o.x + o.width > 0);
    if (s.tick === s.next) {
        s.obstacles.push({ x: 100000, width: 2800, height: 3600 + random(s) % 1401 });
        s.next += 100 + random(s) % 31;
    }
    s.tick++;
    s.ended = s.tick >= RULES.maxTicks || s.obstacles.some(o => o.x < 15200 && o.x + o.width > 12000 && s.y < o.height);
    return s;
}
export function replay(seed: number, inputs: number[]) { const s = initial(seed); let i = 0; while (!s.ended) {
    step(s, inputs[i] === s.tick);
    if (inputs[i] === s.tick - 1)
        i++;
} if (i !== inputs.length)
    throw Error('Wejścia po zakończeniu rundy.'); return s; }
export const score = (tick: number) => Math.floor(tick / 6);
export const reward = (tick: number) => tick < RULES.minTicks ? 0 : Math.min(RULES.maxReward, Math.floor(tick / RULES.rewardTicks));
