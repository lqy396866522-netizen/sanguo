# 音频素材登记表（AUDIO）

> 全部来自 [Pixabay](https://pixabay.com)（Pixabay Content License：可免费商用、游戏内使用无需署名），已排除 AI 生成条目与登记了 YouTube Content ID 的曲目（避免玩家录屏被版权申诉）。
> 运行时文件位于 `assets/bundles/audio/`（`audio` Bundle，微信子包），由 `AudioManager` 首次进入大厅时异步加载；加载完成前静音，不阻塞启动。

## 1. 工具链

| 步骤 | 命令 |
| --- | --- |
| 搜索音效 | `node tools/audio/pixabay_fetch.mjs search <rawDir> "crossbow shot" ...` |
| 搜索音乐 | `PIXABAY_KIND=music node tools/audio/pixabay_fetch.mjs search <rawDir> chinese ...` |
| 下载 | `node tools/audio/pixabay_fetch.mjs get <rawDir> sfx_hit=567196 ...`（同时写出 `<name>-source.json`） |
| 音效裁剪/归一/编码 | `python tools/audio/process_sfx.py <rawDir> assets/bundles/audio tools/audio/sfx_spec.json` |
| 找循环点 | `python tools/audio/find_loop.py <song.mp3> --preview seam.wav` |
| 切循环段 | `python tools/audio/cut_loop.py <src> assets/bundles/audio/<key>.mp3 <start> <end>` |

依赖：本机 Google Chrome + `playwright-core`（`PLAYWRIGHT_PATH` 指向其目录）；ffmpeg（可用 `pip install imageio-ffmpeg` 自带的静态版本加入 PATH）。
`pixabay_fetch.mjs`、`process_sfx.py`、`find_loop.py` 源自 game-asset-pipeline skill，本地副本增加了音乐搜索与 Content ID 标记。原始下载保存在仓库外（`C:\tmp\sfx_raw`、`C:\tmp\music_raw`），只有处理后的文件入库。

## 2. 处理参数

- 音效：去除前导静音（-50 dBFS 以下），按 `tools/audio/sfx_spec.json` 截断 + 淡出，单声道 44.1kHz，MP3 64kb/s。
  峰值：打击/暴击/爆炸 -1~-2 dBFS，挥砍/弓弩/法术 -3，UI/升级/卡牌 -4~-6。城门受击额外 3kHz 低通，表现木门闷响。
- 音乐：用 `find_loop.py` 找到乐曲自身重复的段落，单独切出作为运行时文件（Cocos `AudioSource` 只支持整段循环），首尾 15ms 淡变防爆音，立体声 64kb/s，峰值 -6~-7 dBFS。

| 曲目 | 原曲时长 | 循环段 | 周期 / 相似度 | 说明 |
| --- | --- | --- | --- | --- |
| bgm_hall | 98.3s | 21.25 → 67.00s | 45.75s / 0.75 | 大厅古风民乐 |
| bgm_battle | 168.7s | 4.50 → 40.50s | 36.00s / 1.00 | 乐曲以 12s 为单位严格重复，接缝无感 |
| bgm_boss | 14.8s | 0 → 14.769s | 8 小节 @130bpm | 原生循环战鼓；Boss 出场时由 BattleView 切换，0.8s 交叉淡入 |

## 3. 来源表

| 运行时文件 | Pixabay 标题 | 作者 | ID | 原始字节 | 运行时字节 |
| --- | --- | --- | --- | ---: | ---: |
| `sfx_crossbow.mp3` | Crossbow Shot | freesound_community | [85570](https://pixabay.com/sound-effects/85570/) | 37,440 | 4,640 |
| `sfx_crossbow_2.mp3` | Crossbow Firing | freesound_community | [95020](https://pixabay.com/sound-effects/95020/) | 28,800 | 4,640 |
| `sfx_spear.mp3` | Stab F# 01 - BRVHRTZ | BRVHRTZ | [224599](https://pixabay.com/sound-effects/224599/) | 52,662 | 4,640 |
| `sfx_slash.mp3` | Sword Slash and Swing | DavidDumaisAudio | [185432](https://pixabay.com/sound-effects/185432/) | 50,688 | 5,267 |
| `sfx_fire.mp3` | Fire Burst Flame Sound Effect | biww | [561958](https://pixabay.com/sound-effects/561958/) | 50,688 | 8,611 |
| `sfx_thunder.mp3` | Lightning Strike | DRAGON-STUDIO | [386161](https://pixabay.com/sound-effects/386161/) | 35,108 | 8,402 |
| `sfx_ice.mp3` | Ice Spell Impact | DRAGON-STUDIO | [448563](https://pixabay.com/sound-effects/448563/) | 150,528 | 8,611 |
| `sfx_hit.mp3` | Punch Impact Hit | Universfield | [567196](https://pixabay.com/sound-effects/567196/) | 50,991 | 3,386 |
| `sfx_hit_2.mp3` | Punch 03 | Universfield | [352040](https://pixabay.com/sound-effects/352040/) | 45,312 | 3,386 |
| `sfx_crit.mp3` | Sword Clash/Hit | DRAGON-STUDIO | [393837](https://pixabay.com/sound-effects/393837/) | 35,108 | 5,267 |
| `sfx_wall_hit.mp3` | Banging On Door | Universfield | [192163](https://pixabay.com/sound-effects/192163/) | 58,514 | 5,267 |
| `sfx_explosion.mp3` | Explosion Sound Effect | DRAGON-STUDIO | [425455](https://pixabay.com/sound-effects/425455/) | 92,928 | 12,581 |
| `sfx_heal.mp3` | Magic Twinkle | Universfield | [244951](https://pixabay.com/sound-effects/244951/) | 90,624 | 12,581 |
| `sfx_deploy.mp3` | Ancient War Drums | DRAGON-STUDIO | [463214](https://pixabay.com/sound-effects/463214/) | 242,688 | 10,074 |
| `sfx_levelup.mp3` | Level Up | Universfield | [191997](https://pixabay.com/sound-effects/191997/) | 58,514 | 12,581 |
| `sfx_card.mp3` | flipCard | freesound_community | [91468](https://pixabay.com/sound-effects/91468/) | 30,929 | 3,804 |
| `sfx_click.mp3` | Click Button | Universfield | [140881](https://pixabay.com/sound-effects/140881/) | 15,882 | 2,132 |
| `sfx_coin.mp3` | Coin Drop | Universfield | [229314](https://pixabay.com/sound-effects/229314/) | 41,472 | 6,939 |
| `sfx_victory.mp3` | Victory Fanfare | Universfield | [152480](https://pixabay.com/sound-effects/152480/) | 122,044 | 24,493 |
| `sfx_defeat.mp3` | Game Over Classic | Audley_Fergine | [206486](https://pixabay.com/sound-effects/206486/) | 117,504 | 20,523 |
| `bgm_hall.mp3` | Chinese Traditional | AtlasAudio | [617551](https://pixabay.com/music/617551/) | 3,146,396 | 366,593 |
| `bgm_battle.mp3` | Asian - Asian China Chinese Music | MondaMusic | [512897](https://pixabay.com/music/512897/) | 5,396,736 | 288,643 |
| `bgm_boss.mp3` | Horde War Drums loop 130bpm | WilliamHector | [342956](https://pixabay.com/sound-effects/342956/) | 473,965 | 118,743 |

合计：原始 ≈10.6MB → 运行时 **941,804 字节（≈920KB）**，全部位于子包，不占首包。

## 4. 事件映射

| 音效 | 触发点 |
| --- | --- |
| sfx_crossbow（2 变体随机） | 主公连弩每次射击（`lordAttackAnimTimer` 上升沿） |
| sfx_hit（2 变体随机）/ sfx_crit | `hit_spark` 特效事件，金色火花为暴击 |
| sfx_spear / sfx_slash | 穿刺枪、刀气、斩击、方天画戟 |
| sfx_fire / sfx_explosion / sfx_thunder / sfx_ice / sfx_heal | 火海、木牛爆炸、连锁闪电、冰霜新星、治疗城墙 |
| sfx_wall_hit | 城墙血量下降（0.25s 节流） |
| sfx_deploy | 武将上阵 / 换位 / 开局点将 |
| sfx_levelup / sfx_card | 主公升级弹出军策、选卡/刷新 |
| sfx_victory / sfx_defeat / sfx_coin | 结算、领取奖励 |
| sfx_click | `UIFactory.createButton` 统一挂载，所有按钮 |

## 5. 播放规则（`AudioManager`）

- 同一音效最短间隔（如弩 0.09s、命中 0.06s），0.12s 窗口内全局最多 8 个，防止高频打击糊成一片。
- 背景音乐 A/B 双声道 0.8s 交叉淡入淡出；切到后台（`Game.EVENT_HIDE`）暂停，回到前台恢复。
- 音乐、音效开关在暂停菜单中独立切换，存在 `localStorage` 的 `sanguo_audio_settings`，与存档分离。

## 6. 后续可替换

当前 BGM 为免版税曲库，若需要更贴合「三国」的原创配乐，可用 Suno 等工具按下列提示词生成后按第 2 节流程切循环替换：

- 大厅：`Instrumental background music for a Three Kingdoms tower-defense game: the lord's war camp between battles, banners in the wind. Calm, proud, ancient Chinese, steady, 90 bpm. Should feel like preparing for a great campaign. Instrumental, no vocals, seamless loop.`
- 战斗：`Instrumental background music for a Three Kingdoms tower-defense game: waves of Yellow Turban rebels charge the city wall. Tense, heroic, driving, fast, 128 bpm. Should make the player feel the pressure but in command. Instrumental, no vocals, seamless loop.`
- Boss：`Epic boss battle theme for a Three Kingdoms tower-defense game: a legendary general rides out to break the gate. Ominous, thunderous, relentless, 140 bpm, strong opening first bar. Instrumental, no vocals, seamless loop.`
