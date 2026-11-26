# 美术素材登记表（ART）

> 二期美术升级产物。所有素材均由 AI 生图（Cursor 内置图像工具）生成原图，再经 `tools/art/process_art.py` 抠图/缩放/量化后入库。
> 原图保存在 `art_src/raw/`（请勿删除，重做抠图只需重跑脚本）；`art_src/out/` 为中间产物（已 gitignore）；`art_src/preview/` 为验收拼图。

## 1. 统一风格

- **风格基准**：Q 版 2.5 头身三国人物、厚描边、高饱和赛璐璐上色、俯视 3/4 角度，参考样张 `art_src/raw/style_*.jpg`（用户已确认）。
- **角色通用 Prompt 模板**：
  `chibi Three Kingdoms {角色描述}, full body, 3/4 top-down view facing down-left, thick dark outline, cel shading, mobile tower-defense game sprite, centered, solid flat {KEY} background, no shadow, no text`
- **背景通用 Prompt 模板**：
  `top-down 3/4 view tower defense battlefield, {场景描述}, a road from top to bottom ending at a city wall at the bottom, cartoon painterly style, no characters, no text, portrait 9:16`
- **抠图底色（KEY）**：默认品红 `#FF00FF`；角色主色为紫/粉/绿系时改用纯绿 `#00FF00`，避免抠掉衣物。
- **特效**：黑底生成，脚本按亮度转 alpha（适合 additive 观感），3×3 图集切片。
- **UI**：九宫格面板/按钮，运行时由 `ArtAssetManager` 设置 inset 并用 `Sprite.Type.SLICED`。

## 2. 处理参数

| 类型 | 命令 | 输出 |
| --- | --- | --- |
| 角色 | `python tools/art/process_art.py sprite <src> <dst> --size 256` | 256×256 PNG，256 色量化，约 25KB |
| 背景 | `python tools/art/process_art.py bg <src> <dst> --w 540 --h 960 --q 82` | 540×960 JPG |
| 特效 | `python tools/art/process_art.py vfxsheet <src> <outdir> <9个名字> --cols 3 --rows 3 --size 192` | 192×192 PNG |
| UI | `python tools/art/process_art.py ui <src> <dst> --size <w>` | 按钮不量化（避免渐变色带） |
| 预览 | `python tools/art/contact_sheet.py <out.png> <files...>` | 深色 + 草地双底预览 |
| 动效贴图 | `python tools/art/gen_fx_sprites.py` | `shine_bar` 64×256、`glow_circle` 128、`rays_star` 256、`fx_dot` 32、`fx_ring` 128；纯白 RGBA，**不量化**，合计约 32KB |

动效贴图（shine_bar / glow_circle / rays_star / fx_dot / fx_ring）一律是纯白 + alpha，运行时由 `ArtAssetManager.createFxNode()` 着色并设 **ADD 混合**（`SRC_ALPHA, ONE`）。不要用 256 色量化——曾因量化成 6 色调色板导致光晕/扫光几乎看不见。叠在卡片/按钮皮肤上的光晕、射线须用 `UIFactory.placeAboveSkin()` 定位，不能 `setSiblingIndex(0)`（会被不透明的皮肤 Sprite 盖住）。

抠图算法：自动采样边框底色 → 从边界泛洪（连通阈值 140）→ 封闭孔洞仅在色差 ≤38 时移除 → alpha 在 70~140 渐变 → 去溢色 → MinFilter(3) 收边。

## 3. 分包策略

| 位置 | 加载时机 | 内容 | 体积 |
| --- | --- | --- | --- |
| `assets/resources/art/`（首包） | 启动 `loadCore()` | hero_lord、hero_zhaoyun、hero_huangzhong、monster_yellow、boss_zhangbao、bg_stage1、bg_hall、bg_shop、bg_lord、bg_forge、ui_panel、ui_panel_cloud、ui_banner_eave、ui_card_wood、ui_card_red_vip、ui_btn_c_*、tab_q_*、商城立体图标与常用小图标、vfx_ice_arrows | ≈694KB |
| `assets/bundles/art_battle/`（微信子包） | 启动 0.5s 后 / 进战斗前 `loadBattle()` | 其余 10 武将、7 兵种、9 Boss、bg_stage2~10、9 个特效 | ≈1.6MB |

`art_battle` 与 `audio` 目录的 `.meta` 设置 `isBundle: true`、`bundleConfigID: "subpackage"`，对应 `settings/v2/packages/builder.json` 中的自定义 Bundle 配置（微信平台 = 子包）。若编辑器未识别，在「项目设置 → Bundle 配置」中新建同名配置并将 wechatgame 压缩类型设为「小游戏分包」即可。

素材缺失或分包加载失败时，所有渲染自动回退为原有的 Graphics 矢量绘制。

## 4. 素材清单

### 4.1 武将（`HERO_ART_KEY_MAP`）

| Key | 配置 ID | 角色 | 底色 | 位置 |
| --- | --- | --- | --- | --- |
| hero_lord | LORD | 主公（金甲红披风、连弩） | 品红 | 首包 |
| hero_zhaoyun | H01 | 赵云（银甲白袍、长枪） | 品红 | 首包 |
| hero_huangzhong | H02 | 黄忠（老将、长弓） | 品红 | 首包 |
| hero_zhangfei | H03 | 张飞（黑脸虬髯、丈八蛇矛） | 品红 | 分包 |
| hero_zhouyu | H04 | 周瑜（红袍、火焰羽扇） | 品红 | 分包 |
| hero_zhugeliang | H05 | 诸葛亮（纶巾、羽扇） | 品红 | 分包 |
| hero_guojia | H06 | 郭嘉（青衫书卷） | 品红 | 分包 |
| hero_guanyu | H07 | 关羽（红脸绿袍、青龙刀） | 品红 | 分包 |
| hero_lvbu | H08 | 吕布（紫金冠、方天画戟） | 绿 | 分包 |
| hero_diaochan | H09 | 貂蝉（粉纱舞扇） | 绿 | 分包 |
| hero_huatuo | H10 | 华佗（药箱、银针） | 品红 | 分包 |
| hero_huangyueying | H11 | 黄月英（机关木牛） | 品红 | 分包 |
| hero_jiaxu | H12 | 贾诩（紫袍毒瓶） | 绿 | 分包 |

### 4.2 兵种与 Boss（`MONSTER_ART_KEY_MAP`）

| Key | 配置 ID | 描述 | 底色 | 位置 |
| --- | --- | --- | --- | --- |
| monster_yellow | M_INFANTRY | 黄巾步兵 | 品红 | 首包 |
| monster_rattan | M_RATTAN | 藤甲兵 | 品红 | 分包 |
| monster_shield | M_SHIELD | 盾兵 | 品红 | 分包 |
| monster_cavalry | M_CAVALRY | 骑兵 | 品红 | 分包 |
| monster_kite | M_AIR_KITE | 风筝飞兵 | 品红 | 分包 |
| monster_shaman | M_SHAMAN | 太平道术士 | 绿 | 分包 |
| monster_catapult | M_CATAPULT | 投石车 | 品红 | 分包 |
| monster_bomber | M_BOMBER | 火药自爆兵 | 绿 | 分包 |
| boss_zhangbao | BOSS_ZHANGBO | 张宝 | 品红 | 首包 |
| boss_zhangjiao | BOSS_ZHANGJIAO | 张角 | 品红 | 分包 |
| boss_huaxiong | BOSS_HUAXIONG | 华雄 | 绿 | 分包 |
| boss_lubu | BOSS_LUBU | 吕布（Boss 版） | 绿 | 分包 |
| boss_wenchou | BOSS_WENCHOU | 文丑 | 绿 | 分包 |
| boss_caoren | BOSS_CAOREN | 曹仁 | 品红 | 分包 |
| boss_caimao | BOSS_CAIMAO | 蔡瑁 | 品红 | 分包 |
| boss_xiahoudun | BOSS_XIAHOUDUN | 夏侯惇（独眼，明确“人类非动物”） | 品红 | 分包 |
| boss_xiahouyuan | BOSS_XIAHOUYUAN | 夏侯渊 | 绿 | 分包 |
| boss_simayi | BOSS_SIMAYI | 司马懿 | 绿 | 分包 |

### 4.3 背景（`stageBgKey(n)` = `bg_stage{n}`）

| Key | 场景 | 位置 |
| --- | --- | --- |
| bg_hall | 大厅：城楼与旌旗 | 首包 |
| bg_stage1 | 黄巾之乱：麦田土路 | 首包 |
| bg_stage2 ~ bg_stage10 | 依关卡主题（山道、汜水关、虎牢关、河北平原、樊城、江陵水寨、潼关、赤壁、五丈原等） | 分包 |

### 4.4 特效（`VFX_ART_KEY_MAP`，192px，亮度即透明度）

| Key | 战斗事件 | 描述 |
| --- | --- | --- |
| vfx_fire | fire_zone | 火焰环 |
| vfx_ice | ice_nova | 冰晶爆 |
| vfx_poison | poison_swamp | 毒沼气泡 |
| vfx_smash | halberd_smash | 地面裂击 |
| vfx_explosion | wooden_ox_boom | 爆炸火球 |
| vfx_spark | hit_spark | 命中火花 |
| vfx_charm | charm_ring | 魅惑心环 |
| vfx_heal | heal_wall | 治疗绿光 |
| vfx_wind | wind_push | 旋风 |

`lightning_chain`、`slash_arc` 两类保留 Graphics 程序化绘制（线条类特效用贴图效果反而差）。

### 4.5 UI 与商业化控件（含地形贴图）

| Key | 尺寸 | 九宫格 inset (L,T,R,B) | 用途 |
| --- | --- | --- | --- |
| ui_panel | 256×255 | 64,64,64,64 | 全部弹窗底板（`ArtAssetManager.skinPanel`） |
| ui_button | 320×92 | 40,30,40,30 | 大厅主按钮「开始战斗」（金框橙底） |
| ui_btn_green / blue / red / purple / gray | 320×92 | 40,30,40,30 | 通用确认/信息/关闭/稀有/置灰态按钮 |
| ui_btn_c_gold / brown / green / blue / red | 240×86 | 34,24,34,24 | Q 版高光软倒角卡通厚涂立体按钮 |
| ui_panel_cloud | 220×220 | 44,44,44,44 | 主公装备页圆角暖木纹流云金边九宫格面板 |
| ui_card_wood / ui_card_red_vip | 280×100 | 32,26,32,26 | 军需商城暖棕木纹商品卡 / 暗红金角特权卡 |
| ui_banner_eave | 620×130 | — | 军需商城顶部双龙飞檐木雕无字横幅 |
| bg_shop / bg_lord | 540×960 | — | 军需账房底图 / 主公暖木流云底图 |
| tab_q_shop / lord / battle / hero / base | 96×96 | — | 全局底部 5 页签 Q 版饱满大图标 |
| icon_chest_gold / forge_ore / refine_crystal / gem_pouch / stamina_bag / crossbow_gift / treasure_pile / ingot_tray / ingot / coin_s | 96×96 | — | 军需商城立体厚涂道具与嵌币价签图标 |
| ui_card | 256×255 | 36,36,36,36 | 通用卡片 / 装备格 / 底部导航栏底板 |
| ui_bar_bg | 256×64 | 20,16,20,16 | 顶部数值条 / 提示条 / 进度槽背景 |
| wall_battlement | 750×285 | — | 主城与战场底部城墙女墙贴图 |
| road_tile | 128×128 | — | 战场行军土路平铺贴图 |
| icon_chest / icon_forge / icon_refine / icon_diamond / icon_gold / icon_stamina / icon_equip / icon_weapon / icon_shield | 96×96 | — | 商业化货币、宝箱、神兵、装备、强化、精炼、城防图标 |
| bg_hall / bg_forge | 375×667 JPG | — | 暗金三国沙盘大厅背景与深钢聚光锻造工坊背景 |
| ui_btn_gold / ui_parchment | 128×56 / 128×96 | 20,16,20,16 / 18,18,18,18 | 铆钉金按钮、暖羊皮纸数值对比底板 |
| cell_q1 ~ cell_q6 | 76×76 | 14,14,14,14 | 凡/良/精/史/传/无双六品质装备与宝石底框 |
| eq_1 ~ eq_6 / gem_hex / icon_talisman | 64×64 | — | 玉佩/扳指/战甲/战裙/战靴/护腕、六边形多面体宝石、黄金虎符图标 |
| tab_shop / tab_lord / tab_battle / tab_hero / tab_base | 48×48 | — | 底部统一导航栏五大模块图标 |

## 5. 新增/替换素材流程

1. 按第 1 节模板生成原图，存入 `art_src/raw/<key>.jpg`。
2. 运行对应 `process_art.py` 子命令输出到 `art_src/out/`，用 `contact_sheet.py` 检查深色/草地双底下的边缘。
3. 复制到 `assets/resources/art/`（首包，慎用）或 `assets/bundles/art_battle/`。
4. 新 key 加入 `ArtAssetManager.ts` 对应映射表；打开 Cocos 编辑器让其生成 `.meta`。
