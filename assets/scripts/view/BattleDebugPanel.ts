import { Label, Node } from 'cc';
import type { BattleWorld } from '../core/BattleWorld.ts';
import { getTargetTimeForLevel } from '../core/RunConfig.ts';
import { createButton, createLabel, createUINode, drawRoundedBox, showToast } from './UIFactory';

/**
 * 第1阶段数值校准 Debug 面板：
 * - 左上角可折叠小按钮（DBG），不遮挡正常操作；
 * - 实时显示：时间/波次、等级与经验、实际升级时间 vs 目标时间、敌人/武将数、城墙血量、连斩、FPS；
 * - 快捷按钮：跳波（+1 / W7 / W14 / W18 / W20）、秒杀全屏、+10 经验、压血至25%(测绝境三选一)、打印校准日志。
 */
export class BattleDebugPanel {
  private root: Node;
  private world: BattleWorld;
  private toggleNode: Node;
  private panel: Node;
  private lblStats: Label;
  private expanded = false;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private curFps = 60;
  private refreshTimer = 0;

  constructor(parent: Node, world: BattleWorld, showToggleByDefault = true, btnX = -312, btnY = 180) {
    this.root = parent;
    this.world = world;

    // 左侧功能栏 DBG 快捷入口按钮
    const toggleBtn = createButton(parent, '调试\nDBG', 96, 68, '#263238', () => {
      this.expanded = !this.expanded;
      this.panel.active = this.expanded;
      if (this.expanded) this.refreshText();
    }, btnX, btnY, 22);
    this.toggleNode = toggleBtn.node;
    this.toggleNode.setSiblingIndex(999);
    this.toggleNode.active = showToggleByDefault;

    this.panel = createUINode('DebugPanel', 380, 460, parent, -150, 220);
    drawRoundedBox(this.panel, 380, 460, '#10141C', 235, 14, '#4FC3F7', 2);
    createLabel(this.panel, '节奏与数值校准 (DBG)', 21, '#4FC3F7', 0, 204, 350, 30, true);

    this.lblStats = createLabel(this.panel, '', 17, '#ECEFF1', 0, 80, 352, 205, false);
    this.lblStats.horizontalAlign = Label.HorizontalAlign.LEFT;
    this.lblStats.verticalAlign = Label.VerticalAlign.TOP;

    // 快捷调试按钮（三排）
    const addBtn = (text: string, x: number, y: number, color: string, fn: () => void) => {
      createButton(this.panel, text, 112, 40, color, () => {
        fn();
        this.refreshText();
      }, x, y, 16);
    };

    addBtn('下1波', -118, -62, '#1565C0', () => {
      const next = Math.min(20, this.world.waveDirector.currentWaveIndex + 1);
      this.world.debugJumpWave(next);
    });
    addBtn('跳W7将', 0, -62, '#4527A0', () => this.world.debugJumpWave(7));
    addBtn('跳W14骑', 118, -62, '#4527A0', () => this.world.debugJumpWave(14));

    addBtn('跳W18医', -118, -108, '#6A1B9A', () => this.world.debugJumpWave(18));
    addBtn('跳W20王', 0, -108, '#B71C1C', () => this.world.debugJumpWave(20));
    addBtn('秒杀全屏', 118, -108, '#C62828', () => this.world.debugKillAllMonsters());

    addBtn('+10经验', -118, -154, '#2E7D32', () => this.world.debugAddExp(10));
    addBtn('血压25%', 0, -154, '#E65100', () => this.world.debugDamageWallTo(0.25));
    addBtn('打印日志', 118, -154, '#37474F', () => {
      const rep = this.world.getTelemetryReport();
      console.log('[Sanguo-Stage1-Telemetry]', JSON.stringify(rep));
      showToast(this.root, '已在控制台打印升级与血量曲线');
    });

    createButton(this.panel, '收起面板', 170, 40, '#455A64', () => {
      this.expanded = false;
      this.panel.active = false;
    }, 0, -202, 18);

    this.panel.active = false;
  }

  public get visible(): boolean {
    return this.toggleNode.active || this.expanded;
  }

  public setEnabled(on: boolean): void {
    this.toggleNode.active = on;
    this.expanded = on;
    this.panel.active = on;
    if (on) this.refreshText();
  }

  public update(realDt: number): void {
    this.fpsAccum += realDt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.curFps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }
    if (!this.expanded) return;
    this.refreshTimer += realDt;
    if (this.refreshTimer >= 0.2) {
      this.refreshTimer = 0;
      this.refreshText();
    }
  }

  private refreshText(): void {
    const w = this.world;
    const wave = w.waveDirector.currentWaveIndex;
    const nextTarget = getTargetTimeForLevel(w.battleLevel + 1);
    const lastLv = w.levelUpTimes[w.levelUpTimes.length - 1];
    const lvDiffStr = lastLv && lastLv.target != null
      ? `Lv${lastLv.level}: ${lastLv.elapsed}s (目标${lastLv.target}s, 差${(lastLv.elapsed - lastLv.target >= 0 ? '+' : '') + (lastLv.elapsed - lastLv.target).toFixed(1)}s)`
      : '尚无升级记录';
    const hpPct = Math.round((w.wallHp / Math.max(1, w.maxWallHp)) * 100);
    const depths = w.getAvgKillDepthByKind();
    const pDepth = Math.round((depths.pressure || 0) * 100);
    const rDepth = Math.round((depths.release || 0) * 100);
    const catchup = w.getCurrentCatchupMult().toFixed(2);

    this.lblStats.string = [
      `时间: ${w.elapsed.toFixed(1)}s | 波次: ${wave}/20 (${w.waveDirector.currentWaveKind})`,
      `等级: Lv.${w.battleLevel} (${w.battleExp.toFixed(1)}/${w.expNeeded}) 追赶:x${catchup} 下行:${w.waveDirector.downwardAssistTriggers}`,
      `最近升级: ${lvDiffStr}`,
      `击杀深度: 压力${pDepth}% / 释放${rDepth}% | 怪:${w.monsters.length} 将:${w.deployedHeroes.size}`,
      `城墙: ${w.wallHp}/${w.maxWallHp} (${hpPct}%) | 绝境:${w.crisisTriggered ? '已触' : '未触'}`,
      `连斩: x${w.combo.combo} (最高 x${w.combo.maxCombo}) | 击杀: ${w.kills}`,
      `FPS: ${this.curFps} | 倍速: x${w.userSpeed}`,
    ].join('\n');
  }
}
