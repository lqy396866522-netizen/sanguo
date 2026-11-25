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
  drawCardPanel,
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

    const bg = createUINode('BaseBg', 750, 1750, this.root, 0, 0);
    drawRoundedBox(bg, 750, 1750, '#1F2A2E', 255, 0);
    ArtAssetManager.createSpriteNode(bg, 'bg_hall', 980, 1750, 0, 0);
    drawRoundedBox(bg, 750, 1750, '#10181C', 215, 0);

    const top = createUINode('Top', 710, 78, this.root, 0, 560);
    drawCardPanel(top, 710, 78, '#162024', '#78909C', 12, 2);
    createLabel(top, '城防基地', 26, '#FFD54F', -220, 0, 200, 34, true);
    ArtAssetManager.createSpriteNode(top, 'icon_gold', 26, 26, -20, 0);
    createLabel(top, `铜钱 ${p.gold}`, 19, '#FFE082', 65, 0, 140, 30, true);
    ArtAssetManager.createSpriteNode(top, 'icon_forge', 26, 26, 165, 0);
    createLabel(top, `锻造石 ${p.forgeStone}`, 19, '#B0BEC5', 255, 0, 150, 30, true);

    // 城池俯瞰示意：优先使用古风城墙贴图，辅以拒马与箭塔层级展示
    const scene = createUINode('Fort', 680, 290, this.root, 0, 340);
    const g = drawCardPanel(scene, 680, 290, '#24302A', '#78909C', 18, 2);
    const lv = (id: string) => p.baseTech[id] || 0;
    const spWall = ArtAssetManager.createSpriteNode(scene, 'wall_battlement', 640, 230, 0, -25);
    if (!spWall) {
      g.fillColor = hexToColor('#3E4A52', 255);
      g.roundRect(-318, -125, 636, 70 + lv('B_WALL') * 4, 8);
      g.fill();
      g.fillColor = hexToColor('#78909C', 255);
      for (let x = -308; x <= 280; x += 44) g.roundRect(x, -59 + lv('B_WALL') * 4, 28, 16, 3);
      g.fill();
    }
    if (lv('B_BARRICADE') > 0) {
      g.strokeColor = hexToColor('#8D6E63', 255);
      g.lineWidth = 5;
      const n = 3 + lv('B_BARRICADE') * 2;
      for (let i = 0; i < n; i++) {
        const x = -290 + (580 / n) * (i + 0.5);
        g.moveTo(x - 10, 48);
        g.lineTo(x + 10, 70);
        g.moveTo(x + 10, 48);
        g.lineTo(x - 10, 70);
      }
      g.stroke();
    }
    if (lv('B_TOWER') > 0) {
      for (const tx of [-268, 268]) {
        g.fillColor = hexToColor('#5D4037', 255);
        g.roundRect(tx - 22, -105, 44, 80 + lv('B_TOWER') * 5, 6);
        g.fill();
      }
    }
    if (lv('B_BEACON') > 0) {
      g.fillColor = hexToColor('#FF7043', 230);
      g.circle(0, 105, 14 + lv('B_BEACON') * 2);
      g.fill();
    }
    ArtAssetManager.createSpriteNode(scene, 'hero_lord', 96, 96, 0, -82);

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
      ArtAssetManager.createSpriteNode(cell, techIcons[t.id] || 'icon_shield', 56, 56, -295, 0);
      createLabel(cell, `${t.name}  Lv.${level}/${t.maxLevel}`, 23, TECH_COLORS[t.id] || '#FFFFFF', -65, 28, 360, 32, true);
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
        createLabel(cell, `消耗：铜钱 ${cost.gold} · 锻造石 ${cost.forgeStone}`, 16, '#FFE082', -45, -38, 410, 24);
        createButton(cell, '升级', 144, 56, canAfford ? '#2E7D32' : '#546E7A', () => {
          const r = this.dataMgr.upgradeBaseTech(t.id);
          showToast(this.root, r.msg);
          if (r.ok) this.render();
        }, 244, 0, 21);
      } else {
        createButton(cell, '已满级', 144, 56, '#546E7A', () => {}, 244, 0, 20);
      }
    });

    this.renderTabs('base');
  }
}
