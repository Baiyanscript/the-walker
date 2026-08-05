# 远行之徒

为小米 VELA 便携设备(尤指小米手环 10)打造的**肉鸽卡牌游戏框架**——含完整可跑的战斗循环: 地图探索、卡组构建、随机战斗、奖励区域(获得卡牌/商店/回收/融合/篝火)、成长型卡牌与怪物。

## 特性

- 🃏 **卡牌战斗**: 行动点制出牌, 攻击/防御/治疗/控制/成长卡齐全(斩击/横扫/淬毒/小蛋糕/衔尾蛇/代偿/哎大狗...)
- 👾 **敌人体系**: 分裂的史莱姆之王 / 300 盾超级龟龟 / 下毒虚弱的萨满 / 让你狂乱打错目标的王牌
- 🗺️ **肉鸽循环**: 关卡地图随机生成 → 战斗或奖励 → 成长 → 下一关, 难度曲线随层数爬升
- 💰 **经济闭环**: 回收卡牌赚金币 → 商店消费 → 融合赌卡, 统一经济公式
- ⚙️ **清晰架构**: 三角色技能上下文(source/actor/target) + 效果触发系统 + 数值修改唯一入口

## 运行

```bash
npm install        # 安装构建工具链
npm test           # 运行逻辑测试(74+ 断言)
npm run build      # 构建 RPK 包
npm start          # 开发模式
```

真机/模拟器运行需要 AIoT-IDE(小米快应用开发工具), 目标设备为 VELA 手表(如小米手环 10)。

## 开发者文档

从零添加新内容(卡牌/效果/区域)请见 **[creatorReadMe.md](./creatorReadMe.md)**, 均为已跑通实现。

## 协议

[GPL-3.0](./LICENSE) — 自由使用、学习、修改与再分发

---

# 远行之徒(重构版) — 开发者文档

项目总述: 为小米 VELA 便携设备(尤指小米手环 10)打造的肉鸽卡牌框架。
本部分为**重构版**的架构总结; 下方 "# 给开发者的README" 起为旧版结构文档(历史对照)。

---

## 目录结构

```
src/
├── app.ux                 # 全局: playerInfo / playCardPool
├── manifest.json          # 路由: index/map/fighting/reward/shop
├── common/
│   ├── lib.js             # ★ 汇聚出口(页面 import 路径不变)
│   ├── storage.js         # 存档读写(0~10 存档位)
│   ├── game.js            # loadAllPlayerInfos / saveForAuto
│   ├── core/
│   │   ├── basics.js      # 数值修改唯一入口: changeHP/AP/DP/Gold, dealDamage, fixDamage
│   │   ├── skill.js       # buildSkillCtx(三角色 ctx) / runSkill
│   │   ├── effect.js      # doEffect / fireEffect / effectClear
│   │   ├── economy.js     # 回收价 / 商店价 统一公式
│   │   └── utils.js       # delay / generateUid
│   ├── data/
│   │   ├── cards.js       # card_LIB + 稀有度索引 + createCard*
│   │   ├── mobs.js        # mob_LIB + 稀有度索引 + createMob*
│   │   └── presets.js     # 预设: 战士(均衡) / 赌徒(开局 150 金币, 低血量)
│   └── skills/
│       ├── skills.js      # skill_LIB(技能实现, 三角色语义)
│       ├── effects.js     # effect_LIB(持续效果)
│       └── details.js     # detail_LIB + getSkillDetail/getCardDetail/getMobDetail
└── pages/
    ├── index.ux           # 主菜单 + 多存档(自动+1~10 位: 覆盖/删除/加载)
    ├── map.ux             # 地图: 关卡生成 + 难度曲线 + 区域分流
    ├── fighting.ux        # 战斗: 出牌/怪物行动/死亡结算/通用金币掉落
    ├── reward.ux          # 奖励区: 获得卡牌/篝火/升级卡牌/回收区/融合区
    └── shop.ux            # 商店: 卡牌 + 奖励类型商品(金币消费端)
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

规则: 数值修改必须走 `basics.js`, 禁止裸改 `xxx.HP += n`。

## 效果触发时机(trigger)

| trigger | 时机 | exDate |
|---|---|---|
| `when_nextTurn` | 过回合时, 先于行动结算 | `{}` |
| `when_damaged` | 实际扣到生命后 | `{damage, attacker}` |
| `when_death` | 死亡移除前 | `{}` |

怪物 `nextTurn` 三态: 有值=指定行动 / `undefined`=随机掷 / `null`=发呆(沉默用)。

## 工厂函数

- `createCard(nameKey, detail)` / `createCardByRare(rare, detail)` — 实例含 `rare`(回收/商店计价)
- `createMob(keyName, detail)` / `createMobByRare(rare, detail)` — `nextTurn` 自动掷骰
- 详细参数见各文件 JSDoc。

## 持久化

- `playerInfo_0~10` / `playCardPool_0~10` — 0 为自动存档位, 1~10 手动位
- `saveForAuto(player, cardPool)` 存自动位; 突破上限的 AP 会原样保存, 跨关卡保留

## 区域机制(地图节点)

- 节点 = `{mobSet?, rlevel, rpushKey}`: 有 `mobSet` 先打战斗, 胜利后按 `rpushKey` 分流到 reward 页或独立页(商店)
- `rpushKey` 由 `map.ux` 权重池随机: 获得卡牌/篝火/升级卡牌/回收卡牌/融合卡牌/商店
- `rlevel` = 奖励等级(纯奖励=关卡-1 / 普通=关卡 / 困难=关卡+2), 决定商店价/回收价/融合参数

## 经济闭环

- 回收价 = 关卡 × 卡牌level × rare(丢失取 2); 商店价 = 回收价 × 1.5
- 金币来源: 通用掉落(rare×level×2) + 贪婪之刃(伤害50%) + 黄金史莱姆(攻击送钱/死亡爆金)
- 金币消耗: 商店(卡牌 + 奖励强化 rlevel×3)

## 难度曲线

| 阶段 | 纯奖励率 | 困难率 | 稀有度上限 |
|---|---|---|---|
| 前期(≤10关) | 1/3 | 1/6 | 1→2→3 逐步解锁 |
| 中期(11~30关) | 1/4 | 1/4 | 3 |
| 后期(>30关) | 1/6 | 1/3 | 3(等级膨胀, 两极分化) |

## 教程

从零添加新内容请见 **[creatorReadMe.md](./creatorReadMe.md)**: 卡牌(衔尾蛇) / 复杂效果(自爆诅咒) / 新区域(融合区), 均为已跑通实现。