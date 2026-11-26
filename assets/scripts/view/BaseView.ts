import { Graphics, Node, tween, UIOpacity, Vec3 } from 'cc';
import {
  BASE_TECH_CONFIGS,
  BASE_UNLOCK_LORD_LEVEL,
  baseTechCost,
} from '../core/phase2Configs.ts';
import type { PlayerDataManager } from '../data/PlayerDataManager.ts';
import {
  attachBgMotes,
  attachGlowPulse,
  attachIdleBreath,
  attachNumberRoll,
  attachShineSweep,
  createButton,
  createLabel,
  createUINode,
  drawCardPanel,
  drawRoundedBox,
  hexToColor,
  playBurstParticles,
  playGlowRing,
  playShakeDeny,
  showToast,
} from './UIFactory';
import { BreathMode, FloatStyle, FloatText } from '../fx';
import { ArtAssetManager } from './ArtAssetManager';
import { AudioManager } from './AudioManager';

type TabKey = 'shop' | 'lord' | 'hall' | 'hero' | 'base';

const TECH_COLORS: Record<string, string> = {
  B_WALL: '#78909C',
  B_BARRICADE: '#8D6E63',
  B_TOWER: '#FFB74D',
  B_BEACON: '#EF5350',
  B_GRANARY: '#AED581',
};

// 城防基地：城墙 / 拒马 / 箭塔 / 烽火台 / 粮仓五项科技，效果直接进入战斗
export class BaseView {
  private static pendingTech: { id: string; oldLevel: number } | null = null;
  private root: Node;
  private dataMgr: PlayerDataManager;
  private renderTabs: (active: TabKey) => void;

  constructor(root: Node, dataMgr: PlayerDataManager, renderTabs: (active: TabKey) => void) {
    this.root = root;
    this.dataMgr = dataMgr;
    this.renderTabs = renderTabs;
    this.render();
  }

  public render(): void {
    this.root.removeAllChildren();
    const p = this.dataMgr.profile;

    const bg = createUINode('BaseBg', 750, 1750, this.root, 0, 0);
    drawRoundedBox(bg, 750, 1750, '#1F2A2E', 255, 0);
    ArtAssetManager.createSpriteNode(bg, 'bg_hall', 980, 1750, 0, 0);
    drawRoundedBox(bg, 750, 1750, '#10181C', 215, 0);
    attachBgMotes(bg, 5, 640, 1000, '#B7D7E8');

    const top = createUINode('Top', 710, 78, this.root, 0, 560);
    drawCardPanel(top, 710, 78, '#162024', '#78909C', 12, 2);
    createLabel(top, '城防基地', 26, '#FFD54F', -220, 0, 200, 34, true);
    ArtAssetManager.createSpriteNode(top, 'icon_gold', 26, 26, -20, 0);
    createLabel(top, `铜钱 ${p.gold}`, 19, '#FFE082', 65, 0, 140, 30, true);
    ArtAssetManager.createSpriteNode(top, 'icon_forge', 26, 26, 165, 0);
    createLabel(top, `锻造石 ${p.forgeStone}`, 19, '#B0BEC5', 255, 0, 150, 30, true);

    // 城池俯瞰示意：优先使用古风城墙贴图，辅以拒马与箭塔层级展示
    const scene = createUINode('Fort', 680, 290, this.root, 0, 340);
    drawCardPanel(scene, 680, 290, '#24302A', '#78909C', 18, 2);
    const lv = (id: string) => p.baseTech[id] || 0;
    const spWall = ArtAssetManager.createSpriteNode(scene, 'wall_battlement', 640, 230, 0, -25);
    // 建筑画在独立子节点：卡片皮肤 Sprite 是 scene 的子节点，画在 scene 自身 Graphics 上会被整块盖住
    const bld = createUINode('Buildings', 680, 290, scene, 0, 0);
    const gb = bld.addComponent(Graphics);
    if (!spWall) {
      gb.fillColor = hexToColor('#3E4A52', 255);
      gb.roundRect(-318, -125, 636, 70 + lv('B_WALL') * 4, 8);
      gb.fill();
      gb.fillColor = hexToColor('#78909C', 255);
      for (let x = -308; x <= 280; x += 44) gb.roundRect(x, -59 + lv('B_WALL') * 4, 28, 16, 3);
      gb.fill();
    }
    if (lv('B_BARRICADE') > 0) {
      gb.strokeColor = hexToColor('#8D6E63', 255);
      gb.lineWidth = 5;
      const n = 3 + lv('B_BARRICADE') * 2;
      for (let i = 0; i < n; i++) {
        const x = -290 + (580 / n) * (i + 0.5);
        gb.moveTo(x - 10, 48);
        gb.lineTo(x + 10, 70);
        gb.moveTo(x + 10, 48);
        gb.lineTo(x - 10, 70);
      }
      gb.stroke();
    }
    if (lv('B_TOWER') > 0) {
      for (const tx of [-268, 268]) {
        gb.fillColor = hexToColor('#5D4037', 255);
        gb.roundRect(tx - 22, -105, 44, 80 + lv('B_TOWER') * 5, 6);
        gb.fill();
        // 箭塔火把闪烁
        attachGlowPulse(scene, 46, '#FFB74D', tx, -105 + 80 + lv('B_TOWER') * 5 + 6, false, { minOpacity: 80, maxOpacity: 230, scaleAmp: 0.2, period: 0.55 });
      }
    }
    if (lv('B_BEACON') > 0) {
      gb.fillColor = hexToColor('#FF7043', 230);
      gb.circle(0, 105, 14 + lv('B_BEACON') * 2);
      gb.fill();
      // 烽火闪烁
      attachGlowPulse(scene, 70 + lv('B_BEACON') * 6, '#FF8A50', 0, 105, false, { minOpacity: 90, maxOpacity: 255, scaleAmp: 0.18, period: 0.7 });
    }
    const lordSp = ArtAssetManager.createSpriteNode(scene, 'hero_lord', 96, 96, 0, -82);
    if (lordSp) attachIdleBreath(lordSp, { mode: BreathMode.Scale, amp: 0.015, period: 1.8 });

    if (!this.dataMgr.isBaseUnlocked()) {
      createLabel(scene, `主公 Lv.${BASE_UNLOCK_LORD_LEVEL} 解锁城防基地（当前 Lv.${p.level}）`, 22, '#FF8A80', 0, 112, 640, 36, true);
    }

    const techIcons: Record<string, string> = {
      B_WALL: 'icon_shield',
      B_BARRICADE: 'icon_forge',
      B_TOWER: 'icon_weapon',
      B_BEACON: 'icon_refine',
      B_GRANARY: 'icon_stamina',
    };
    BASE_TECH_CONFIGS.forEach((t, i) => {
      const level = lv(t.id);
      const full = level >= t.maxLevel;
      const y = 115 - i * 124;
      const cell = createUINode(`Tech_${t.id}`, 680, 114, this.root, 0, y);
      drawCardPanel(cell, 680, 114, '#18232A', TECH_COLORS[t.id] || '#78909C', 14, 2);
      const techSp = ArtAssetManager.createSpriteNode(cell, techIcons[t.id] || 'icon_shield', 56, 56, -295, 0);
      const lvLbl = createLabel(cell, `${t.name}  Lv.${level}/${t.maxLevel}`, 23, TECH_COLORS[t.id] || '#FFFFFF', -65, 28, 360, 32, true);
      const pend = BaseView.pendingTech && BaseView.pendingTech.id === t.id ? BaseView.pendingTech : null;
      if (pend) {
        // 完成：等级数字滚动 + 闪白 + 光环 + 飘字
        attachNumberRoll(lvLbl.node, pend.oldLevel, { prefix: `${t.name}  Lv.`, suffix: `/${t.maxLevel}`, duration: 0.5 }).rollTo(level);
        const flash = createUINode('DoneFlash', 680, 114, cell, 0, 0);
        drawRoundedBox(flash, 680, 114, '#FFFFFF', 220, 14);
        const fop = flash.addComponent(UIOpacity);
        fop.opacity = 255;
        tween(fop).to(0.45, { opacity: 0 }).call(() => { if (flash.isValid) flash.destroy(); }).start();
        playGlowRing(this.root, new Vec3(-295, y, 0), 100, '#FFD54F');
        FloatText.show(this.root, cell.worldPosition, '修筑完成!', FloatStyle.levelUp);
      }
      const cur = level * t.perLevel;
      const next = (level + 1) * t.perLevel;
      const hasPct = t.desc.includes('{v}%');
      const curText = hasPct ? `${cur}%` : `${cur}`;
      const nextText = hasPct ? `${next}%` : `${next}`;
      const baseEffect = t.desc.replace('{v}%', curText).replace('{v}', curText);
      const effect = full ? baseEffect : `${baseEffect} → ${nextText}`;
      createLabel(cell, effect, 17, '#E0E0E0', -45, -10, 410, 28);
      if (!full) {
        const cost = baseTechCost(level);
        const canAfford = this.dataMgr.isBaseUnlocked() && p.gold >= cost.gold && p.forgeStone >= cost.forgeStone;
        if (canAfford && techSp) {
          // 可升级提示：图标呼吸 + 红点摆动
          attachIdleBreath(techSp, { mode: BreathMode.Scale, amp: 0.04, period: 1.3 });
          const dot = createUINode('RedDot', 16, 16, cell, -268, 26);
          drawRoundedBox(dot, 16, 16, '#E53935', 255, 8, '#FFD54F', 1);
          attachIdleBreath(dot, { mode: BreathMode.Swing, amp: 10, period: 0.6, interval: 3, randomDelay: 2 });
        }
        createLabel(cell, `消耗：铜钱 ${cost.gold} · 锻造石 ${cost.forgeStone}`, 16, '#FFE082', -45, -38, 410, 24);
        const upBtn = createButton(cell, '升级', 144, 56, canAfford ? '#2E7D32' : '#546E7A', () => {
          const r = this.dataMgr.upgradeBaseTech(t.id);
          showToast(this.root, r.msg);
          if (r.ok) {
            // 施工：图标锤击抖动 + 三次锤击火花 → 0.65s 后重绘并播完成反馈
            BaseView.pendingTech = { id: t.id, oldLevel: level };
            const iconPos = new Vec3(-295, y, 0);
            for (let k = 0; k < 3; k++) {
              tween(cell).delay(k * 0.2).call(() => {
                AudioManager.playSfx('sfx_wall_hit');
                playBurstParticles(this.root, new Vec3(iconPos.x + (k - 1) * 10, iconPos.y - 6, 0), 7, '#FFB74D');
                if (techSp) tween(techSp).to(0.05, { angle: -10 }).to(0.08, { angle: 8 }).to(0.05, { angle: 0 }).start();
              }).start();
            }
            tween(this.root).delay(0.65).call(() => {
              if (this.root.getChildByName('BaseBg')) this.render();
            }).start();
          } else {
            playShakeDeny(upBtn.node);
            FloatText.show(this.root, upBtn.node.worldPosition, r.msg, FloatStyle.warn);
          }
        }, 244, 0, 21);
        if (canAfford) attachShineSweep(upBtn.node, 144, 56, { loop: true, interval: 3.0, randomDelay: 1.2 });
      } else {
        createButton(cell, '已满级', 144, 56, '#546E7A', () => {}, 244, 0, 20);
      }
    });

    BaseView.pendingTech = null;
    this.renderTabs('base');
  }
}
