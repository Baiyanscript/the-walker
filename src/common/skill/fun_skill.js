// common/fun_skill.js
/**
 * ============================================================
 * 技能库 skill_LIB
 * ============================================================
 * ⭐ 技能上下文(skillCtx)语义规范(重构核心, 参见 core_skill.js):
 *
 *   source - 数值来源: 卡牌实例 或 怪物实例。power/level 只从它读取。
 *   actor  - 执行者: 玩家 或 怪物。"对自己生效"的操作
 *            (护盾/自疗/自伤/消耗行动点)一律作用于 actor。
 *   target - 作用对象: 被攻击 / 被附加效果的目标实体。
 *
 *   以及环境字段: playerInfo / mobList / handPool / targetIndex。
 *
 * 规则:
 *   1. 技能函数只操作 skillCtx 中传入的对象, 不触碰任何全局/隐式状态;
 *   2. 所有 HP/AP/DP 修改必须调用 core_basics.js 的基础函数,
 *      不得出现 `xxx.HP += num` 之类的裸修改;
 *   3. 技能返回 void, 界面展示走 fun_details.js 的 detail_LIB。
 */

import {
    changeHP,
    changeAP,
    changeDP,
    changeGold,
    dealDamage
} from "../core/core_basics.js"
import { refillDrawPool } from "../core/core_draw.js"
import { createCard } from "../data/cards.js"
import { createMob, createMobByRare } from "../data/mobs.js"
import { generateUid, weightedPick } from "../core/core_utils.js"
import { fireEffect, addEffect } from "../core/core_effect.js"

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
 *   学到销毁类技能, skillCtx.source.uid 为 undefined, 此处直接返回无操作, 防止误删/异常。
 * @param {Object} skillCtx - 技能上下文(需含 drawPool)
 * @param {string} uid - 要销毁的卡牌 UID(实体无 uid 时传 undefined, 直接忽略)
 */
function destroyInDrawPool(skillCtx, uid) {
    if (!uid) return // 怪物等无 uid 实体: 无操作(销毁诅咒对怪物无意义)
    const pool = skillCtx.drawPool
    if (!pool || !Array.isArray(pool)) return
    const idx = pool.findIndex(c => c.uid === uid)
    if (idx !== -1) {
        pool.splice(idx, 1)
    }
}

export const skill_LIB = {
    // ---------------- 通用基础技能(卡牌与怪物共用) ----------------

    /** 攻击: 对目标造成 power * level 伤害 */
    skill_shared_attack: (skillCtx) => {
        const damage = Math.max(skillCtx.power * skillCtx.level, 0)
        dealDamage(skillCtx.source, skillCtx.target, damage, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
    },

    /** 防御: 给自己(actor)增加 power * level * 1.2 护盾 */
    skill_shared_defend: (skillCtx) => {
        const Dpoint = Math.ceil(skillCtx.power * skillCtx.level * 1.2)
        changeDP(skillCtx.actor, Dpoint, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
    },

    /** 治疗: 恢复自己(actor) power * level * 0.6 生命, 封顶 maxHP */
    skill_shared_heal: (skillCtx) => {
        const Hpoint = Math.ceil(skillCtx.power * skillCtx.level * 0.6)
        if (Hpoint <= 0) return
        changeHP(skillCtx.actor, Hpoint, { cap: skillCtx.actor.maxHP })
    },

    /** 超级防御: 给自己(actor)增加 power * level * 3 护盾 */
    skill_shared_superDefend: (skillCtx) => {
        const Dpoint = Math.ceil(skillCtx.power * skillCtx.level * 3)
        changeDP(skillCtx.actor, Dpoint, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
    },

    /** 自爆: 对目标造成 5 + power*level*3 伤害, 然后杀死自己(actor) */
    skill_shared_boom: (skillCtx) => {
        const damage = 5 + skillCtx.power * skillCtx.level * 3
        dealDamage(skillCtx.source, skillCtx.target, damage, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
        // 底层的"尝试弄死自己", 走基础函数统一钳制
        changeHP(skillCtx.actor, -9999999)
    },

    /** 无行动(发呆): no-op 占位——供"攻击,无行动"类循环(愤怒的骷髅鱼等), 数组模式无法用 null 占位 */
    skill_shared_idle: () => {},

    // ---------------- 卡牌专属技能 ----------------

    /** 横扫: 对目标造成 2 倍小伤害, 相邻怪物各吃 1 倍小伤害 */
    skill_card_sweep: (skillCtx) => {
        const sweepDamage = Math.ceil(skillCtx.power * skillCtx.level * 0.5)
        dealDamage(skillCtx.source, skillCtx.target, sweepDamage * 4, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })

        if (skillCtx.mobList[skillCtx.targetIndex + 1]) {
            dealDamage(skillCtx.source, skillCtx.mobList[skillCtx.targetIndex + 1], sweepDamage, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
        }
        if (skillCtx.mobList[skillCtx.targetIndex - 1]) {
            dealDamage(skillCtx.source, skillCtx.mobList[skillCtx.targetIndex - 1], sweepDamage, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
        }
    },

    /** 淬毒: 给目标附加中毒效果(具体结算见 effects.js 的 effect_toxin) */
    skill_card_poison: (skillCtx) => {
        const level = skillCtx.level || 1
        const poisonLevel = Math.max(1, Math.floor(level / 2))
        const duration = 3 + level

        addEffect(skillCtx.target, {
            key: "effect_toxin",
            restTurn: duration,
            level: poisonLevel,
            isRemove: false
        })
    },

    /** 快速充能: 恢复自己(actor)的 AP。玩家出牌时 actor=玩家, 恢复量 = power*level */
    skill_card_energize: (skillCtx) => {
        if (!skillCtx.actor || typeof skillCtx.actor.AP !== 'number') return
        // 只修改 AP, 尊重 maxAP 上限(数值合理性钳制交给基础函数)
        changeAP(skillCtx.actor, Math.max(skillCtx.level * skillCtx.power, 1))
        // 主动触发"解毒": 清除中毒/狂乱(响应见 effect_toxin/effect_madness 的 when_detox 分支)
        fireEffect({
            trigger: "when_detox",
            targets: skillCtx.actor,
            mobList: skillCtx.mobList,
            playerInfo: skillCtx.playerInfo
        })
    },

    /** 强效呼吸: 恢复 AP 并【突破上限】(AP 可超过 maxAP, 超出部分由战斗流程保留至下一关) */
    skill_card_deepBreath: (skillCtx) => {
        if (!skillCtx.actor || typeof skillCtx.actor.AP !== 'number') return
        // cap: Infinity = 不设上限, 突破 maxAP
        changeAP(skillCtx.actor, Math.max(skillCtx.level * skillCtx.power, 1), { cap: Infinity })
    },

    /**
     * 喂食(小蛋糕): 让指定怪物的下一回合行动为空(发呆)
     * 机制: 把 target.nextSkill 置为 null, 复用三态语义——
     *   怪物行动时 3.3 消费到 null 会跳过行动, 3.9 再重新掷, 只影响下一个行动回合
     */
    skill_card_feed: (skillCtx) => {
        if (!skillCtx.target) return
        skillCtx.target.nextSkill = null
    },

    /** 销毁诅咒(不死图腾): 打出后按 UID 销毁存档牌库中的本卡(一次性卡, 永久离场) */
    skill_card_totemCurse: (skillCtx) => {
        destroyInDrawPool(skillCtx, skillCtx.source.uid)
    },

    /** 粘液(史莱姆推送的状态卡): 打出即销毁存档同 UID(本场 exhaust 不进弃牌堆, 跨场永久摆脱) */
    skill_card_slime: (skillCtx) => {
        destroyInDrawPool(skillCtx, skillCtx.source.uid)
    },

    /** 粘在一起的金币(黄金史莱姆推送): 打出得 3 金币并销毁存档同 UID */
    skill_card_goldSlime: (skillCtx) => {
        if (skillCtx.actor) {
            changeGold(skillCtx.actor, 3)
        }
        destroyInDrawPool(skillCtx, skillCtx.source.uid)
    },

    /** 不死图腾: 为自己(actor)添加"恩赐"buff(dedupe 默认去重: 重复挂载自动合并, 等效不叠层) */
    skill_card_totemBless: (skillCtx) => {
        const actor = skillCtx.actor
        if (!actor) return
        addEffect(actor, {
            key: "effect_blessing",
            restTurn: "inf", // 持续到触发, 触发后销毁
            level: 1,
            isRemove: false
        })
    },

    /** 狂乱的鸡尾酒: 给目标附加"狂乱"buff, 发作次数 = min(max(level-2,1),3) */
    skill_card_madCocktail: (skillCtx) => {
        if (!skillCtx.target) return
        addEffect(skillCtx.target, {
            key: "effect_madness",
            restTurn: Math.min(Math.max((skillCtx.level || 1) - 2, 1), 3),
            level: 1,
            isRemove: false
        })
    },

    /** 代偿: 给自己(actor)挂"代偿"buff, 下一张出牌(含代偿)会被拦截成巨额斩击 */
    skill_card_compensation: (skillCtx) => {
        const actor = skillCtx.actor
        if (!actor) return
        // 已有代偿会被 when_act 拦截, 到不了这里; addEffect 默认去重合并作防御(见 effect_compensation)
        addEffect(actor, {
            key: "effect_compensation",
            restTurn: "inf", // 直到触发(出牌被拦截时移除)
            level: skillCtx.level || 1, // efflevel = 代偿卡等级
            isRemove: false
        })
    },

    /** 贪婪之刃: 攻击造成全额伤害, 获得伤害 50% 的金币(防无限经济) */
    skill_card_goldenAttack: (skillCtx) => {
        const rawDamage = Math.max(skillCtx.power * skillCtx.level, 0)
        dealDamage(skillCtx.source, skillCtx.target, rawDamage, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
        if (skillCtx.playerInfo) {
            changeGold(skillCtx.playerInfo, Math.floor(rawDamage * 0.5))
        }
    },

    // ---------------- 怪物专属技能 ----------------

    /** 金币攻击(黄金史莱姆): 甩金币砸目标, 造成伤害并"送"给玩家等量金币 */
    skill_mob_goldAttack: (skillCtx) => {
        const dmg = Math.max(skillCtx.power * skillCtx.level, 0)
        dealDamage(skillCtx.source, skillCtx.target, dmg, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
        if (skillCtx.playerInfo) {
            changeGold(skillCtx.playerInfo, dmg)
        }
    },

    /**
     * 偷钱(强盗): 偷取玩家金币; 若玩家金币不足偷取值, 狂暴成"愤怒的强盗"(伤害×3, 永久变形)
     */
    skill_mob_steal: (skillCtx) => {
        const STEAL = 10 // 偷取值(可调)
        const player = skillCtx.playerInfo
        if (!player) return

        const stolen = Math.min(STEAL, typeof player.goldNum === 'number' ? player.goldNum : 0)
        changeGold(player, -stolen)

        // 玩家金币低于偷取值 -> 狂暴变形(只触发一次)
        if ((player.goldNum || 0) < STEAL && skillCtx.actor.name !== '愤怒的强盗') {
            skillCtx.actor.power = (skillCtx.actor.power || 0) * 3
            skillCtx.actor.name = '愤怒的强盗'
        }

        // 偷完顺手攻击(用变形后的 power)
        const dmg = Math.max(skillCtx.source.power * skillCtx.level, 0)
        dealDamage(skillCtx.source, skillCtx.target, dmg, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
    },

    /**
     * 粘液攻击(史莱姆): 普通攻击 + 向玩家推送 1 张"粘液"状态卡。
     * 同一实例同时进入战斗内抽牌堆(本场即可抽到)与存档牌库(跨场污染, 直到被打出销毁)。
     */
    skill_mob_slimeAttack: (skillCtx) => {
        const dmg = Math.max(skillCtx.power * skillCtx.level, 0)
        dealDamage(skillCtx.source, skillCtx.target, dmg, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
        const slime = createCard("粘液", { level: 1 })
        if (!slime) return
        if (skillCtx.battlePool && Array.isArray(skillCtx.battlePool)) skillCtx.battlePool.push(slime)
        if (skillCtx.drawPool && Array.isArray(skillCtx.drawPool)) skillCtx.drawPool.push(slime)
    },

    /**
     * 金币堆攻击(黄金史莱姆): 普通攻击 + 向玩家推送 1 张"粘在一起的金币"(3费, 打出得3金币)。
     * 同上: 同实例进战斗内抽牌堆 + 存档牌库。
     */
    skill_mob_goldSlimeAttack: (skillCtx) => {
        const dmg = Math.max(skillCtx.power * skillCtx.level, 0)
        dealDamage(skillCtx.source, skillCtx.target, dmg, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
        const goldSlime = createCard("粘在一起的金币", { level: 1 })
        if (!goldSlime) return
        if (skillCtx.battlePool && Array.isArray(skillCtx.battlePool)) skillCtx.battlePool.push(goldSlime)
        if (skillCtx.drawPool && Array.isArray(skillCtx.drawPool)) skillCtx.drawPool.push(goldSlime)
    },

    /** 虚弱(萨满哥布林): 给目标附加"AP 不重置"buff, 持续 1 回合(结算见 effect_weakness) */
    skill_mob_weakness: (skillCtx) => {
        addEffect(skillCtx.target, {
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
    skill_mob_fishCast: (skillCtx) => {
        const mobList = skillCtx.mobList
        const actor = skillCtx.actor
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
    skill_mob_fishHand: (skillCtx) => {
        const hand = skillCtx.handPool
        const actor = skillCtx.actor
        const mobList = skillCtx.mobList
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
    skill_mob_anger: (skillCtx) => {
        if (skillCtx.actor) {
            skillCtx.actor.power = (skillCtx.actor.power || 0) + 2
        }
    },

    /** 蛮牛冲撞(地精大块头): 高伤普攻, 伤害 = power×level×1.5 */
    skill_mob_charge: (skillCtx) => {
        const dmg = Math.ceil(skillCtx.power * skillCtx.level * 1.5)
        dealDamage(skillCtx.source, skillCtx.target, dmg, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
    },

    /** 双击(铜制机械人偶): 两段伤害, 每段 power×level×0.75 */
    skill_mob_doubleHit: (skillCtx) => {
        const per = Math.ceil(skillCtx.power * skillCtx.level * 0.75)
        dealDamage(skillCtx.source, skillCtx.target, per, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
        dealDamage(skillCtx.source, skillCtx.target, per, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
    },

    /** 强化(铜制机械人偶): power+2 且获得 level×10 护盾(越打越疼, 复刻原版力量累积) */
    skill_mob_boost: (skillCtx) => {
        if (skillCtx.actor) {
            skillCtx.actor.power = (skillCtx.actor.power || 0) + 2
            changeDP(skillCtx.actor, (skillCtx.level || 1) * 10, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
        }
    },

    /** 超能光束(铜制机械人偶): 单发大伤害 power×level×2.5 */
    skill_mob_hyperBeam: (skillCtx) => {
        const dmg = Math.ceil(skillCtx.power * skillCtx.level * 2.5)
        dealDamage(skillCtx.source, skillCtx.target, dmg, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
    },

    /** 保护光束(铜球): 给主人(铜制机械人偶)加 level×10 护盾——没有主人则加给自己 */
    skill_mob_protectBeam: (skillCtx) => {
        const mobList = skillCtx.mobList || []
        const boss = mobList.find(m => m && m.name === "铜制机械人偶" && m.HP > 0) || skillCtx.actor
        changeDP(boss, (skillCtx.level || 1) * 10, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
    },

    /** 召唤铜球(铜制机械人偶开场): 召唤 2 只铜球, level = 本体+2, 本回合不行动(发呆) */
    skill_mob_summonOrb: (skillCtx) => {
        const mobList = skillCtx.mobList
        if (!Array.isArray(mobList)) return
        for (let i = 0; i < 2; i++) {
            const orb = createMob("铜球", {
                level: (skillCtx.level || 1) + 2,
                nextSkill: null // 本回合不行动
            })
            if (orb) mobList.push(orb)
        }
    },

    /**
     * 我不搬你们看什么？(MC好成): 向怪物池随机召唤 1 只新怪。
     * 召唤规则:
     *   - 怪物稀有度权重: rare1:1 / rare2:3 / rare3:2
     *   - 新怪初始 nextSkill = null(本回合不行动, 三态语义: 发呆)
     *   - 新怪自带"替罪羊"buff(玩家行动时会把指向怪的目标重定向到它)
     *   - 等级 = BOSS 等级 + 2(替罪羊比 BOSS 更硬, 需尽快处理, 防玩家无视它只打 BOSS)
     */
    skill_mob_summonScapegoat: (skillCtx) => {
        const list = skillCtx.mobList
        if (!Array.isArray(list)) return
        const rareWeights = [
            { rare: 1, weight: 1 },
            { rare: 2, weight: 3 },
            { rare: 3, weight: 2 }
        ]
        const picked = weightedPick(rareWeights, (item) => item.weight)
        if (!picked) return
        const mob = createMobByRare(picked.rare, {
            level: (skillCtx.level || 1) + 2, // 替罪羊等级 = BOSS 等级 + 2
            nextSkill: null // 本回合不行动
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
    skill_card_fireNova: (skillCtx) => {
        const list = skillCtx.mobList || []
        if (list.length === 0) return
        const damage = Math.ceil(skillCtx.power * skillCtx.level * 1.5)
        for (const mob of list) {
            if (mob.HP > 0) {
                dealDamage(skillCtx.source, mob, damage, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
            }
        }
    },

    /** 模仿者: 复制目标怪物的一个技能, 生成 0 费临时卡回手(数值取较大者) */
    skill_card_mimic: (skillCtx) => {
        if (!skillCtx.target || !skillCtx.handPool) return
        const mob = skillCtx.target

        // 优先使用 nextTurn, 为空则从 act 随机抽
        let copiedSkill = mob.nextSkill
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
            level: Math.max(mob.level || 1, skillCtx.level),
            power: Math.max(mob.power || 1, skillCtx.power),
            costAP: 0,
            setDoSkill: [copiedSkill]
        })
        if (mimicCard) {
            skillCtx.handPool.push(mimicCard)
        }
    },

    /** 衔尾蛇: 打出后牌库同 uid 卡 power+1(存档增强), 本卡存入"返还"——下回合还回手牌, 可继续打出成长 */
    skill_card_ouroboros: (skillCtx) => {
        // 源卡 power+1(打出后存入返还, 下回合回手时已增强)
        skillCtx.source.power = (skillCtx.source.power || 0) + 1
        // 牌库同 uid 卡同步 +1(存档级增强, 非深拷贝)
        if (skillCtx.drawPool) {
            const inPool = skillCtx.drawPool.find(c => c.uid === skillCtx.source.uid)
            if (inPool) inPool.power += 1
        }
        // 存入返还: 下回合还回手牌(替代原"深拷贝副本回手")
        if (skillCtx.actor) {
            addEffect(skillCtx.actor, {
                key: "effect_return",
                restTurn: 1,
                level: 1,
                isRemove: false,
                card: skillCtx.source
            })
        }
    },

    /**
     * 倒转之启(七咒专属, 需求.md 2026-08-16): 输出 power = 向下取整(自身 effect 长度(含遗物)/3),
     * 至少 3 的斩击——buff 越厚(战斗buff+永久遗物效果)伤害越高
     */
    skill_card_invertedBegin: (skillCtx) => {
        const len = ((skillCtx.actor && skillCtx.actor.effect) || []).length
        const power = Math.max(3, Math.floor(len / 3))
        const damage = power * Math.max(skillCtx.level || 1, 1)
        dealDamage(skillCtx.source, skillCtx.target, damage, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
    },

    // ============================================================
    // 需求.md 2026-08-16 B/C 组(斩·夺/北斗长弓/空城计/dio的飞刀/释放召唤)
    // ============================================================

    /**
     * 斩·夺(需求.md): 攻击(10×level) + 给目标挂"斩夺标记"——
     *   有高频村雨: 层数+1(叠层); 无高频村雨: 层数重置为 1(不叠层)
     *   叠层后若层数 > 6(村雨 rare3×2)立即对怪物造成玩家生命上限点真实伤害(斩杀, 死亡结算走系统 trigger)
     */
    skill_card_zhaduo: (skillCtx) => {
        // 1. 攻击
        const damage = Math.max((skillCtx.power || 0) * skillCtx.level, 0)
        dealDamage(skillCtx.source, skillCtx.target, damage, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })

        // 2. 挂/叠标记
        const target = skillCtx.target
        if (!target || (target.HP || 0) <= 0) return
        const hasCunyu = ((skillCtx.playerInfo && skillCtx.playerInfo.effect) || [])
            .some(e => e.key === "effect_relic_gaopinCunyu")
        target.effect = target.effect || []
        let mark = target.effect.find(e => e.key === "effect_zhaduoMark")
        if (!mark) {
            mark = { key: "effect_zhaduoMark", restTurn: "inf", level: 0, isRemove: false }
            target.effect.push(mark)
        }
        mark.level = hasCunyu ? (mark.level || 0) + 1 : 1 // 有村雨叠层, 无村雨重置

        // 3. 斩杀判定: 层数 > 6 且持有村雨 -> 立即受玩家生命上限真实伤害(死亡 trigger 照常结算)
        if (hasCunyu && (mark.level || 0) > 6) {
            const maxHP = (skillCtx.playerInfo && skillCtx.playerInfo.maxHP) || 100
            changeHP(target, -maxHP)
        }
    },

    /** 北斗长弓(需求.md): 攻击(低伤) + 给目标挂 3 层 3 回合"北斗易伤"(死亡传播, 见 effect_beidouVuln) */
    skill_card_beidouBow: (skillCtx) => {
        const damage = Math.max((skillCtx.power || 0) * skillCtx.level, 0)
        dealDamage(skillCtx.source, skillCtx.target, damage, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })

        const target = skillCtx.target
        if (!target || (target.HP || 0) <= 0) return
        target.effect = target.effect || []
        const exist = target.effect.find(e => e.key === "effect_beidouVuln")
        if (exist) {
            exist.level = 3 // 重新挂 = 重置 3 层
            exist.restTurn = 3
        } else {
            target.effect.push({ key: "effect_beidouVuln", restTurn: 3, level: 3, isRemove: false })
        }
    },

    /** 空城计(需求.md): 遍历整个怪物卡组, 全部变成无行动(本回合发呆, nextTurn=null 三态语义) */
    skill_card_emptyFort: (skillCtx) => {
        for (const mob of skillCtx.mobList || []) {
            if (mob && (mob.HP || 0) > 0) mob.nextTurn = null
        }
    },

    /** dio的飞刀(需求.md): 获得 6 张 0 费"飞刀"直接进手牌(渲染层, 球卡同款) */
    skill_card_dioKnives: (skillCtx) => {
        const hand = skillCtx.handPool
        if (!Array.isArray(hand)) return
        for (let i = 0; i < 6; i++) {
            const knife = createCard("飞刀", { level: 1 })
            if (knife) hand.push(knife)
        }
    },

    /** 美国小伙(需求.md): 释放怪物——向场上召唤 1 只美国小伙(HP20, 枪毙 index-1, 3回合后离开) */
    skill_card_america: (skillCtx) => {
        const mob = createMob("美国小伙", { level: skillCtx.actor.level || 1 })
        if (mob) skillCtx.mobList.push(mob)
    },

    /** 中东小伙(需求.md): 释放怪物——向场上召唤 1 只中东小伙(HP10, 苦力怕自爆 index±1) */
    skill_card_mideast: (skillCtx) => {
        const mob = createMob("中东小伙", { level: skillCtx.actor.level || 1 })
        if (mob) skillCtx.mobList.push(mob)
    },

    /** 枪毙(美国小伙): 对自身 index-1 位单位造成 20 点真实伤害(越界打玩家) */
    skill_mob_americanShoot: (skillCtx) => {
        const mobList = skillCtx.mobList || []
        const idx = mobList.indexOf(skillCtx.actor)
        const target = (idx - 1) < 0 ? skillCtx.playerInfo : mobList[idx - 1]
        if (!target || (target.HP || 0) <= 0) return
        changeHP(target, -20)
    },

    /** 苦力怕自爆(中东小伙): 对自身 index±1 位各造成 10 点真实伤害(越界打玩家), 随后自爆退场 */
    skill_mob_mideastBoom: (skillCtx) => {
        const mobList = skillCtx.mobList || []
        const idx = mobList.indexOf(skillCtx.actor)
        for (const delta of [-1, 1]) {
            const i = idx + delta
            const t = (i < 0 || i >= mobList.length) ? skillCtx.playerInfo : mobList[i]
            if (t && (t.HP || 0) > 0) changeHP(t, -10)
        }
        changeHP(skillCtx.actor, -9999) // 自爆退场(走 cleanDeath 结算)
    },

    /** 不灭(非欧立方): 给自己(actor)挂"死亡返还"buff——死亡时本卡回归手牌(结算见 effect_deathReturn) */
    skill_card_immortal: (skillCtx) => {
        const actor = skillCtx.actor
        if (!actor) return
        addEffect(actor, {
            key: "effect_deathReturn",
            restTurn: "inf",
            level: 1,
            isRemove: false,
            card: skillCtx.source
        })
    },

    /** 神格(非欧立方): 给自己(actor)挂"神格"buff——出牌增强 + 死亡复活(结算见 effect_divinity) */
    skill_card_divinity: (skillCtx) => {
        const actor = skillCtx.actor
        if (!actor) return
        addEffect(actor, {
            key: "effect_divinity",
            restTurn: "inf",
            level: 1,
            isRemove: false
        })
    },

    /** 痛击(尖塔移植): 攻击 + 给目标挂 2 层易伤(受击追加伤害, 结算见 effect_vulnerable) */
    skill_card_bash: (skillCtx) => {
        const damage = Math.max(skillCtx.power * skillCtx.level, 0)
        dealDamage(skillCtx.source, skillCtx.target, damage, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
        addEffect(skillCtx.target, {
            key: "effect_vulnerable",
            restTurn: 2, // 持续 2 回合(本回合 + 下回合)
            level: 2, // 2 层易伤 = 受击伤害翻倍(尖塔: 每层 +50%)
            isRemove: false
        })
    },

    /**
     * 剑柄打击(尖塔移植): 攻击 + 抽 1 张牌。
     * 从战斗内抽牌堆(skillCtx.battlePool, fighting.ux 注入)抽, 空则洗弃牌堆(尖塔规则)。
     * 手牌未满才抽(尊重 maxHoldCard)。
     */
    skill_card_pommel: (skillCtx) => {
        const damage = Math.max(skillCtx.power * skillCtx.level, 0)
        dealDamage(skillCtx.source, skillCtx.target, damage, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
        const pool = skillCtx.battlePool
        const discard = skillCtx.discardPool
        const hand = skillCtx.handPool
        const player = skillCtx.playerInfo
        if (!pool || !hand) return
        // 手牌上限内才抽
        const maxHold = (player && player.maxHoldCard) || 10
        if (hand.length >= maxHold) return
        if (pool.length === 0) {
            // 洗牌触发(when_shuffle): 与抽卡流程(gacha)口径一致, 遗物·日晷等监听(需求.md 2026-08-13)
            if (refillDrawPool(pool, discard) && skillCtx.fireEffect && player) {
                skillCtx.fireEffect({
                    trigger: "when_shuffle",
                    targets: player,
                    mobList: skillCtx.mobList,
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
    skill_card_bodySlam: (skillCtx) => {
        const shield = Math.max((skillCtx.actor && skillCtx.actor.DP) || 0, 0)
        const damage = shield * Math.max(skillCtx.level || 1, 1)
        dealDamage(skillCtx.source, skillCtx.target, damage, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
    },

    /** 力竭(启示录): 令自己(actor)AP 归零(注意: 后期 maxAP 提升也会被清零) 并获得虚弱 buff */
    skill_card_exhaust: (skillCtx) => {
        const actor = skillCtx.actor
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
    skill_card_fishingRod: (skillCtx) => {
        const target = skillCtx.target
        if (!target) return
        // 概率表: 仅数字 rare 1/2/3 有概率, BOSS 与其他(防御性)为 0
        const chanceMap = { 1: 100, 2: 75, 3: 50 }
        const chance = (typeof target.rare === 'number' && chanceMap[target.rare] !== undefined) ? chanceMap[target.rare] : 0
        if (Math.random() * 100 >= chance) {
            // 分支2: 脱钩了, 造成 15 点伤害
            dealDamage(skillCtx.source, target, 15, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
            return
        }
        // 分支1: 吊起——怪物立即离场(封印), 封装成"扔出"卡
        const mobList = skillCtx.mobList
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
            rare: target.rare || 1, // 怪物的价格是多少就是多少了
            exDate: { mobData: JSON.parse(JSON.stringify(target)) }, // 怪物数据快照(封印时状态)
            exhaust: true, // 不回手: 打出即销毁
            tplKey: undefined,
            upgraded: false
        }
        // 进入 1.存档卡组 2.渲染层卡组(同粘液双池推送, 可跨场保留/融合/出售)
        if (skillCtx.drawPool && Array.isArray(skillCtx.drawPool)) skillCtx.drawPool.push(thrown)
        if (skillCtx.battlePool && Array.isArray(skillCtx.battlePool)) skillCtx.battlePool.push(thrown)
    },

    /**
     * 扔出(鱼竿吊起产物): 对攻击目标造成(数据内怪物当前血量/3)伤害,
     * 对数据内怪物造成 20 点伤害, 存活则释放回怪物组(回归战场);
     * 销毁诅咒: 打出即从存档牌库销毁同 uid(不回手, 一次性)。
     */
    skill_card_thrownMob: (skillCtx) => {
        const mobData = skillCtx.source.exDate && skillCtx.source.exDate.mobData
        if (!mobData) return
        // 1. 对攻击目标造成 (怪物当前血量/3) 伤害
        const dmg = Math.floor((mobData.HP || 0) / 3)
        if (dmg > 0 && skillCtx.target) {
            dealDamage(skillCtx.source, skillCtx.target, dmg, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
        }
        // 2. 对数据内的怪物造成 20 点伤害
        mobData.HP = Math.max(0, (mobData.HP || 0) - 20)
        // 3. 存活则释放回怪物组(重置行动, 重新掷)
        if (mobData.HP > 0 && Array.isArray(skillCtx.mobList)) {
            mobData.nextSkill = undefined
            skillCtx.mobList.push(mobData)
        }
        // 销毁诅咒: 从存档牌库销毁同 uid(不回手, 一次性卡)
        destroyInDrawPool(skillCtx, skillCtx.source.uid)
    },

    /**
     * 请叫叫(哎，大狗？): 成长+变身机制
     *   - 打出: 层数+1, 名字改为"大狗"×层数
     *   - 层数1/2/3 时分别 50%/75%/100% 概率"变身"成横扫模板卡(叫+"!"×层数),
     *     只进手牌(本局临时强化, 不进存档牌库), 不创建返还
     *   - 未变身: 本卡存入"返还", 下回合还回手牌(可继续打出成长)
     */
    skill_card_dog: (skillCtx) => {
        const actor = skillCtx.actor
        if (!actor) return
        const card = skillCtx.source
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
            if (skillCtx.handPool) {
                skillCtx.handPool.push(evolved) // 进手牌: 仅本局战斗临时可用, 战斗结束即消失
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
     * 请叫叫(怪物版·哎？大狗): 层数越高越可能"爆发"(2026-08-15 生态位去重: 出手速度削弱——曲线整体后移)
     *   分支判定: 层数 3,4,5,6 -> 25%,50%,75%,100% 进入爆发分支(层数 0~2 必走成长分支)
     *   成长分支: 层数+1 + 获得 power*2 护盾
     *   爆发分支: power = power*层数, 层数清零, 下一次行动改为通用伤害(设置 nextTurn 不会被 3.9 覆盖), 获得 level 护盾
     */
    skill_mob_dog: (skillCtx) => {
        const mob = skillCtx.actor
        if (!mob) return
        mob.exDate = mob.exDate || {}
        const layer = mob.exDate.layer || 0

        const rates = { 3: 0.25, 4: 0.5, 5: 0.75, 6: 1 }
        const rate = rates[layer]
        if (rate !== undefined && Math.random() < rate) {
            // 爆发分支
            mob.power = (mob.power || 1) * Math.max(layer, 1)
            mob.exDate.layer = 0
            mob.nextSkill = "skill_shared_attack" // 下一次行动改为通用伤害(3.9 只重掷 undefined)
            changeDP(mob, mob.level || 1, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
        } else {
            // 成长分支
            mob.exDate.layer = layer + 1
            changeDP(mob, (mob.power || 1) * 2, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
        }
    },

    /** 战吼(尖塔移植): 抽 1 张牌(level 每 +1 多抽 1 张), 手牌上限内 */
    skill_card_warcry: (skillCtx) => {
        const pool = skillCtx.battlePool
        const hand = skillCtx.handPool
        const player = skillCtx.playerInfo
        if (!pool || !hand) return
        const maxHold = (player && player.maxHoldCard) || 10
        const drawCount = Math.max(skillCtx.level || 1, 1)
        for (let i = 0; i < drawCount; i++) {
            if (hand.length >= maxHold) break
            if (pool.length === 0) {
                // 洗牌触发(when_shuffle): 与抽卡流程口径一致
                if (refillDrawPool(pool, skillCtx.discardPool) && skillCtx.fireEffect && player) {
                    skillCtx.fireEffect({
                        trigger: "when_shuffle",
                        targets: player,
                        mobList: skillCtx.mobList,
                        playerInfo: player
                    })
                }
            }
            if (pool.length === 0) break // 双堆全空: 抽牌无效
            const idx = Math.floor(Math.random() * pool.length)
            hand.push(pool.splice(idx, 1)[0])
        }
    },

    /** 燃烧(尖塔移植): 本场战斗获得 level 点力量(直接改玩家 power, 跨战斗不保留) */
    skill_card_inflame: (skillCtx) => {
        const actor = skillCtx.actor
        if (!actor) return
        actor.power = (actor.power || 0) + (skillCtx.level || 1)
    },

    /** 重刃(尖塔移植): 造成 power 基础伤害 + 本场力量×倍率(倍率 = level, 强化后 2->3) */
    skill_card_heavyBlade: (skillCtx) => {
        const base = Math.max(skillCtx.power, 0)
        // 力量来源: 执行者(玩家出牌时 actor=玩家, 与"燃烧"同一对象)
        const str = (skillCtx.actor && skillCtx.actor.power) || 0
        const multiplier = Math.max(skillCtx.level || 1, 1)
        const total = base + str * multiplier
        dealDamage(skillCtx.source, skillCtx.target, total, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
    },

    // ============================================================
    // 失落引擎——球体系(2026-08-13, 需求.md)
    // 球 = 0费消耗卡(rare:"orb"); 出牌按 costAP 产球(0/1/2个)直接进手牌(渲染层, 马上可打出);
    // 三消: 打出球时统计全部球卡(手牌+抽牌堆+弃牌堆, 不限同种), 总数>2则连携所有球打出,
    //       不满足则本球也无效果(攒球策略)。
    // ============================================================

    /**
     * 统计玩家当前手牌(渲染层 handPool)中的球卡。
     * 三消连携范围 = 手牌中的球(抽牌堆/弃牌堆里的球不算"在手", 不参与连携)。
     * 球卡判定: rare === "orb"
     */
    collectOrbs: (skillCtx) => {
        const pool = skillCtx.handPool
        const orbs = []
        if (Array.isArray(pool)) {
            for (const card of pool) {
                if (card && card.rare === "orb") orbs.push(card)
            }
        }
        return orbs
    },

    /**
     * 三消连携(失落引擎核心): 打出球卡时调用。
     * 手牌中球总数 > 2 → 所有球按各自类型逐个生效(闪电=伤害/冰霜=护盾)并销毁;
     * 不满足 → 无效果(攒球策略)。
     * 注意: 各球效果直接在此分发, 不再递归 runSkill(防死循环)。
     * 销毁范围: 手牌中除"打出的那张"(由 useCard 正常移除)外的所有球;
     * 抽牌堆/弃牌堆中的球不受影响(留在池内, 抽到手里才算数)。
     * @param {Object} skillCtx - 打出球的技能上下文
     */
    orbFusion: (skillCtx) => {
        const orbs = skill_LIB.collectOrbs(skillCtx)
        if (orbs.length <= 2) return // 三消条件不满足: 无效果
        for (const orb of orbs) {
            // 按球自身 doSkill 分发效果(闪电=伤害, 冰霜=护盾), 直接执行
            for (const sk of orb.doSkill || []) {
                if (sk === "skill_orb_lightning") {
                    const dmg = Math.max((orb.power || 0) * (orb.level || 1), 0)
                    dealDamage(skillCtx.actor, skillCtx.target, dmg, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
                } else if (sk === "skill_orb_frost") {
                    const shield = Math.ceil((orb.power || 0) * (orb.level || 1))
                    changeDP(skillCtx.actor, shield, { fireEffect: skillCtx.fireEffect, mobList: skillCtx.mobList, playerInfo: skillCtx.playerInfo })
                }
            }
        }
        // 销毁手牌中的球(保留打出的那张——由 useCard 按 selectedCardIndex splice)
        if (Array.isArray(skillCtx.handPool)) {
            for (let i = skillCtx.handPool.length - 1; i >= 0; i--) {
                const card = skillCtx.handPool[i]
                if (card && card.rare === "orb" && card !== skillCtx.source) {
                    skillCtx.handPool.splice(i, 1)
                }
            }
        }
    },

    /** 闪电球: 打出时触发三消连携(自身效果在连携内按类型分发) */
    skill_orb_lightning: (skillCtx) => {
        skill_LIB.orbFusion(skillCtx)
    },

    /** 冰霜球: 打出时触发三消连携 */
    skill_orb_frost: (skillCtx) => {
        skill_LIB.orbFusion(skillCtx)
    }
}