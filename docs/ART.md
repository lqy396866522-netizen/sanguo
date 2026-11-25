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

抠图算法：自动采样边框底色 → 从边界泛洪（连通阈值 140）→ 封闭孔洞仅在色差 ≤38 时移除 → alpha 在 70~140 渐变 → 去溢色 → MinFilter(3) 收边。

## 3. 分包策略

| 位置 | 加载时机 | 内容 | 体积 |
| --- | --- | --- | --- |
| `assets/resources/art/`（首包） | 启动 `loadCore()` | hero_lord、hero_zhaoyun、hero_huangzhong、monster_yellow、boss_zhangbao、bg_stage1、bg_hall、wall_battlement、road_tile、ui_panel、ui_button、ui_btn_green/blue/red/purple/gray、ui_card、ui_bar_bg、9 个 icon_* | ≈598KB |
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
| ui_btn_green | 320×92 | 40,30,40,30 | 确认 / 购买 / 强化 / 开始类按钮 |
| ui_btn_blue | 320×92 | 40,30,40,30 | 信息 / 跳转 / 次级操作按钮 |
| ui_btn_red | 320×92 | 40,30,40,30 | 关闭 / 撤退 / 危险操作按钮 |
| ui_btn_purple | 320×92 | 40,30,40,30 | 神兵 / 宝箱 / 稀有高亮按钮 |
| ui_btn_gray | 320×92 | 40,30,40,30 | 不可负担 / 锁定 / 置灰态按钮 |
| ui_card | 256×255 | 36,36,36,36 | 通用卡片 / 装备格 / 底部导航栏底板 |
| ui_bar_bg | 256×64 | 20,16,20,16 | 顶部数值条 / 提示条 / 进度槽背景 |
| wall_battlement | 750×285 | — | 主城与战场底部城墙女墙贴图 |
| road_tile | 128×128 | — | 战场行军土路平铺贴图 |
| icon_chest / icon_forge / icon_refine / icon_diamond / icon_gold / icon_stamina / icon_equip / icon_weapon / icon_shield | 96×96 | — | 商业化货币、宝箱、神兵、装备、强化、精炼、城防图标 |

## 5. 新增/替换素材流程

1. 按第 1 节模板生成原图，存入 `art_src/raw/<key>.jpg`。
2. 运行对应 `process_art.py` 子命令输出到 `art_src/out/`，用 `contact_sheet.py` 检查深色/草地双底下的边缘。
3. 复制到 `assets/resources/art/`（首包，慎用）或 `assets/bundles/art_battle/`。
4. 新 key 加入 `ArtAssetManager.ts` 对应映射表；打开 Cocos 编辑器让其生成 `.meta`。
