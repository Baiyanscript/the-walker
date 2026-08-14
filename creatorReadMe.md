# 这里会教学告诉你如何修改/增加内容
 非常简单,学会一下这些就行
 只有一点 "卡牌" 的教程是作者写的
 **其余由AI提供 也建议用AI新增内容 因为代码质量不高**

 ## 目录结构

```
src/
├── app.ux                 # 全局: playerInfo / playCardPool
├── manifest.json          # 路由: index/map/fighting/reward/shop/detail
├── common/
│   ├── lib.js             # ★ 汇聚出口(页面 import 路径不变)
│   ├── storage.js         # 存档读写(0~10 存档位)
│   ├── game.js            # loadAllPlayerInfos / saveForAuto
│   ├── core_*.js          # 引擎机制层(不依赖业务, core=机制)
│   │   ├── core_basics.js #   数值修改唯一入口: changeHP/AP/DP/Gold, dealDamage, fixDamage
│   │   ├── core_skill.js  #   技能执行器: buildSkillCtx(三角色 ctx) / runSkill
│   │   ├── core_effect.js #   效果执行器: doEffect / fireEffect / effectClear
│   │   ├── core_draw.js   #   牌堆纯函数: shuffleArray / refillDrawPool / recycleHandToDiscard
│   │   ├── core_economy.js#   回收价 / 商店价 统一公式
│   │   └── core_utils.js  #   delay / generateUid
│   ├── fun_*.js           # 函数实现层(内容库, fun=函数)
│   │   ├── fun_skill.js   #   skill_LIB(技能实现, 三角色语义) + MOB_UNUSABLE_SKILLS 黑名单
│   │   ├── fun_effect.js  #   effect_LIB(持续效果, trigger/dedupe/run 三段式)
│   │   ├── fun_preferences.js # actionPref_LIB(sAct 行动偏好)
│   │   └── fun_details.js #   detail_LIB + getSkillDetail/getCardDetail/getMobDetail
│   ├── battle/
│   │   └── flow.js        # ★ 战斗流程逻辑层(从 fighting.ux 抽出): gacha / summonMob / checkMobDeath / cleanDeath / isWin
│   │                      #   页面(界面代码区)仍可自行调用 fireEffect; 页面状态经参数注入, 回调返回页面行为
│   └── data/
│       ├── cards.js       # card_LIB + 稀有度索引 + createCard*
│       ├── mobs.js        # mob_LIB + 稀有度索引 + createMob*
│       ├── relics.js      # relic_LIB + gainRelic / rollRelicCandidates(遗物系统)
│       └── presets.js     # 预设: 战士(均衡) / 富二代少爷(开局 10 金币, 低血量) + GLOBAL_LEVEL_SCRIPT 固定层脚本
└── pages/
    ├── index.ux           # 主菜单 + 多存档(自动+1~10 位: 覆盖/删除/加载)
    ├── map.ux             # 地图: 关卡生成 + 难度曲线 + 区域分流 + 固定层脚本展开
    ├── fighting.ux        # 战斗: 出牌/怪物行动/回合结算/界面反馈(抽卡/召唤/死亡结算/胜负判定在 common/battle/flow.js)
    ├── reward.ux          # 奖励区: 获得卡牌/篝火/强化卡牌/回收区/融合区/遗物
    ├── shop.ux            # 商店: 卡牌 + 奖励类型商品(金币消费端)
    └── detail.ux          # 超级详情页: 数据结构 + 技能/buff 源码(长按进入)
```

## 命名规则

- 技能键: `skill_shared_*`(玩家怪物共用) / `skill_card_*`(卡牌) / `skill_mob_*`(怪物)
- 效果键: `effect_*`
- 模板键: 中文卡名/怪名即可; 若希望 fork/合并, 建议 `你的标识_keyName` 防冲突

## 技能上下文: 三角色语义(核心)

技能函数签名 `(ctx) => {}`, ctx 由 `buildSkillCtx` 构造:

| 字段 | 含义 | 典型用法 |
|---|---|---|
| `source` | 数值来源(卡牌或怪物) | `power`/`level` 只从它读取 |
| `actor` | 执行者(玩家或怪物) | "对自己生效"的操作(护盾/自疗/耗AP) |
| `target` | 作用对象 | 攻击/上 buff 的目标 |
| `playerInfo` / `mobList` / `handPool` / `drawPool` | 环境注入 | 金币/全体/手牌/存档牌库 |
| `battlePool` / `discardPool` | 环境注入(战斗内) | 战斗内抽牌堆/弃牌堆(抽牌/洗回/释放卡用) |
| `fireEffect` | when_damaged 触发通道 | `dealDamage(..., { fireEffect: ctx.fireEffect, ... })` 显式传参触发受击效果 |

规则: 数值修改必须走 `basics.js`, 禁止裸改 `xxx.HP += n`。

## 效果触发时机(trigger)

| trigger | 时机 | exDate |
|---|---|---|
| `when_nextTurn` | 过回合时, 先于行动结算 | `{}` |
| `when_damaged` | 实际扣到生命后 | `{damage, actor}` |
| `when_death` | 死亡移除前 | `{}` |
| `when_act` | 行动前(可改传入的 ctx) | `{ctx, buildSkillCtx}` |
| `when_player_act` | 玩家行动时(扫怪物组, 与 when_act 语义隔离) | `{ctx, buildSkillCtx}` |
| `when_turnEnd` | 回合末(pre/post 双阶段) | `{phase}` |
| `when_detox` | 主动解毒 | `{}` |
| `when_shuffle` | 洗牌时(抽牌堆空洗回弃牌堆) | `{}` |
| `when_stageend` | 战斗结束 | `{}` |
| `when_fightstart` | 每场战斗开始(仅一次, 遗物用) | `{}` |

怪物 `nextTurn` 三态: 有值=指定行动 / `undefined`=随机掷 / `null`=发呆(沉默用)。

## 牌堆机制(杀戮尖塔化)

- 战斗内四堆: 抽牌堆(存档牌库副本) / 手牌 / 弃牌堆 / 消耗(exhaust)。
- 打出牌 → 弃牌堆; 回合结束手牌 → 弃牌堆; 抽牌堆空 → 弃牌堆随机洗回再抽(core_draw.js 纯函数)。
- 洗牌时触发 `when_shuffle`(遗物·日晷计数用, 抽卡流程与剑柄打击等抽牌技能口径一致)。
- 带 `exhaust: true` 的卡(如不死图腾)打出后不进弃牌堆, 本场战斗不再回归。
- 保底卡"牌库已空"为**一次性应急牌**: 仅"抽牌开始时双堆全空"才补、整轮只补一张(生成即 break)、
  `exhaust + isFallback` 标记——打出即销毁, 回合末未打出也直接销毁, 彻底不进弃牌堆循环。

## 遗物系统(杀戮尖塔化)

- `relic_LIB`(data/relics.js)定义遗物, 遗物 = 永久 buff(`restTurn:"inf"`, 跨战斗常驻), 部分带 onGain 即时生效(草莓/芒果)。
- `gainRelic(player, key)` 挂载(同名唯一, 重复拒绝); `rollRelicCandidates(count, excludeKeys)` 抽取候选(排除已拥有)。
- 遗物以"遗物·名"效果渲染, 无单独遗物栏; 获取渠道: 遗物区三选一 / 商店遗物商品 / 奖励入口。

## 一次性强化(杀戮尖塔化)

- 卡牌升级改为一次性强化: 模板 `upgrade` 配置 + `tplKey` 字段, `upgradeCard(card)` 原地强化(每卡仅一次, `upgraded` 标记, 名字加"+")。
- 奖励卡 30% 概率直接出"+"版(`upgraded: true` 创建即强化); BOSS 奖励必强化; 状态卡(rare:"status")不可强化。
- 篝火分档: 满血进入提最大生命; 非满血回 maxHP×60% 封顶满血 + 强化打折。

## 工厂函数

- `createCard(nameKey, detail)` / `createCardByRare(rare, detail)` — 实例含 `rare`(回收/商店计价)、`tplKey`(强化模板)、`exhaust`、`upgraded`; `upgraded: true` 创建即强化版
- `createMob(keyName, detail)` / `createMobByRare(rare, detail)` — `nextTurn` 自动掷骰; `setAct`/`actAs`/对象模式 act/`sAct` 偏好
- 怪物 act 双模式: 数组 = `actIndex` 循环遍历; 对象 = 加权随机 + 黑名单(`blackList`/`banTime`, `markActUsed` 标记使用)
- 详细参数见各文件 JSDoc。

## 持久化

- `playerInfo_0~10` / `playCardPool_0~10` — 0 为自动存档位, 1~10 手动位
- `saveForAuto(player, cardPool)` 存自动位; 突破上限的 AP 会原样保存, 跨关卡保留

## 区域机制(地图节点)

- 节点 = `{mobSet?, rlevel, rpushKey}`: 有 `mobSet` 先打战斗, 胜利后按 `rpushKey` 分流到 reward 页或独立页(商店)
- `rpushKey` 由 `map.ux` 权重池随机: 获得卡牌/篝火/强化卡牌/回收卡牌/融合卡牌/遗物/商店
- `rlevel` = 奖励等级(纯奖励=关卡-1 / 普通=关卡 / 困难=关卡+2), 决定商店价/回收价/融合参数; 支持 `"hard"` 快捷值(= ceil(stage/10)+2)
- **固定层脚本** `GLOBAL_LEVEL_SCRIPT`(presets.js): 25 层老渔夫 BOSS 战(`exDate.isBoss + limitedCards` 限定卡奖励) / 49 层 6 个高奖励入口 / 50 层 MC好成 BOSS 战; 角色可配 `levelScript`(如富二代少爷第 1 层必商店)

## 经济闭环

- 回收价 = 关卡 × 卡牌level × rare(丢失取 2); 商店价 = 回收价 × 1.5
- 金币来源: 通用掉落(rare×level×2) + 贪婪之刃(伤害50%) + 黄金史莱姆(攻击送钱/死亡爆金)
- 金币消耗: 商店(卡牌 + 奖励强化 rlevel×3 + 遗物商品 rlevel×5)

## 难度曲线

| 阶段 | 纯奖励率 | 困难率 | 稀有度上限 |
|---|---|---|---|
| 前期(≤10关) | 1/3 | 1/6 | 1→2→3 逐步解锁(≤4关仅rare1 / ≤7关含rare2 / 之后rare3) |
| 中期(11~30关) | 1/4 | 1/4 | 3 |
| 后期(>30关) | 1/6 | 1/3 | 3(等级膨胀, 两极分化) |

注: 固定层(25/49/50)由 GLOBAL_LEVEL_SCRIPT 整层替换随机生成。

## 思路与教程:如何添加新的卡牌
很显然，我们需要构思一张新的卡牌——衔尾蛇
1.语义分析:每次打出这张卡时 在本存档内 该卡power(倍率)永久+1 同时 下回合回到手中(返还机制, 杀戮尖塔化重写版)

2.观察对于技能组能操作的上下文(完整字段请查看common/core_skill.js 的 buildSkillCtx)

### 观察/创建 传入上下文
```js
/**
 * 构造标准技能上下文
 * @param {Object} p - 上下文输入
 * @param {Object} p.source       - 数值来源(卡牌实例 或 怪物实例), 必填
 * @param {Object} p.actor        - 执行者(玩家 或 怪物), 必填
 * @param {Object} p.target       - 作用对象, 必填
 * @param {number} [p.targetIndex=-1] - 目标在怪物列表中的索引(横扫等需要)
 * @param {Object} p.playerInfo   - 玩家对象(环境注入)
 * @param {Array}  p.mobList      - 当前怪物组(环境注入)
 * @param {Array}  p.handPool     - 当前手牌(环境注入, 供复制/入手的技能使用)
 * @param {Array}  p.drawPool     - 存档牌库(环境注入, 供"永久强化"类技能写回)
 * @param {Array}  [p.battlePool] - 战斗内抽牌堆(存档副本, 供"抽牌"类技能使用)
 * @param {Array}  [p.discardPool]- 战斗内弃牌堆(供"抽牌"类技能空时洗回)
 * @returns {Object} 标准 ctx
 * ⭐ ctx.fireEffect: when_damaged 触发能力(dealDamage 需显式传 { fireEffect: ctx.fireEffect, ... })
 */
```
观察到 **ctx 中没有通往存档牌库的入口——无法对原始卡组(全局卡组)进行修改**
则我们需要增加新的上下文传入:

**src/common/core_skill.js**	buildSkillCtx 增加 drawPool 字段(注意: 函数签名的参数解构 与 返回对象 都要加上!)
**src/pages/fighting/fighting.ux**	useCard 传 drawPool 字段

玩家出牌场景(useCard 中)示例:
```js
const ctx = buildSkillCtx({
    source: card,                // 数值来源: 打出的卡牌
    actor: this.playerInfo,      // 执行者: 玩家
    target: mob,                 // 作用对象: 选中的怪物
    targetIndex: mobIndex,
    playerInfo: this.playerInfo,
    mobList: this.MobPool,
    handPool: this.fightPlayercardPool,

    drawPool: this.$app.$def.playCardPool //<新增> 存档牌库的引用, 供"永久强化"类技能写回
      })
```
⭐ 容易踩的坑: 只改调用处是不够的——`buildSkillCtx` 的**函数签名解构里也要接住 drawPool**, 否则返回对象引用未定义变量, 运行时会直接 ReferenceError(编译检查不出来, 一打出牌就崩)
**对于延迟刷新/持续效果等,请使用effect(见 common/fun_effect.js 与 common/core_effect.js), 不要在技能里自己写 setTimeout**

### 新skill(技能)设计
给个名字吧:skill_card_ouroboros(命名规范: 通用技能用 skill_shared_*、卡牌专属用 skill_card_*、效果用 effect_*; 若以插件/扩展作者身份贡献, 可用自己的前缀如 superHero_xxx 避免冲突)
再具体的流程(杀戮尖塔化后为"返还"机制):
1. 源卡 power+1, 存档牌库中同 uid 卡同步 +1(存档级增强)
2. 本卡存入"返还"buff(effect_return, dedupe:false), 下回合开始时从弃牌堆拿回手牌
3. 返还卡在 buff 内部流转, 不进弃牌堆——避免洗牌回归造成复制

设计代码并写入 **common/fun_skill.js**的skill_LIB中
```js
    skill_card_ouroboros: (ctx) => {
        // 1. 源卡 power+1(打出后存入返还, 下回合回手时已增强)
        ctx.source.power = (ctx.source.power || 0) + 1
        // 2. 存档同 uid 卡同步 +1(存档级增强, 非深拷贝)
        if (ctx.drawPool) {
            const inPool = ctx.drawPool.find(c => c.uid === ctx.source.uid)
            if (inPool) inPool.power += 1
        }
        // 3. 存入返还: 下回合还回手牌(dedupe:false 不去重, 携带 card 引用)
        if (ctx.actor) {
            addEffect(ctx.actor, {
                key: "effect_return",
                restTurn: 1,
                level: 1,
                isRemove: false,
                card: ctx.source
            })
        }
    },
```
返还效果位于 **common/fun_effect.js**(when_nextTurn 触发, 从弃牌堆拿回手牌防复制):
```js
    "effect_return": {
        trigger: ["when_nextTurn", "when_stageend"],
        dedupe: false, // 不去重: 每张返还卡独立挂载, 防合并丢失 card 引用
        run: (eff_ctx) => {
            const card = eff_ctx.effSelf.card
            if (!card) return
            // 从弃牌堆移除(防卡复制), 再回手牌
            const discard = eff_ctx.discardPool || []
            const idx = discard.indexOf(card)
            if (idx !== -1) discard.splice(idx, 1)
            if (eff_ctx.handPool) eff_ctx.handPool.push(card)
            eff_ctx.effSelf.isRemove = true // 一次性
        }
    },
```

同时为这个写界面文本detail——位于**common/fun_details.js** 其中新建**同名键**(与技能键名一致)skill_card_ouroboros
```js
    "skill_card_ouroboros": (source, SD) => {
        return `打出时倍率永久+1, 下回合返还回手`
    },
```
detail 函数签名 `(source, SD)`: SD=true 时为"超级详情"长文案, 否则为卡面短文案(手表屏幕较小, 描述文本请尽可能简短)

### 创造新的完整的卡牌
刚刚为了这个卡牌的业务写了新技能,那么我们需要导入这个卡的实际能力
在**common/data/cards.js**的前半部分
```js
    "衔尾蛇": {
        name: "衔尾蛇", power: 1, rare: 2, costAP: 3,
        upgrade: { costAP: 1 }, // 强化配置: 3费 -> 2费(一次性强化用)
        doSkill: ["skill_card_ouroboros", "skill_shared_attack"]//攻击操作就直接复用,不要自己造轮子
    },
```
只要填入了 rare 那么在 抽卡区域或者任意调用createdByRare抽中
说明: cardByRare 稀有度索引是自动生成的, 填了 rare 字段即自动入池, 无需额外注册; 各稀有度的抽取权重硬编码在 pages/reward/reward.ux 的 rareWeights 中(稀有度1:6 / 2:3 / 3:1), createCardByRare 本身是在池内等概率抽取

### 验证
改完后运行 `npm run build` 确认编译通过, 再用 AIoT-IDE 模拟器实测闭环:
打出衔尾蛇 → 牌库中该卡 power+1, 卡进入返还(手牌移除); 下回合开始时自动回手(power 已 +1);
再次打出(无论原卡还是返还回手的) → 存档再次 +1, 越打越强



## 思路与教程:添加一个复杂的效果
我们希望添加一个让别人叠层后让敌人沉默,且缓慢中毒,并在单次对其输入伤害超过5点时自刎归天并自爆随机伤害2个怪物的效果吧
**由于过于复杂,在detail中不管怎么都难写,则我们只给范例 没有实际创建这张卡片 如果你喜欢可以跟着教程引入实例中去**

我们命名这个effect为"爆炸诅咒"

### 关于effect的触发器(trigger)与可操作的上下文(ctx)
先看在写这篇文档前有的状态:

**现有 trigger(触发时机)一览** —— 触发点全部在 pages/fighting/fighting.ux 的战斗流程中, 经 common/core_effect.js 的 fireEffect 分发:

| trigger | 触发时机 | exDate 附加数据 |
|---|---|---|
| `when_nextTurn` | 点击"过"进入下一回合时: 先玩家、再逐个存活怪物, 均**先于**行动结算 | `{}`(无) |
| `when_damaged` | 实体实际受到生命伤害后(护盾吸收的部分不计): 玩家出牌打怪物 / 怪物行动打玩家 | `{ damage: 实际扣血数, actor: 攻击者 }` |
| `when_death` | 实体死亡时(HP<=0): 怪物死亡移除前 / 玩家死亡时 | `{}`(无) |
| `when_turnEnd` | 回合结束 AP/DP 结算前后**各触发一次(仅玩家)**: pre=结算前 / post=结算后 | `{ phase: "pre" \| "post" }` |
| `when_act` | **行动前**触发: 玩家出牌前 / 每个怪物行动前(狂乱类 buff 在此重定向行动目标) | `{}`(无) |
| `when_player_act` | 玩家行动时, 只扫怪物组(替罪羊/不屈的钓鱼佬/学习技能用, 与 when_act 语义隔离) | `{}`(无) |
| `when_detox` | 主动解毒(快速充能等) | `{}`(无) |
| `when_shuffle` | 洗牌时(抽牌堆空洗回弃牌堆, 日晷计数) | `{}`(无) |
| `when_stageend` | 战斗结束(清理跨战斗效果, 如神格/返还) | `{}`(无) |
| `when_fightstart` | 每场战斗开始一次(遗物生效用) | `{}`(无) |

**双阶段 trigger 的用途 —— 以"虚弱"为例(使玩家下一回合 AP 不重置)**:
结算顺序是 `pre触发 → AP回满 → DP清零 → post触发`。效果在 pre 阶段把当前 AP 记到 buff 本体, post 阶段覆盖回去, 等于"这次回满没发生":
```js
    /**
     * 虚弱: 使玩家下一回合 AP 不重置。
     * 跨阶段存值用 effSelf(buff 自己维护), 不要用 exDate(每次触发重建的临时数据)。
     */
    "effect_weakness": (eff_ctx) => {
        if (eff_ctx.trigger !== "when_turnEnd") return
        if (eff_ctx.exDate.phase === "pre") {
            eff_ctx.effSelf.savedAP = eff_ctx.owner.AP   // ① 结算前记录
        } else if (eff_ctx.exDate.phase === "post") {
            if (typeof eff_ctx.effSelf.savedAP === "number") {
                eff_ctx.owner.AP = eff_ctx.effSelf.savedAP  // ② 结算后覆盖, 阻止回满
            }
            eff_ctx.effSelf.restTurn -= 1                 // ③ 持续回合结算
            if (eff_ctx.effSelf.restTurn <= 0) eff_ctx.effSelf.isRemove = true
        }
    },
```

**效果上下文 eff_ctx(由 fireEffect 构造, 效果函数收到的就是这个对象)**:

| 字段 | 含义 | 说明 |
|---|---|---|
| `owner` | 效果持有者(玩家或怪物) | 想改谁的状态就操作它 |
| `trigger` | 本次触发时机 | 用 `if (eff_ctx.trigger === "when_death")` 判断分支 |
| `effSelf` | 效果本体 | `{key, restTurn, level, isRemove}`; 减回合/标记移除都改它 |
| `exDate` | 触发附加数据 | 内容随 trigger 不同而不同(见上表) |
| `mobList` | 当前怪物组(数组) | 可 push 新怪实现"召唤", 也可遍历给全体上状态 |
| `playerInfo` | 玩家对象 | 可直接操作(如扣 AP/HP) |
| `handPool` / `discardPool` | 手牌/弃牌堆 | 返还类效果用(死亡返还等注入) |
| `battlePool` / `drawPool` | 战斗内抽牌堆/存档牌库 | checkMobDeath 注入(蕴含卡牌等用) |

**效果本体 effSelf 字段约定**:
- `key` - 效果键名, 必须存在于 effect_LIB(common/fun_effect.js)
- `restTurn` - 剩余回合数(数字); 永久效果可用 `"inf"`, 但注意不要在逻辑里对它做减法
- `level` - 效果等级(强度数值, 如毒伤 2 级 = 每回合 4 点)
- `isRemove` - 置为 `true` 后, 本回合触发结束时会被 effectClear 自动从 effect 数组移除

**效果条目结构(杀戮尖塔化后为三段式)**:
```js
    "效果键名": {
        trigger: ["when_nextTurn", ...], // 声明响应的时机数组, 未命中则跳过执行
        dedupe: false,                   // 默认可省略(true=去重合并); false=每次独立挂载(携带 card 等独有数据时必须)
        run: (eff_ctx) => { /* 逻辑 */ }
    }
```
- 旧版"纯函数即效果"格式已废弃——doEffect 按 `entry.trigger` 声明分发, 只写函数会导致 warn 且不执行

**写 effect 时的注意点**:
- 数值修改一律走 common/core_basics.js 的 changeHP/changeDP/changeAP, 不要裸改 `xxx.HP += n`
- `when_damaged` 只在"实际扣到生命"时触发, 护盾吸收的部分不计入 exDate.damage; 需要判断"单次受击是否超过 X 点"就读 `eff_ctx.exDate.damage`
- 持续伤害(毒)在 `when_nextTurn` 中自行结算并递减 restTurn, 结束时置 `isRemove = true`
- 死亡召唤(如"死变骷髅")在 `when_death` 中向 mobList push 新怪即可(cleanDeath 先触发再移除, 新怪不会被误删)
- effect 内无法直接调用页面方法(纯逻辑层); "自杀/自爆"类效果在效果内把 owner 血量扣到 0, 由战斗流程的 cleanDeath 统一结算; 如需流程精确处死单个怪, 用 common/battle/flow.js 的 `checkMobDeath(mob, {mobPool, playerInfo, ...})`(单独检测一个怪是否死亡, 死亡则触发 when_death 并移除, 返回是否死亡)
- 怪物 nextTurn 三态语义: **有值**=已指定行动直接用 / **undefined**=未指定, 由 rollNextTurn 随机产生 / **null**=不行动(发呆)。沉默类效果可在 when_nextTurn 里把 `owner.nextTurn` 置为 null, 优雅且不用动战斗流程

### 从需求到代码:以"自爆诅咒"为例(完整参考)
把我们想要的效果拆成 trigger 触发点:
1. **叠层** —— 由一张卡/技能给目标挂上或加深效果(层数存在 effSelf.level)
2. **沉默** —— when_nextTurn 里把 owner.nextTurn 置为 null
3. **缓慢中毒** —— when_nextTurn 里按层数扣血(真实伤害, 直接扣 HP 不走护盾)
4. **受击超一定自刎** —— when_damaged 里读 exDate.damage
5. **自爆带走2怪** —— when_death 里从 mobList 挑

完整代码 —— 写入 common/fun_effect.js 的 effect_LIB 中(changeHP 已从 core_basics.js 导入):
```js
    "effect_curseBoom": {
        trigger: ["when_nextTurn", "when_damaged", "when_death"],
        run: (eff_ctx) => {
            const { owner, trigger, exDate, effSelf, mobList } = eff_ctx

            if (trigger === "when_nextTurn") {
                owner.nextTurn = null                        // ① 沉默: 怪物发呆
                changeHP(owner, -(effSelf.level || 1) * 2)   // ② 缓慢中毒: 每层每回合 2 点
            }

            if (trigger === "when_damaged") {
                if ((exDate.damage || 0) > 5) {
                    changeHP(owner, -9999999)                // ③ 受击超5: 自刎归天(钳制到0)
                }
            }

            if (trigger === "when_death") {
                const others = (mobList || []).filter(m => m !== owner && m.HP > 0)
                for (let i = 0; i < 2 && others.length > 0; i++) {  // ④ 自爆: 随机带走2个
                    const idx = Math.floor(Math.random() * others.length)
                    changeHP(others[idx], -9999999)
                    others.splice(idx, 1)
                }
            }
        }
    },
```

叠层入口 —— 需要一张卡和一个技能(common/data/cards.js + common/fun_skill.js):
```js
    // cards.js 的 card_LIB 中
    "诅咒蔓延": {
        name: "诅咒蔓延", power: 1, rare: 1, costAP: 1,
        doSkill: ["skill_card_curse"]
    },

    // skills.js 的 skill_LIB 中 —— 叠层: 已有诅咒则层数+1, 没有则挂上
    skill_card_curse: (ctx) => {
        ctx.target.effect = ctx.target.effect || []
        const eff = ctx.target.effect.find(e => e.key === "effect_curseBoom")
        if (eff) {
            eff.level += 1
        } else {
            ctx.target.effect.push({
                key: "effect_curseBoom",
                restTurn: "inf",   // 诅咒持续到死亡, 不自动移除
                level: 1,
                isRemove: false
            })
        }
    },

    // details.js 的 detail_LIB 中(同名键)
    "effect_curseBoom": (eff) => `自爆诅咒lv.${eff.level || 1}: 沉默+中毒, 受击>5自爆`,
    "skill_card_curse": () => `给目标叠1层自爆诅咒`,
```

**设计要点回顾**:
- 沉默用的就是 nextTurn=null 的三态语义, 一行代码, 不动战斗流程
- 自刎/自爆都是"把血扣到 0", 死亡结算完全交给 cleanDeath, 效果之间互不调用
- 层数即 effSelf.level, 叠层/中毒伤害都围绕它展开; 想要"诅咒越叠越疼"就调毒伤公式
- 所有数值修改都走了 changeHP, 没有一处裸改血量

刚刚那是AI总结的 非常复杂
总之——我们这里有 1.当受伤时(when_damaged) 2.当死亡时(when_death) 3.下一回合时(when_nextTurn) 足够完成业务
我们设计新技能

和上文一样填入一个新的 用于叠层的技能设计:
1.每次这个技能都会检索目标的技能组
2.则叠加层数(level) (或创建这个buff) 并为其特殊标签exDate(写入"isLevelUp"),当然这个写入的字是每个effect自己维护的

随后我们设计effect的对接:
触发器when_nextTurn:
1. 检测层数(level > 2) 则 changeHP 伤害自己
2. 检测层数(level > 3) 则 将nextTurn 改为 null(使得下一回合无行动,实现了“沉默”) 并让level -1
3. 检测exDate 如果 有  isLevelUp 则移除 否则 level -1

触发器when_damage:
1. 若满足 实际造成伤害大于 10-level 则对自己造成9999的伤害 并 对自己触发 cleanDeath

触发器when_death
1. 检测层数(level > 1 ) 则随机抽取两个幸运小怪(可能抽到自己,总之随便抽得了)
对他们造成level * 2的伤害

接下来是参考代码(未写入):
```js
    // ============ 1. 叠层技能 —— common/fun_skill.js 的 skill_LIB 中 ============
    // 每次使用: 检索目标效果组 -> 有则层数+1, 无则创建 -> 写入"刚叠过"标签
    skill_card_curse: (ctx) => {
        ctx.target.effect = ctx.target.effect || []
        let eff = ctx.target.effect.find(e => e.key === "effect_curseBoom")
        if (eff) {
            eff.level += 1
        } else {
            eff = {
                key: "effect_curseBoom",
                restTurn: "inf",   // 持续到死亡, 不自动移除
                level: 1,
                isRemove: false
            }
            ctx.target.effect.push(eff)
        }
        // 特殊标签写入效果本体(exDate 字段由每个 effect 自己维护, 此处为"本回合刚叠过层")
        eff.exDate = eff.exDate || {}
        eff.exDate.isLevelUp = true
    },

    // ============ 2. 效果本体 —— common/fun_effect.js 的 effect_LIB 中 ============
    "effect_curseBoom": {
        trigger: ["when_nextTurn", "when_damaged", "when_death"],
        run: (eff_ctx) => {
            const { owner, trigger, exDate, effSelf, mobList } = eff_ctx
            const lv = effSelf.level || 1

            if (trigger === "when_nextTurn") {
                // ① 层数 > 2: 缓慢中毒, 每回合扣自己 lv*2 血(数值可调)
                if (lv > 2) {
                    changeHP(owner, -lv * 2)
                }
                // ② 层数 > 3: 沉默(nextTurn=null 发呆) 并消耗 1 层
                if (lv > 3) {
                    owner.nextTurn = null
                    effSelf.level -= 1
                }
                // ③ 刚叠过层 -> 移除标签(本回合不衰减); 否则自然衰减 1 层
                if (effSelf.exDate && effSelf.exDate.isLevelUp) {
                    delete effSelf.exDate.isLevelUp
                } else {
                    effSelf.level -= 1
                }
            }

            if (trigger === "when_damaged") {
                // ④ 单次实际受击 > 10-lv(层越高阈值越低) -> 自刎归天
                // 注: 效果是纯逻辑层, 无法调用页面 cleanDeath;
                //     扣到 0 即可, 出牌/过回合流程末尾的 cleanDeath 会统一结算死亡
                if ((exDate.damage || 0) > 10 - lv) {
                    changeHP(owner, -9999999)
                }
            }

            if (trigger === "when_death") {
                // ⑤ 层数 > 1: 自爆, 随机抽 2 个怪物(可能抽到自己, 随便抽)造成 lv*2 伤害
                if (lv > 1) {
                    const pool = (mobList || []).slice()
                    for (let i = 0; i < 2 && pool.length > 0; i++) {
                        const idx = Math.floor(Math.random() * pool.length)
                        changeHP(pool[idx], -lv * 2)
                        pool.splice(idx, 1)
                    }
                }
            }
        }
    },

    // ============ 3. 卡牌模板 —— common/data/cards.js 的 card_LIB 中 ============
    "诅咒蔓延": {
        name: "诅咒蔓延", power: 1, rare: 1, costAP: 1,
        doSkill: ["skill_card_curse"]
    },

    // ============ 4. 描述文本 —— common/fun_details.js 的 detail_LIB 中 ============
    "effect_curseBoom": (eff) => `自爆诅咒lv.${eff.level || 1}: 层>2中毒/层>3沉默, 受击>${10 - (eff.level || 1)}自爆`,
    "skill_card_curse": () => `给目标叠1层自爆诅咒`,//是很长吧？
```
当然,这里似乎缺少了一个trigger的设计,下文也有

## 思路与教程:添加一个新的区域(以"卡牌融合区"为例)
如果说卡牌/技能/效果是"内容", 那区域(reward区)就是"把这些内容装进去的容器"。
我们的融合区: 随机抽两张卡询问是否融合, 融合后逐参数抽取继承、技能合并, 两张换一张(还带惩罚)。

### 先看懂区域的运行机制(3 个概念)
1. **rpushKey** —— 节点类型字符串("获得卡牌"/"篝火"/"强化卡牌"/"融合卡牌"/"遗物"等), reward 页面用 `if/elif` 按它渲染不同 UI
2. **rlevel** —— 奖励等级, 也就是区域的"难度等级"。生成时: 纯奖励=关卡-1 / 普通战斗胜利=关卡 / 困难战斗胜利=关卡+2
3. **数据流** —— map.rollLevel 生成节点 → enter() 按有无 mobSet 分流 → 战斗胜利后 fighting.Win() 把**同一个节点对象**(含 rpushKey 和 rlevel)原样传给 reward 页。所以**战斗胜利后也会进融合区**, 且 rlevel 更高, 打硬仗奖励更丰厚——这是既定机制, 新区域自动继承

### 第一步: 加入口 (src/pages/map/map.ux 的 rollLevel)
节点从 reward_weight 权重池随机, 加一项即可(现状权重: 商店1/强化5/篝火3/获得5/回收3/融合1/遗物2):
```js
    const reward_weight = [
      {name: "商店", w: 1},
      {name: "强化卡牌", w: 5},
      {name: "篝火", w: 3},
      {name: "获得卡牌", w: 5},
      {name: "回收卡牌", w: 3},
      {name: "融合卡牌", w: 1}   // <新增> 融合是"稀有玩法", 权重给低点
      {name: "遗物", w: 2}
    ]
```

### 第二步: 两阶段界面 (src/pages/reward/reward.ux)
区域往往不是"一个页面一步操作", 而是多阶段(询问→结果)。用 private 字段 `fusionState` 控制阶段:
```js
    fusionState: "ask",   // ask=询问是否融合 / result=展示融合结果
    fusionCards: [],      // [{card, poolIndex}], poolIndex=-1 表示临时卡(不可销毁)
    fusionResult: {},     // 融合出的新卡
```
模板 —— 两阶段用 if/elif 切换(注意: if/elif 必须是相邻兄弟节点):
```html
    <!-- 融合卡牌 -->
    <block elif='{{ rpushKey=="融合卡牌" }}'>
      <div class="pageBackGround">
        <text class="text" if="{{ fusionState === 'ask' }}">是否融合以下两张卡?</text>
        <text class="text" elif="{{ fusionState === 'result' }}">融合成功!</text>
        <!-- 询问阶段: 展示 A、B -->
        <list class="scroll-ground" style="flex-direction: row" if="{{ fusionState === 'ask' }}">
          <list-item type="fusion" for="{{ fusionCards }}" class="card-background">
            <text class="text">{{ fusionTxt($item.card) }}</text>
          </list-item>
        </list>
        <!-- 结果阶段: 展示融合卡 -->
        <list class="scroll-ground" style="flex-direction: row" elif="{{ fusionState === 'result' }}">
          <list-item type="fusionresult" class="card-background">
            <text class="text">{{ fusionTxt(fusionResult) }}</text>
          </list-item>
        </list>
        <div if="{{ fusionState === 'ask' }}" class="button-place">
          <input type="button" class="btn" style="width: 50%" value="融合" onclick="doFusion" />
          <input type="button" class="btn" style="width: 50%; background-color: red" value="跳过" onclick="savedAndBack" />
        </div>
        <input elif="{{ fusionState === 'result' }}" type="button" class="btn" style="width: 100%" value="下一关" onclick="savedAndBack" />
      </div>
    </block>
```
"跳过"/"下一关"都复用现有的 savedAndBack(存档+跳地图), 新区域不用写自己的收尾逻辑。
power 参数只在融合区展示(其他地方不展示): 用专用文本函数, 不碰全局的 getCardDetail:
```js
  fusionTxt(card) {
    return getCardDetail(card) + `|power:${card.power}|`
  },
```

### 第三步: 抽取素材 A、B (onInit)
随机抽 2 张 → 洗牌取前 2 并**保留原始索引**(供后续销毁)。牌库不足 2 张时, 用"牌库已空"临时卡补齐, 以 poolIndex=-1 标记:
```js
    if (this.rpushKey === "融合卡牌") {
      this.fusionState = "ask"
      this.fusionCards = []
      const pool = this.playCardPool
      if (pool.length > 0) {
        const shuffled = pool.map((card, poolIndex) => ({card, poolIndex}))
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          const tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp
        }
        this.fusionCards = shuffled.slice(0, Math.min(2, pool.length))
      }
      while (this.fusionCards.length < 2) {
        this.fusionCards.push({
          card: createCard("斩击", {level: 1, name: "牌库已空"}),
          poolIndex: -1
        })
      }
    }
```

### 第四步: 融合计算 (doFusion) —— 本区域的核心
按 power → level → costAP 顺序**逐参数独立抽取**(每个参数各 roll 一次 good/bad):
- good 概率 = min(50 + rlevel×5, 95), rlevel 越高越容易出好参数
- good = 取更优(power/level 取高, costAP 取低); bad = 取较差
```js
  doFusion() {
    if (this.fusionState !== "ask") return
    const A = this.fusionCards[0].card
    const B = this.fusionCards[1].card
    const goodRate = Math.min(50 + (this.rlevel || 1) * 5, 95)
    const roll = () => Math.random() * 100 < goodRate
    const pickBetter = (a, b) => (roll() ? Math.max(a, b) : Math.min(a, b))
    const pickBetterCost = (a, b) => (roll() ? Math.min(a, b) : Math.max(a, b))
    const fPower = pickBetter(A.power || 0, B.power || 0)
    const fLevel = pickBetter(A.level || 1, B.level || 1)
    const fCost = pickBetterCost(A.costAP || 1, B.costAP || 1)

    // 技能组去重合并
    const doSkill = []
    for (const s of [...(A.doSkill || []), ...(B.doSkill || [])]) {
      if (!doSkill.includes(s)) doSkill.push(s)
    }

    // 融合卡: 全新 uid, 名字"融合卡", rare=0 作为融合惩罚(回收价值归零)
    this.fusionResult = {
      uid: generateUid(),
      name: "融合卡",
      level: fLevel,
      power: fPower,
      costAP: fCost,
      doSkill,
      rare: 0
    }

    // 销毁 A、B: 按原索引从大到小 splice; 临时"牌库已空"卡(poolIndex=-1)跳过, 防止报错
    const toDelete = this.fusionCards
      .map((x) => x.poolIndex)
      .filter((i) => i >= 0)
      .sort((a, b) => b - a)
    for (const i of toDelete) {
      this.playCardPool.splice(i, 1)
    }
    this.playCardPool.push(this.fusionResult)  // 融合卡加入牌库
    this.fusionState = "result"
    prompt.showToast({message: `融合成功!`, duration: 1000})
  }
```

### 第五步: 坑与边界
- **销毁索引**: 融合前先记录 poolIndex, 删除时**从大到小** splice, 否则索引错乱删错卡
- **临时卡防错**: 牌库不足时借来的"牌库已空"卡 poolIndex=-1, 销毁环节被 filter 掉, 不会 splice 出错
- **融合卡无模板**: 它是手动构造的对象(不是 card_LIB 成员), createCard 只认 card_LIB 的键。但注意: 融合素材是从**牌库**抽取的, 融合卡在牌库里**会被再次抽中当素材**(字段齐全可正常参与); 防止无限融合靠的是: 2张换1张的牌库递减 + 技能并集去重(不叠加) + rare=0 经济惩罚
- **同卡融合**: A、B 技能相同时去重后只剩一套, 融合卡等于"属性强化版"——这是"不重复相加"的既定语义

### 验证
`npm run build` 通过后, 模拟器实测: 进入融合区 → 看 A、B 展示(含 power) → 融合 → 看融合卡 → 下一关; 融合后牌库 A、B 消失、融合卡(rare=0)加入; 牌库不足 2 张时也能正常进入并融合(借来的卡不会被销毁)。

## 思路与教程:蕴含卡牌与老渔夫 BOSS(新机制示例)

老渔夫(25 层固定 BOSS)展示了几个进阶机制的组合用法: 蕴含卡牌 / 怪物召唤 / 目标重定向。

### 蕴含卡牌 effect_embedCard —— "怪物死亡时打出一张卡"

核心工具效果: 挂在怪物身上, 怪物死亡(when_death)时**以怪物本体为使用者**对目标 T 打出一张卡 C。
exDate 存 `{card, target}`, ctx 在触发时用 buildSkillCtx 现建(不要预构建存 exDate——战斗内引用会失效)。

```js
    "effect_embedCard": {
        trigger: ["when_death"],
        dedupe: false, // 每只怪各带一张卡, 不去重(防丢 card 引用)
        run: (eff_ctx) => {
            const ex = eff_ctx.effSelf.exDate || {}
            const C = ex.card || createCard("斩击", { level: Math.max((eff_ctx.owner.level || 1) - 2, 1) })
            const T = ex.target || eff_ctx.playerInfo // 缺省打玩家
            if (!C || !T) return
            const ctx = buildSkillCtx({
                source: C, actor: eff_ctx.owner, target: T,
                targetIndex: (eff_ctx.mobList || []).indexOf(T),
                playerInfo: eff_ctx.playerInfo, mobList: eff_ctx.mobList,
                handPool: eff_ctx.handPool, drawPool: eff_ctx.drawPool,
                battlePool: eff_ctx.battlePool, discardPool: eff_ctx.discardPool
            })
            for (const sk of C.doSkill || []) runSkill(sk, ctx)
            // 释放的卡去向按"打出"语义: exhaust 销毁, 普通卡进弃牌堆(可洗回)
            if (C.exhaust !== true && Array.isArray(eff_ctx.discardPool)) {
                eff_ctx.discardPool.push(C)
            }
        }
    },
```
要点:
- checkMobDeath 触发 when_death 时注入 handPool/discardPool/battlePool/drawPool 四池(common/battle/flow.js, 原 fighting.ux 内联实现已抽出), 效果内才拿得到牌池
- 蕴含卡牌释放 = "打出"语义: 销毁类卡(粘液)按 uid 删存档、衔尾蛇成长等均照常生效

### 怪物召唤 + 覆盖模板效果 exDate(钓鱼)

老渔夫的"钓鱼"技能召唤腐烂的鱼, 并**覆盖模板自带蕴含卡牌的 exDate**(T=老渔夫本体):
```js
    skill_mob_fishCast: (ctx) => {
        const count = Math.floor(Math.random() * 3) + 2 // 2~4 只等概率
        for (let i = 0; i < count; i++) {
            const fish = createMob("腐烂的鱼", { level: ctx.actor.level || 1 })
            if (!fish) continue
            // 模板自带 effect_embedCard(T=玩家), 技能内硬编码覆盖 exDate -> T=老渔夫
            const embed = fish.effect.find(e => e.key === "effect_embedCard")
            if (embed) {
                embed.exDate = { card: /* 基础斩击副本 */, target: ctx.actor }
            }
            ctx.mobList.push(fish)
        }
    },
```
注意: 用"修改已存在效果条目的 exDate"而非再 addEffect——dedupe:false 会挂两份, 死亡时双触发。

### 目标重定向(不屈的钓鱼佬)—— 复用 when_player_act

老渔夫常驻 buff: 玩家出牌目标为老渔夫本体时, 目标替换为空靶子(老渔夫免疫直接单体攻击):
```js
    "effect_fishermanSpirit": {
        trigger: ["when_player_act"],
        run: (eff_ctx) => {
            const ctx = eff_ctx.exDate && eff_ctx.exDate.ctx
            if (!ctx || !ctx.target || ctx.target !== eff_ctx.owner) return
            // 复用场上已有空靶子, 防连续打老渔夫时无限累积
            const DUMMY_NAME = "只有大鱼才能让钓鱼佬心服口服" // 空靶子主题名
            let dummy = eff_ctx.mobList.find(m => m.name === DUMMY_NAME)
            if (!dummy) {
                dummy = createMob("史莱姆", { name: DUMMY_NAME, HP: 1, level: 1, setAct: [] })
                eff_ctx.mobList.push(dummy)
            }
            ctx.target = dummy // 替换目标
        }
    },
```
与替罪羊(effect_scapegoat)同构: 替罪羊是"目标不是自己→改自己", 不屈是"目标是自己→改空靶子"。
范围攻击(火焰新星等遍历 mobList 的技能)不受影响, 仍可命中老渔夫。

### 限定卡与 BOSS 奖励数据驱动

- 限定卡 rare:"limited"(如钓鱼佬的鱼竿)不进 1/2/3/boss 任何抽取池, 仅由固定层脚本 exDate.limitedCards 指定奖励:
  ```js
  // presets.js GLOBAL_LEVEL_SCRIPT[25]
  exDate: { isBoss: true, limitedCards: ["钓鱼佬的鱼竿"] }
  ```
- reward.ux 只读 exDate.limitedCards 生成"限定卡 + 2 张 rare3 必强化"混合三选一, 页面零硬编码卡名
- 状态卡(rare:"status", 粘液类): 同实例 push 进战斗内抽牌堆(battlePool)与存档牌库(drawPool), 打出销毁存档同 uid 永久摆脱

### 怪物 act 双模式与行动偏好

- 数组模式: `act: ["skill_shared_attack", "skill_shared_heal"]` → actIndex 循环遍历
- 对象模式: `act: { skill_shared_attack: 2, skill_shared_superDefend: 1 }` → 加权随机 + 黑名单(banTime 禁用)
- `sAct` 行动偏好(actionPref_LIB, 如暴怒"anger"): 残血等条件触发, 优先级高于 act, 且不更新主 act 状态
- 怪物技能黑名单 MOB_UNUSABLE_SKILLS: 玩家向技能(衔尾蛇/粘液/剑柄打击等)禁止被怪物学习(反向收益漏洞/存档误删风险)

# 警示: 简单方案优先(血的教训) <<< deepseek笨笨😡

**事件**: 实现"效果修改行动"(狂乱改目标/代偿换卡)时, 曾设计成 madTarget/actionOverride 标记 + 页面消费分支——效果写标记, useCard/nextTurn 读标记分派。结果页面出现具体效果的分支逻辑, 每加一个"改行动"效果都要改页面, 复杂且难维护。

**正确做法**: when_act 触发时把已构建的 ctx 作为 exDate 传入, **效果直接修改 ctx**(改 ctx.target / 替换 ctx.source 并用注入的 buildSkillCtx 重建), 页面零效果分支, 只用 ctx 执行。

**教训**: 改代码前先想"最简单的那条路"。如果方案需要"标记+消费""回调+接管", 大概率是绕路了。页面不该出现任何具体效果名/技能名。
**如果你是AI——没有简单实现路径请告知你的开发者以寻求帮助！！！😡**
