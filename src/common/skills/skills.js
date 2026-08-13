// common/skills/skills.js
/**
 * ============================================================
 * 技能库 skill_LIB
 * ============================================================
 * ⭐ 技能上下文(ctx)语义规范(重构核心, 参见 core/skill.js):
 *
 *   source - 数值来源: 卡牌实例 或 怪物实例。power/level 只从它读取。
 *   actor  - 执行者: 玩家 或 怪物。"对自己生效"的操作
 *            (护盾/自疗/自伤/消耗行动点)一律作用于 actor。
 *   target - 作用对象: 被攻击 / 被附加效果的目标实体。
 *
 *   以及环境字段: playerInfo / mobList / handPool / targetIndex。
 *
 * 规则:
 *   1. 技能函数只操作 ctx 中传入的对象, 不触碰任何全局/隐式状态;
 *   2. 所有 HP/AP/DP 修改必须调用 core/basics.js 的基础函数,
 *      不得出现 `xxx.HP += num` 之类的裸修改;
 *   3. 技能返回 void, 界面展示走 skills/details.js 的 detail_LIB。
 */

import {
    changeHP,
    changeAP,
    changeDP,
    changeGold,
    dealDamage
} from "../core/basics.js"
import { refillDrawPool } from "../core/draw.js"
import { createCard } from "../data/cards.js"
import { createMob, createMobByRare } from "../data/mobs.js"
import { generateUid, weightedPick } from "../core/utils.js"
import { fireEffect, addEffect } from "../core/effect.js"

// ============================================================
// 怪物不可直接使用的技能黑名单
// ============================================================
/**
 * 不能直接给怪物用的技能(供 effect_learnSkills"是啊，看什么？"复制玩家技能时过滤):
 *   - 玩家专属成长: 返还/叠层会永久强化怪物或污染自身 exDate
 *   - AP 类: 怪物没有 AP 字段, 复制无意义
 *   - 反向收益漏洞: 攻击类技能会给玩家送卡/送钱
 *   - 行动拦截/牌库销毁/一命机制: 行为异常或怪物用过度超模
 *   - AOE 敌我不分: 怪物使用会自伤或打自己人
 */
export const MOB_UNUSABLE_SKILLS = [
    "skill_card_ouroboros",    // 衔尾蛇: 永久强化自己+返还(玩家专属成长)
    "skill_card_dog",          // 大狗: 叠层污染自身 exDate+变身(玩家专属成长)
    "skill_card_mimic",        // 模仿者: 给玩家手牌塞卡(反向收益漏洞)
    "skill_card_goldenAttack", // 贪婪之刃: 攻击还送玩家金币(反向收益漏洞)
    "skill_card_energize",     // 快速充能: AP 类(怪物无 AP)
    "skill_card_deepBreath",   // 强效呼吸: AP 类(怪物无 AP)
    "skill_card_pommel",       // 剑柄打击: 怪物不需要给玩家抽卡
    "skill_card_compensation", // 代偿: 给自己挂代偿->行动被 when_act 拦截(行为异常)
    // -------- 销毁类(怪物无 uid, 学会也无法销毁且存在误删风险, 全数禁学) --------
    "skill_card_totemCurse",   // 不死图腾·诅咒: 玩家牌库销毁类
    "skill_card_slime",        // 粘液: 销毁玩家存档牌库
    "skill_card_goldSlime",    // 粘在一起的金币: 同上+金币
    //"skill_card_totemBless",   // 不死图腾·恩赐: 玩家一命机制(怪物死后复活过强) < 不行 还是留着吧😀boss为什么不能"超越生死"呢？
    "skill_card_feed",         // 小蛋糕: 目标为玩家时无效果(语义错乱)
    "skill_card_sweep",        // 横扫: AOE 敌我不分(会打自己人)
    "skill_card_fireNova",     // 火焰新星: AOE 自伤+打自己人
    "skill_card_immortal",     // 不灭: 死亡返还(玩家专属死亡机制)
    "skill_card_divinity",     // 神格: 出牌增强+死亡复活(玩家专属机制)
    "skill_card_exhaust",      // 力竭: AP归零(玩家专属代价技能)
    "skill_card_bodySlam",     // 全身撞击: 伤害=自身护盾(怪物护盾每回合清零, 学了只能打0)
]

/**
 * 销毁存档牌库中同 UID 的卡(粘液/金币粘液/不死图腾的"销毁诅咒"共用逻辑)
 * ⭐ 防御(需求.md 2026-08-13): 怪物实例没有 uid 字段——若怪物(如 MC好成)绕过黑名单
 *   学到销毁类技能, ctx.source.uid 为 undefined, 此处直接返回无操作, 防止误删/异常。
 * @param {Object} ctx - 技能上下文(需含 drawPool)
 * @param {string} uid - 要销毁的卡牌 UID(实体无 uid 时传 undefined, 直接忽略)
 */
function destroyInDrawPool(ctx, uid) {
    if (!uid) return // 怪物等无 uid 实体: 无操作(销毁诅咒对怪物无意义)
    const pool = ctx.drawPool
    if (!pool || !Array.isArray(pool)) return
    const idx = pool.findIndex(c => c.uid === uid)
    if (idx !== -1) {
        pool.splice(idx, 1)
    }
}

export const skill_LIB = {
    // ---------------- 通用基础技能(卡牌与怪物共用) ----------------

    /** 攻击: 对目标造成 power * level 伤害 */
    skill_shared_attack: (ctx) => {
        const damage = Math.max(ctx.power * ctx.level, 0)
        dealDamage(ctx.source, ctx.target, damage, { fireEffect: ctx.fireEffect, mobList: ctx.mobList, playerInfo: ctx.playerInfo })
    },

    /** 防御: 给自己(actor)增加 power * level * 1.2 护盾 */
    skill_shared_defend: (ctx) => {
        const Dpoint = Math.ceil(ctx.power * ctx.level * 1.2)
        changeDP(ctx.actor, Dpoint)
    },

    /** 治疗: 恢复自己(actor) power * level * 0.6 生命, 封顶 maxHP */
    skill_shared_heal: (ctx) => {
        const Hpoint = Math.ceil(ctx.power * ctx.level * 0.6)
        if (Hpoint <= 0) return
        changeHP(ctx.actor, Hpoint, { cap: ctx.actor.maxHP })
    },

    /** 超级防御: 给自己(actor)增加 power * level * 3 护盾 */
    skill_shared_superDefend: (ctx) => {
        const Dpoint = Math.ceil(ctx.power * ctx.level * 3)
        changeDP(ctx.actor, Dpoint)
    },

    /** 自爆: 对目标造成 5 + power*level*3 伤害, 然后杀死自己(actor) */
    skill_shared_boom: (ctx) => {
        const damage = 5 + ctx.power * ctx.level * 3
        dealDamage(ctx.source, ctx.target, damage, { fireEffect: ctx.fireEffect, mobList: ctx.mobList, playerInfo: ctx.playerInfo })
        // 底层的"尝试弄死自己", 走基础函数统一钳制
        changeHP(ctx.actor, -9999999)
    },

    /** 无行动(发呆): no-op 占位——供"攻击,无行动"类循环(愤怒的骷髅鱼等), 数组模式无法用 null 占位 */
    skill_shared_idle: () => {},

    // ---------------- 卡牌专属技能 ----------------

    /** 横扫: 对目标造成 2 倍小伤害, 相邻怪物各吃 1 倍小伤害 */
    skill_card_sweep: (ctx) => {
        const sweepDamage = Math.ceil(ctx.power * ctx.level * 0.5)
        dealDamage(ctx.source, ctx.target, sweepDamage * 2, { fireEffect: ctx.fireEffect, mobList: ctx.mobList, playerInfo: ctx.playerInfo })

        if (ctx.mobList[ctx.targetIndex + 1]) {
            dealDamage(ctx.source, ctx.mobList[ctx.targetIndex + 1], sweepDamage, { fireEffect: ctx.fireEffect, mobList: ctx.mobList, playerInfo: ctx.playerInfo })
        }
        if (ctx.mobList[ctx.targetIndex - 1]) {
            dealDamage(ctx.source, ctx.mobList[ctx.targetIndex - 1], sweepDamage, { fireEffect: ctx.fireEffect, mobList: ctx.mobList, playerInfo: ctx.playerInfo })
        }
    },

    /** 淬毒: 给目标附加中毒效果(具体结算见 effects.js 的 effect_toxin) */
    skill_card_poison: (ctx) => {
        const level = ctx.level || 1
        const poisonLevel = Math.max(1, Math.floor(level / 2))
        const duration = 3 + level

        addEffect(ctx.target, {
            key: "effect_toxin",
            restTurn: duration,
            level: poisonLevel,
            isRemove: false
        })
    },

    /** 快速充能: 恢复自己(actor)的 AP。玩家出牌时 actor=玩家, 恢复量 = power*level */
    skill_card_energize: (ctx) => {
        if (!ctx.actor || typeof ctx.actor.AP !== 'number') return
        // 只修改 AP, 尊重 maxAP 上限(数值合理性钳制交给基础函数)
        changeAP(ctx.actor, Math.max(ctx.level * ctx.power, 1))
        // 主动触发"解毒": 清除中毒/狂乱(响应见 effect_toxin/effect_madness 的 when_detox 分支)
        fireEffect({
            trigger: "when_detox",
            targets: ctx.actor,
            mobList: ctx.mobList,
            playerInfo: ctx.playerInfo
        })
    },

    /** 强效呼吸: 恢复 AP 并【突破上限】(AP 可超过 maxAP, 超出部分由战斗流程保留至下一关) */
    skill_card_deepBreath: (ctx) => {
        if (!ctx.actor || typeof ctx.actor.AP !== 'number') return
        // cap: Infinity = 不设上限, 突破 maxAP
        changeAP(ctx.actor, Math.max(ctx.level * ctx.power, 1), { cap: Infinity })
    },

    /**
     * 喂食(小蛋糕): 让指定怪物的下一回合行动为空(发呆)
     * 机制: 把 target.nextTurn 置为 null, 复用三态语义——
     *   怪物行动时 3.3 消费到 null 会跳过行动, 3.9 再重新掷, 只影响下一个行动回合
     */
    skill_card_feed: (ctx) => {
        if (!ctx.target) return
        ctx.target.nextTurn = null
    },

    /** 销毁诅咒(不死图腾): 打出后按 UID 销毁存档牌库中的本卡(一次性卡, 永久离场) */
    skill_card_totemCurse: (ctx) => {
        destroyInDrawPool(ctx, ctx.source.uid)
    },

    /** 粘液(史莱姆推送的状态卡): 打出即销毁存档同 UID(本场 exhaust 不进弃牌堆, 跨场永久摆脱) */
    skill_card_slime: (ctx) => {
        destroyInDrawPool(ctx, ctx.source.uid)
    },

    /** 粘在一起的金币(黄金史莱姆推送): 打出得 3 金币并销毁存档同 UID */
    skill_card_goldSlime: (ctx) => {
        if (ctx.actor) {
            changeGold(ctx.actor, 3)
        }
        destroyInDrawPool(ctx, ctx.source.uid)
    },

    /** 不死图腾: 为自己(actor)添加"恩赐"buff(dedupe 默认去重: 重复挂载自动合并, 等效不叠层) */
    skill_card_totemBless: (ctx) => {
        const actor = ctx.actor
        if (!actor) return
        addEffect(actor, {
            key: "effect_blessing",
            restTurn: "inf", // 持续到触发, 触发后销毁
            level: 1,
            isRemove: false
        })
    },

    /** 狂乱的鸡尾酒: 给目标附加"狂乱"buff, 发作次数 = min(max(level-2,1),3) */
    skill_card_madCocktail: (ctx) => {
        if (!ctx.target) return
        addEffect(ctx.target, {
            key: "effect_madness",
            restTurn: Math.min(Math.max((ctx.level || 1) - 2, 1), 3),
            level: 1,
            isRemove: false
        })
    },

    /** 代偿: 给自己(actor)挂"代偿"buff, 下一张出牌(含代偿)会被拦截成巨额斩击 */
    skill_card_compensation: (ctx) => {
        const actor = ctx.actor
        if (!actor) return
        // 已有代偿会被 when_act 拦截, 到不了这里; addEffect 默认去重合并作防御(见 effect_compensation)
        addEffect(actor, {
            key: "effect_compensation",
            restTurn: "inf", // 直到触发(出牌被拦截时移除)
            level: ctx.level || 1, // efflevel = 代偿卡等级
            isRemove: false
        })
    },

    /** 贪婪之刃: 攻击造成全额伤害, 获得伤害 50% 的金币(防无限经济) */
    skill_card_goldenAttack: (ctx) => {
        const rawDamage = Math.max(ctx.power * ctx.level, 0)
        dealDamage(ctx.source, ctx.target, rawDamage, { fireEffect: ctx.fireEffect, mobList: ctx.mobList, playerInfo: ctx.playerInfo })
        if (ctx.playerInfo) {
            changeGold(ctx.playerInfo, Math.floor(rawDamage * 0.5))
        }
    },

    // ---------------- 怪物专属技能 ----------------

    /** 金币攻击(黄金史莱姆): 甩金币砸目标, 造成伤害并"送"给玩家等量金币 */
    skill_mob_goldAttack: (ctx) => {
        const dmg = Math.max(ctx.power * ctx.level, 0)
        dealDamage(ctx.source, ctx.target, dmg, { fireEffect: ctx.fireEffect, mobList: ctx.mobList, playerInfo: ctx.playerInfo })
        if (ctx.playerInfo) {
            changeGold(ctx.playerInfo, dmg)
        }
    },

    /**
     * 偷钱(强盗): 偷取玩家金币; 若玩家金币不足偷取值, 狂暴成"愤怒的强盗"(伤害×3, 永久变形)
     */
    skill_mob_steal: (ctx) => {
        const STEAL = 10 // 偷取值(可调)
        const player = ctx.playerInfo
        if (!player) return

        const stolen = Math.min(STEAL, typeof player.goldNum === 'number' ? player.goldNum : 0)
        changeGold(player, -stolen)

        // 玩家金币低于偷取值 -> 狂暴变形(只触发一次)
        if ((player.goldNum || 0) < STEAL && ctx.actor.name !== '愤怒的强盗') {
            ctx.actor.power = (ctx.actor.power || 0) * 3
            ctx.actor.name = '愤怒的强盗'
        }

        // 偷完顺手攻击(用变形后的 power)
        const dmg = Math.max(ctx.source.power * ctx.level, 0)
        dealDamage(ctx.source, ctx.target, dmg, { fireEffect: ctx.fireEffect, mobList: ctx.mobList, playerInfo: ctx.playerInfo })
    },

    /**
     * 粘液攻击(史莱姆): 普通攻击 + 向玩家推送 1 张"粘液"状态卡。
     * 同一实例同时进入战斗内抽牌堆(本场即可抽到)与存档牌库(跨场污染, 直到被打出销毁)。
     */
    skill_mob_slimeAttack: (ctx) => {
        const dmg = Math.max(ctx.power * ctx.level, 0)
        dealDamage(ctx.source, ctx.target, dmg, { fireEffect: ctx.fireEffect, mobList: ctx.mobList, playerInfo: ctx.playerInfo })
        const slime = createCard("粘液", { level: 1 })
        if (!slime) return
        if (ctx.battlePool && Array.isArray(ctx.battlePool)) ctx.battlePool.push(slime)
        if (ctx.drawPool && Array.isArray(ctx.drawPool)) ctx.drawPool.push(slime)
    },

    /**
     * 金币堆攻击(黄金史莱姆): 普通攻击 + 向玩家推送 1 张"粘在一起的金币"(3费, 打出得3金币)。
     * 同上: 同实例进战斗内抽牌堆 + 存档牌库。
     */
    skill_mob_goldSlimeAttack: (ctx) => {
        const dmg = Math.max(ctx.power * ctx.level, 0)
        dealDamage(ctx.source, ctx.target, dmg, { fireEffect: ctx.fireEffect, mobList: ctx.mobList, playerInfo: ctx.playerInfo })
        const goldSlime = createCard("粘在一起的金币", { level: 1 })
        if (!goldSlime) return
        if (ctx.battlePool && Array.isArray(ctx.battlePool)) ctx.battlePool.push(goldSlime)
        if (ctx.drawPool && Array.isArray(ctx.drawPool)) ctx.drawPool.push(goldSlime)
    },

    /** 虚弱(萨满哥布林): 给目标附加"AP 不重置"buff, 持续 1 回合(结算见 effect_weakness) */
    skill_mob_weakness: (ctx) => {
        addEffect(ctx.target, {
            key: "effect_weakness",
            restTurn: 1,
            level: 1,
            isRemove: false
        })
    },

    /**
     * 钓鱼(老渔夫): 向怪物组随机添加 2/3/4 只(等概率)等级继承本体的"腐烂的鱼",
     * 每只携带"蕴含卡牌"(T=老渔夫本体, C=基础斩击 level=max(本体等级-2,1), 不进弃牌堆)。
     * 鱼死亡时以鱼为使用者对老渔夫打出斩击(需求.md 2026-08-13 新BOSS)。
     */
    skill_mob_fishCast: (ctx) => {
        const mobList = ctx.mobList
        const actor = ctx.actor
        if (!Array.isArray(mobList) || !actor) return
        const count = Math.floor(Math.random() * 3) + 2 // 2/3/4 等概率
        const fishLevel = actor.level || 1
        // 蕴含卡牌: 基础斩击副本(level=max(本体等级-2,1)), exhaust 标记=打出后销毁不进弃牌堆
        const embedCard = createCard("斩击", {
            level: Math.max(fishLevel - 2, 1)
        })
        if (!embedCard) return
        embedCard.exhaust = true // 需求: 基础斩击"不进弃牌堆"
        for (let i = 0; i < count; i++) {
            const fish = createMob("腐烂的鱼", { level: fishLevel })
            if (!fish) continue
            // 覆盖模板自带蕴含卡牌(T=玩家)的 exDate 为 T=老渔夫本体(需求.md: 技能内硬编码覆盖)
            const embed = fish.effect.find(e => e.key === "effect_embedCard")
            if (embed) {
                embed.exDate = { card: embedCard, target: actor }
            } else {
                addEffect(fish, {
                    key: "effect_embedCard",
                    restTurn: "inf",
                    level: 1,
                    isRemove: false,
                    exDate: { card: embedCard, target: actor }
                })
            }
            mobList.push(fish)
        }
    },

    /**
     * 钓牌(老渔夫): 随机将玩家手牌的 1~3 张卡牌选中, 制造"空靶子"怪物(HP1/rare1/level1)
     * 携带蕴含卡牌(T=老渔夫, C=玩家卡的副本), 原卡从手牌切除(不进弃牌堆)。
     * 需求.md 2026-08-13: ①保底1张不钓(防手牌被全钓空) ②副本深拷贝保留原 uid——
     *   鱼死亡释放="玩家打出"语义, 销毁(粘液/不死图腾按 uid 删存档)/强化(衔尾蛇)均按正常打出成立。
     */
    skill_mob_fishHand: (ctx) => {
        const hand = ctx.handPool
        const actor = ctx.actor
        const mobList = ctx.mobList
        if (!Array.isArray(hand) || !actor || !Array.isArray(mobList)) return
        if (hand.length <= 1) return // 保底 1 张不钓
        // 随机钓数 1~3, 但不超过 手牌数-1(保底1张)
        const want = Math.floor(Math.random() * 3) + 1
        const count = Math.min(want, hand.length - 1)
        // 随机挑选 count 张不重复
        const picked = []
        const pool = [...hand.keys()]
        for (let i = 0; i < count && pool.length > 0; i++) {
            const idx = Math.floor(Math.random() * pool.length)
            picked.push(hand[pool[idx]])
            pool.splice(idx, 1)
        }
        for (const card of picked) {
            if (!card) continue
            // 副本: 深拷贝(保留原 uid——释放=打出, 按 uid 的销毁/强化逻辑照常生效)
            const copy = JSON.parse(JSON.stringify(card))
            // 空靶子: 基于史莱姆模板魔改(HP1/rare1/level1/无技能发呆, 同暴怒骷髅思路, 不建模板)
            const dummy = createMob("史莱姆", {
                name: "只有大鱼才能让钓鱼佬心服口服",
                HP: 1,
                level: 1,
                setAct: []
            })
            if (!dummy) continue
            addEffect(dummy, {
                key: "effect_embedCard",
                restTurn: "inf",
                level: 1,
                isRemove: false,
                exDate: {
                    card: copy,
                    target: actor
                }
            })
            mobList.push(dummy)
            // 从手牌切除原卡(不进弃牌堆——被钓走)
            const handIdx = hand.indexOf(card)
            if (handIdx !== -1) hand.splice(handIdx, 1)
        }
    },

    /** 生气(暴怒偏好返回): 本怪物 power 永久 +2(狂暴变强, 与 MC好成 learnSkills 的 +2 同源) */
    skill_mob_anger: (ctx) => {
        if (ctx.actor) {
            ctx.actor.power = (ctx.actor.power || 0) + 2
        }
    },

    /**
     * 我不搬你们看什么？(MC好成): 向怪物池随机召唤 1 只新怪。
     * 召唤规则:
     *   - 怪物稀有度权重: rare1:1 / rare2:3 / rare3:2
     *   - 新怪初始 nextTurn = null(本回合不行动, 三态语义: 发呆)
     *   - 新怪自带"替罪羊"buff(玩家行动时会把指向怪的目标重定向到它)
     *   - 等级 = BOSS 等级 + 2(替罪羊比 BOSS 更硬, 需尽快处理, 防玩家无视它只打 BOSS)
     */
    skill_mob_summonScapegoat: (ctx) => {
        const list = ctx.mobList
        if (!Array.isArray(list)) return
        const rareWeights = [
            { rare: 1, weight: 1 },
            { rare: 2, weight: 3 },
            { rare: 3, weight: 2 }
        ]
        const picked = weightedPick(rareWeights, (item) => item.weight)
        if (!picked) return
        const mob = createMobByRare(picked.rare, {
            level: (ctx.level || 1) + 2, // 替罪羊等级 = BOSS 等级 + 2
            nextTurn: null // 本回合不行动
        })
        if (!mob) return
        addEffect(mob, {
            key: "effect_scapegoat",
            restTurn: "inf",
            level: 1,
            isRemove: false
        })
        list.push(mob)
    },

    /** 火焰新星: 对全体存活怪物造成 power*level*1.5 伤害 */
    skill_card_fireNova: (ctx) => {
        const list = ctx.mobList || []
        if (list.length === 0) return
        const damage = Math.ceil(ctx.power * ctx.level * 1.5)
        for (const mob of list) {
            if (mob.HP > 0) {
                dealDamage(ctx.source, mob, damage, { fireEffect: ctx.fireEffect, mobList: ctx.mobList, playerInfo: ctx.playerInfo })
            }
        }
    },

    /** 模仿者: 复制目标怪物的一个技能, 生成 0 费临时卡回手(数值取较大者) */
    skill_card_mimic: (ctx) => {
        if (!ctx.target || !ctx.handPool) return
        const mob = ctx.target

        // 优先使用 nextTurn, 为空则从 act 随机抽
        let copiedSkill = mob.nextTurn
        if (!copiedSkill) {
            const actPool = mob.act || []
            if (actPool.length === 0) {
                console.warn("[模仿者] 目标怪物没有任何可用技能")
                return
            }
            copiedSkill = actPool[Math.floor(Math.random() * actPool.length)]
        }
        if (typeof copiedSkill !== 'string') {
            console.warn("[模仿者] 获取到的技能无效:", copiedSkill)
            return
        }

        // 生成临时卡: 0 费, 数值取怪物与卡牌的较大者
        const mimicCard = createCard("斩击", {
            name: `模仿·${mob.name}`,
            level: Math.max(mob.level || 1, ctx.level),
            power: Math.max(mob.power || 1, ctx.power),
            costAP: 0,
            setDoSkill: [copiedSkill]
        })
        if (mimicCard) {
            ctx.handPool.push(mimicCard)
        }
    },

    /** 衔尾蛇: 打出后牌库同 uid 卡 power+1(存档增强), 本卡存入"返还"——下回合还回手牌, 可继续打出成长 */
    skill_card_ouroboros: (ctx) => {
        // 源卡 power+1(打出后存入返还, 下回合回手时已增强)
        ctx.source.power = (ctx.source.power || 0) + 1
        // 牌库同 uid 卡同步 +1(存档级增强, 非深拷贝)
        if (ctx.drawPool) {
            const inPool = ctx.drawPool.find(c => c.uid === ctx.source.uid)
            if (inPool) inPool.power += 1
        }
        // 存入返还: 下回合还回手牌(替代原"深拷贝副本回手")
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

    /** 不灭(非欧立方): 给自己(actor)挂"死亡返还"buff——死亡时本卡回归手牌(结算见 effect_deathReturn) */
    skill_card_immortal: (ctx) => {
        const actor = ctx.actor
        if (!actor) return
        addEffect(actor, {
            key: "effect_deathReturn",
            restTurn: "inf",
            level: 1,
            isRemove: false,
            card: ctx.source
        })
    },

    /** 神格(非欧立方): 给自己(actor)挂"神格"buff——出牌增强 + 死亡复活(结算见 effect_divinity) */
    skill_card_divinity: (ctx) => {
        const actor = ctx.actor
        if (!actor) return
        addEffect(actor, {
            key: "effect_divinity",
            restTurn: "inf",
            level: 1,
            isRemove: false
        })
    },

    /** 痛击(尖塔移植): 攻击 + 给目标挂 2 层易伤(受击追加伤害, 结算见 effect_vulnerable) */
    skill_card_bash: (ctx) => {
        const damage = Math.max(ctx.power * ctx.level, 0)
        dealDamage(ctx.source, ctx.target, damage, { fireEffect: ctx.fireEffect, mobList: ctx.mobList, playerInfo: ctx.playerInfo })
        addEffect(ctx.target, {
            key: "effect_vulnerable",
            restTurn: 2, // 持续 2 回合(本回合 + 下回合)
            level: 2, // 2 层易伤 = 受击伤害翻倍(尖塔: 每层 +50%)
            isRemove: false
        })
    },

    /**
     * 剑柄打击(尖塔移植): 攻击 + 抽 1 张牌。
     * 从战斗内抽牌堆(ctx.battlePool, fighting.ux 注入)抽, 空则洗弃牌堆(尖塔规则)。
     * 手牌未满才抽(尊重 maxHoldCard)。
     */
    skill_card_pommel: (ctx) => {
        const damage = Math.max(ctx.power * ctx.level, 0)
        dealDamage(ctx.source, ctx.target, damage, { fireEffect: ctx.fireEffect, mobList: ctx.mobList, playerInfo: ctx.playerInfo })
        const pool = ctx.battlePool
        const discard = ctx.discardPool
        const hand = ctx.handPool
        const player = ctx.playerInfo
        if (!pool || !hand) return
        // 手牌上限内才抽
        const maxHold = (player && player.maxHoldCard) || 10
        if (hand.length >= maxHold) return
        if (pool.length === 0) {
            // 洗牌触发(when_shuffle): 与抽卡流程(gacha)口径一致, 遗物·日晷等监听(需求.md 2026-08-13)
            if (refillDrawPool(pool, discard) && ctx.fireEffect && player) {
                ctx.fireEffect({
                    trigger: "when_shuffle",
                    targets: player,
                    mobList: ctx.mobList,
                    playerInfo: player
                })
            }
        }
        if (pool.length > 0) {
            const idx = Math.floor(Math.random() * pool.length)
            hand.push(pool.splice(idx, 1)[0])
        }
    },

    /** 全身撞击(尖塔移植): 造成"当前护盾值 × level"的伤害(DP 每回合清空, 需当回合先叠盾) */
    skill_card_bodySlam: (ctx) => {
        const shield = Math.max((ctx.actor && ctx.actor.DP) || 0, 0)
        const damage = shield * Math.max(ctx.level || 1, 1)
        dealDamage(ctx.source, ctx.target, damage, { fireEffect: ctx.fireEffect, mobList: ctx.mobList, playerInfo: ctx.playerInfo })
    },

    /** 力竭(启示录): 令自己(actor)AP 归零(注意: 后期 maxAP 提升也会被清零) 并获得虚弱 buff */
    skill_card_exhaust: (ctx) => {
        const actor = ctx.actor
        if (!actor) return
        if (typeof actor.AP === 'number') {
            changeAP(actor, -actor.AP) // AP 归零(floor 0 钳制)
        }
        addEffect(actor, {
            key: "effect_weakness",
            restTurn: 1,
            level: 1,
            isRemove: false
        })
    },

    /**
     * 钓鱼佬的鱼竿(老渔夫限定卡): 判定替代伤害——按目标 rare 概率吊起, 失败造成 15 点伤害。
     * 概率: rare 1/2/3/BOSS -> 100%/75%/50%/0%(BOSS 钓不动, 老渔夫因此免疫鱼竿);
     * 其余 rare 防御性为 0。
     * 吊起成功: 目标怪物立即离场(封印) → 封装成"扔出"卡(销毁诅咒, exhaust, costAP 按 rare 1/2/3->2/4/6 其余1)
     * 扔出卡同时进存档牌库(drawPool)与渲染层卡组(battlePool), 可融合/出售。
     */
    skill_card_fishingRod: (ctx) => {
        const target = ctx.target
        if (!target) return
        // 概率表: 仅数字 rare 1/2/3 有概率, BOSS 与其他(防御性)为 0
        const chanceMap = { 1: 100, 2: 75, 3: 50 }
        const chance = (typeof target.rare === 'number' && chanceMap[target.rare] !== undefined) ? chanceMap[target.rare] : 0
        if (Math.random() * 100 >= chance) {
            // 分支2: 脱钩了, 造成 15 点伤害
            dealDamage(ctx.source, target, 15, { fireEffect: ctx.fireEffect, mobList: ctx.mobList, playerInfo: ctx.playerInfo })
            return
        }
        // 分支1: 吊起——怪物立即离场(封印), 封装成"扔出"卡
        const mobList = ctx.mobList
        if (Array.isArray(mobList)) {
            const idx = mobList.indexOf(target)
            if (idx !== -1) mobList.splice(idx, 1)
        }
        const costMap = { 1: 2, 2: 4, 3: 6 }
        const thrown = {
            uid: generateUid(),
            name: `扔出·${target.name}`,
            level: 1,
            power: 0,
            costAP: costMap[target.rare] !== undefined ? costMap[target.rare] : 1, // 其余情况为1(防御性编程)
            doSkill: ["skill_card_thrownMob"],
            rare: 0, // 无稀有度(融合/回收同融合卡处理)
            exDate: { mobData: JSON.parse(JSON.stringify(target)) }, // 怪物数据快照(封印时状态)
            exhaust: true, // 不回手: 打出即销毁
            tplKey: undefined,
            upgraded: false
        }
        // 进入 1.存档卡组 2.渲染层卡组(同粘液双池推送, 可跨场保留/融合/出售)
        if (ctx.drawPool && Array.isArray(ctx.drawPool)) ctx.drawPool.push(thrown)
        if (ctx.battlePool && Array.isArray(ctx.battlePool)) ctx.battlePool.push(thrown)
    },

    /**
     * 扔出(鱼竿吊起产物): 对攻击目标造成(数据内怪物当前血量/3)伤害,
     * 对数据内怪物造成 20 点伤害, 存活则释放回怪物组(回归战场);
     * 销毁诅咒: 打出即从存档牌库销毁同 uid(不回手, 一次性)。
     */
    skill_card_thrownMob: (ctx) => {
        const mobData = ctx.source.exDate && ctx.source.exDate.mobData
        if (!mobData) return
        // 1. 对攻击目标造成 (怪物当前血量/3) 伤害
        const dmg = Math.floor((mobData.HP || 0) / 3)
        if (dmg > 0 && ctx.target) {
            dealDamage(ctx.source, ctx.target, dmg, { fireEffect: ctx.fireEffect, mobList: ctx.mobList, playerInfo: ctx.playerInfo })
        }
        // 2. 对数据内的怪物造成 20 点伤害
        mobData.HP = Math.max(0, (mobData.HP || 0) - 20)
        // 3. 存活则释放回怪物组(重置行动, 重新掷)
        if (mobData.HP > 0 && Array.isArray(ctx.mobList)) {
            mobData.nextTurn = undefined
            ctx.mobList.push(mobData)
        }
        // 销毁诅咒: 从存档牌库销毁同 uid(不回手, 一次性卡)
        destroyInDrawPool(ctx, ctx.source.uid)
    },

    /**
     * 请叫叫(哎，大狗？): 成长+变身机制
     *   - 打出: 层数+1, 名字改为"大狗"×层数
     *   - 层数1/2/3 时分别 50%/75%/100% 概率"变身"成横扫模板卡(叫+"!"×层数),
     *     只进手牌(本局临时强化, 不进存档牌库), 不创建返还
     *   - 未变身: 本卡存入"返还", 下回合还回手牌(可继续打出成长)
     */
    skill_card_dog: (ctx) => {
        const actor = ctx.actor
        if (!actor) return
        const card = ctx.source
        card.exDate = card.exDate || {}
        const layer = (card.exDate.layer || 0) + 1
        card.exDate.layer = layer
        card.name = "大狗".repeat(layer) // 名字 = "大狗"×层数

        // 变身判定: 层数1/2/3 -> 50%/75%/100%
        const rates = { 1: 0.5, 2: 0.75, 3: 1 }
        if (rates[layer] !== undefined && Math.random() < rates[layer]) {
            // 变身: 横扫模板卡, 只进手牌(本局临时强化, 不进存档牌库; 下一关需重新叠层), 不创建返还
            const evolved = {
                uid: generateUid(),
                name: "叫" + "!".repeat(layer),
                level: card.level || 1,           // level 继承
                power: (card.power || 1) * layer, // power = 大狗power × 层数
                costAP: card.costAP || 2,
                doSkill: ["skill_card_sweep"],
                rare: 2
            }
            if (ctx.handPool) {
                ctx.handPool.push(evolved) // 进手牌: 仅本局战斗临时可用, 战斗结束即消失
            }
            return // 不创建返还
        }

        // 未变身: 存入返还, 下回合还回手牌
        addEffect(actor, {
            key: "effect_return",
            restTurn: 1,
            level: 1,
            isRemove: false,
            card: card // 借走的卡(含成长后的层数/名字)
        })
    },

    /**
     * 请叫叫(怪物版·哎？大狗): 层数越高越可能"爆发"
     *   分支判定: 层数 1,2,3,4 -> 25%,50%,75%,100% 进入爆发分支(层数0必走成长分支)
     *   成长分支: 层数+1 + 获得 power*2 护盾
     *   爆发分支: power = power*层数, 层数清零, 下一次行动改为通用伤害(设置 nextTurn 不会被 3.9 覆盖), 获得 level 护盾
     */
    skill_mob_dog: (ctx) => {
        const mob = ctx.actor
        if (!mob) return
        mob.exDate = mob.exDate || {}
        const layer = mob.exDate.layer || 0

        const rates = { 1: 0.25, 2: 0.5, 3: 0.75, 4: 1 }
        const rate = rates[layer]
        if (rate !== undefined && Math.random() < rate) {
            // 爆发分支
            mob.power = (mob.power || 1) * Math.max(layer, 1)
            mob.exDate.layer = 0
            mob.nextTurn = "skill_shared_attack" // 下一次行动改为通用伤害(3.9 只重掷 undefined)
            changeDP(mob, mob.level || 1)
        } else {
            // 成长分支
            mob.exDate.layer = layer + 1
            changeDP(mob, (mob.power || 1) * 2)
        }
    }
}