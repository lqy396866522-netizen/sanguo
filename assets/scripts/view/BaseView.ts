import { Node } from 'cc';
import {
  BASE_TECH_CONFIGS,
  BASE_UNLOCK_LORD_LEVEL,
  baseTechCost,
} from '../core/phase2Configs.ts';
import type { PlayerDataManager } from '../data/PlayerDataManager.ts';
import {
  createButton,
  createLabel,
  createUINode,
  drawRoundedBox,
  hexToColor,
  showToast,
} from './UIFactory';
import { ArtAssetManager } from './ArtAssetManager';

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

    const bg = createUINode('BaseBg', 750, 1334, this.root, 0, 0);
    drawRoundedBox(bg, 750, 1334, '#1F2A2E', 255, 0);

    const top = createUINode('Top', 710, 74, this.root, 0, 560);
    drawRoundedBox(top, 710, 74, '#162024', 240, 12, '#78909C', 2);
    createLabel(top, '城防基地', 26, '#FFD54F', -220, 0, 200, 34);
    createLabel(top, `铜钱 ${p.gold}`, 19, '#FFE082', 60, 0, 170, 30);
    createLabel(top, `锻造石 ${p.forgeStone}`, 19, '#B0BEC5', 245, 0, 170, 30);

    // 城池俯瞰示意：城墙 + 拒马 + 两端箭塔，等级越高越完整
    const scene = createUINode('Fort', 680, 300, this.root, 0, 330);
    const g = drawRoundedBox(scene, 680, 300, '#2E3B33', 255, 18, '#546E7A', 2);
    const lv = (id: string) => p.baseTech[id] || 0;
    g.fillColor = hexToColor('#3E4A52', 255);
    g.roundRect(-320, -130, 640, 70 + lv('B_WALL') * 4, 8);
    g.fill();
    g.fillColor = hexToColor('#78909C', 255);
    for (let x = -310; x < 310; x += 44) g.roundRect(x, -64 + lv('B_WALL') * 4, 28, 16, 3);
    g.fill();
    if (lv('B_BARRICADE') > 0) {
      g.strokeColor = hexToColor('#6D4C41', 255);
      g.lineWidth = 5;
      const n = 3 + lv('B_BARRICADE') * 2;
      for (let i = 0; i < n; i++) {
        const x = -300 + (600 / n) * (i + 0.5);
        g.moveTo(x - 12, -6);
        g.lineTo(x + 12, 18);
        g.moveTo(x + 12, -6);
        g.lineTo(x - 12, 18);
      }
      g.stroke();
    }
    if (lv('B_TOWER') > 0) {
      for (const tx of [-280, 280]) {
        g.fillColor = hexToColor('#5D4037', 255);
        g.roundRect(tx - 26, -120, 52, 90 + lv('B_TOWER') * 8, 6);
        g.fill();
      }
    }
    if (lv('B_BEACON') > 0) {
      g.fillColor = hexToColor('#FF7043', 230);
      g.circle(0, 90, 14 + lv('B_BEACON') * 3);
      g.fill();
    }
    ArtAssetManager.createSpriteNode(scene, 'hero_lord', 110, 110, 0, -40);

    if (!this.dataMgr.isBaseUnlocked()) {
      createLabel(scene, `主公 Lv.${BASE_UNLOCK_LORD_LEVEL} 解锁城防基地（当前 Lv.${p.level}）`, 22, '#FF8A80', 0, 120, 640, 36);
    }

    BASE_TECH_CONFIGS.forEach((t, i) => {
      const level = lv(t.id);
      const full = level >= t.maxLevel;
      const y = 110 - i * 128;
      const cell = createUINode(`Tech_${t.id}`, 680, 116, this.root, 0, y);
      drawRoundedBox(cell, 680, 116, '#18232A', 240, 14, TECH_COLORS[t.id] || '#78909C', 2);
      createLabel(cell, `${t.name}  Lv.${level}/${t.maxLevel}`, 23, TECH_COLORS[t.id] || '#FFFFFF', -150, 28, 340, 32);
      const cur = level * t.perLevel;
      const next = (level + 1) * t.perLevel;
      const effect = full
        ? t.desc.replace('{v}', String(cur))
        : `${t.desc.replace('{v}', String(cur))} → ${next}`;
      createLabel(cell, effect, 17, '#E0E0E0', -120, -14, 400, 30);
      if (!full) {
        const cost = baseTechCost(level);
        createLabel(cell, `消耗：铜钱 ${cost.gold} · 锻造石 ${cost.forgeStone}`, 15, '#FFE082', -120, -42, 400, 24);
      }
      createButton(cell, full ? '已满级' : '升级', 150, 58, full || !this.dataMgr.isBaseUnlocked() ? '#546E7A' : '#2E7D32', () => {
        if (full) return;
        const r = this.dataMgr.upgradeBaseTech(t.id);
        showToast(this.root, r.msg);
        if (r.ok) this.render();
      }, 240, 0, 21);
    });

    this.renderTabs('base');
  }
}
