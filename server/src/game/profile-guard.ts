import type { PlayerProfile } from '../../../assets/scripts/core/types.ts';

// 客户端整档上行（PUT /player/profile）的合理性约束：
// 1. 关卡推进、星级、挑战进度只能由服务端战斗结算写入，上行值一律以服务端为准；
// 2. 货币/等级单次增幅设上限，超出部分截断并记审计日志；
// 3. 首次上传（本地存档迁移）只做绝对值上限截断。
export const PUT_LIMITS = {
  diamondDelta: 800,
  goldDelta: 300000,
  forgeStoneDelta: 400,
  refineStoneDelta: 200,
  levelDelta: 3,
  firstUpload: { diamond: 20000, gold: 5000000, level: 100, maxClearedStage: 50 },
};

export interface GuardResult {
  profile: PlayerProfile;
  violations: string[];
}

function isProfileShape(p: unknown): p is PlayerProfile {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.gold === 'number' &&
    typeof o.diamond === 'number' &&
    typeof o.level === 'number' &&
    typeof o.maxClearedStage === 'number' &&
    !!o.heroes && typeof o.heroes === 'object'
  );
}

function clampDelta(
  out: PlayerProfile,
  prev: PlayerProfile,
  field: 'gold' | 'diamond' | 'forgeStone' | 'refineStone' | 'level',
  maxDelta: number,
  v: string[]
): void {
  const before = Number(prev[field]) || 0;
  const after = Number(out[field]) || 0;
  if (after - before > maxDelta) {
    v.push(`${field}:+${after - before}>${maxDelta}`);
    out[field] = before + maxDelta;
  }
  if (!Number.isFinite(out[field]) || out[field] < 0) {
    v.push(`${field}:invalid`);
    out[field] = before;
  }
}

export function guardIncomingProfile(server: PlayerProfile | null, incoming: unknown): GuardResult | null {
  if (!isProfileShape(incoming)) return null;
  const out: PlayerProfile = JSON.parse(JSON.stringify(incoming));
  const v: string[] = [];

  if (!server) {
    const cap = PUT_LIMITS.firstUpload;
    if (out.diamond > cap.diamond) { v.push('first:diamond'); out.diamond = cap.diamond; }
    if (out.gold > cap.gold) { v.push('first:gold'); out.gold = cap.gold; }
    if (out.level > cap.level) { v.push('first:level'); out.level = cap.level; }
    if (out.maxClearedStage > cap.maxClearedStage) { v.push('first:stage'); out.maxClearedStage = cap.maxClearedStage; }
    return { profile: out, violations: v };
  }

  // 服务端权威字段
  out.maxClearedStage = server.maxClearedStage;
  out.challengeProgress = server.challengeProgress || {};
  const prog: PlayerProfile['stageProgress'] = {};
  for (const [sid, sp] of Object.entries(server.stageProgress || {})) {
    const inc = out.stageProgress?.[Number(sid)];
    // 宝箱领取位只能在服务端星级范围内设置
    const allowedMask = (1 << sp.bestStars) - 1;
    const claimed = ((inc?.claimedMask ?? sp.claimedMask) & allowedMask) | sp.claimedMask;
    prog[Number(sid)] = { ...sp, claimedMask: claimed };
  }
  out.stageProgress = prog;
  if ((out.schemaVersion || 0) < (server.schemaVersion || 0)) out.schemaVersion = server.schemaVersion;

  clampDelta(out, server, 'diamond', PUT_LIMITS.diamondDelta, v);
  clampDelta(out, server, 'gold', PUT_LIMITS.goldDelta, v);
  clampDelta(out, server, 'forgeStone', PUT_LIMITS.forgeStoneDelta, v);
  clampDelta(out, server, 'refineStone', PUT_LIMITS.refineStoneDelta, v);
  clampDelta(out, server, 'level', PUT_LIMITS.levelDelta, v);

  const maxStamina = Math.max(server.maxStamina || 0, out.maxStamina || 0);
  if (out.stamina > Math.max(maxStamina, server.stamina)) {
    v.push(`stamina:${out.stamina}>${maxStamina}`);
    out.stamina = Math.max(maxStamina, server.stamina);
  }
  return { profile: out, violations: v };
}
