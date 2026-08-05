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
import { createCard } from "../data/cards.js"
import { generateUid } from "../core/utils.js"
import { fireEffect } from "../core/effect.js"

export const skill_LIB = {
    // ---------------- 通用基础技能(卡牌与怪物共用) ----------------

    /** 攻击: 对目标造成 power * level 伤害 */
    skill_shared_attack: (ctx) => {
        const damage = Math.max(ctx.power * ctx.level, 0)
        dealDamage(ctx.source, ctx.target, damage, { mobList: ctx.mobList, playerInfo: ctx.playerInfo })
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
        dealDamage(ctx.source, ctx.target, damage, { mobList: ctx.mobList, playerInfo: ctx.playerInfo })
        // 底层的"尝试弄死自己", 走基础函数统一钳制
        changeHP(ctx.actor, -9999999)
    },

    // ---------------- 卡牌专属技能 ----------------

    /** 横扫: 对目标造成 2 倍小伤害, 相邻怪物各吃 1 倍小伤害 */
    skill_card_sweep: (ctx) => {
        const sweepDamage = Math.ceil(ctx.power * ctx.level * 0.5)
        dealDamage(ctx.source, ctx.target, sweepDamage * 2, { mobList: ctx.mobList, playerInfo: ctx.playerInfo })

        if (ctx.mobList[ctx.targetIndex + 1]) {
            dealDamage(ctx.source, ctx.mobList[ctx.targetIndex + 1], sweepDamage, { mobList: ctx.mobList, playerInfo: ctx.playerInfo })
        }
        if (ctx.mobList[ctx.targetIndex - 1]) {
            dealDamage(ctx.source, ctx.mobList[ctx.targetIndex - 1], sweepDamage, { mobList: ctx.mobList, playerInfo: ctx.playerInfo })
        }
    },

    /** 淬毒: 给目标附加中毒效果(具体结算见 effects.js 的 effect_toxin) */
    skill_card_poison: (ctx) => {
        const level = ctx.level || 1
        const poisonLevel = Math.max(1, Math.floor(level / 2))
        const duration = 3 + level

        ctx.target.effect.push({
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
        const pool = ctx.drawPool
        if (!pool || !Array.isArray(pool)) return
        const idx = pool.findIndex(c => c.uid === ctx.source.uid)
        if (idx !== -1) {
            pool.splice(idx, 1)
        }
    },

    /** 不死图腾: 为自己(actor)添加"恩赐"buff, 已有则不叠层(结算见 effect_blessing) */
    skill_card_totemBless: (ctx) => {
        const actor = ctx.actor
        if (!actor) return
        actor.effect = actor.effect || []
        const has = actor.effect.find(e => e.key === "effect_blessing")
        if (has) return // 不支持叠层
        actor.effect.push({
            key: "effect_blessing",
            restTurn: "inf", // 持续到触发, 触发后销毁
            level: 1,
            isRemove: false
        })
    },

    /** 狂乱的鸡尾酒: 给目标附加"狂乱"buff, 发作次数 = min(max(level-2,1),3) */
    skill_card_madCocktail: (ctx) => {
        if (!ctx.target) return
        ctx.target.effect = ctx.target.effect || []
        ctx.target.effect.push({
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
        actor.effect = actor.effect || []
        // 已有代偿则不叠(实际会被拦截, 到不了这里; 防御性保留)
        if (actor.effect.find(e => e.key === "effect_compensation")) return
        actor.effect.push({
            key: "effect_compensation",
            restTurn: "inf", // 直到触发(出牌被拦截时移除)
            level: ctx.level || 1, // efflevel = 代偿卡等级
            isRemove: false
        })
    },

    /** 贪婪之刃: 攻击造成全额伤害, 获得伤害 50% 的金币(防无限经济) */
    skill_card_goldenAttack: (ctx) => {
        const rawDamage = Math.max(ctx.power * ctx.level, 0)
        dealDamage(ctx.source, ctx.target, rawDamage, { mobList: ctx.mobList, playerInfo: ctx.playerInfo })
        if (ctx.playerInfo) {
            changeGold(ctx.playerInfo, Math.floor(rawDamage * 0.5))
        }
    },

    // ---------------- 怪物专属技能 ----------------

    /** 金币攻击(黄金史莱姆): 甩金币砸目标, 造成伤害并"送"给玩家等量金币 */
    skill_mob_goldAttack: (ctx) => {
        const dmg = Math.max(ctx.power * ctx.level, 0)
        dealDamage(ctx.source, ctx.target, dmg, { mobList: ctx.mobList, playerInfo: ctx.playerInfo })
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
        dealDamage(ctx.source, ctx.target, dmg, { mobList: ctx.mobList, playerInfo: ctx.playerInfo })
    },

    /** 虚弱(萨满哥布林): 给目标附加"AP 不重置"buff, 持续 1 回合(结算见 effect_weakness) */
    skill_mob_weakness: (ctx) => {
        ctx.target.effect = ctx.target.effect || []
        ctx.target.effect.push({
            key: "effect_weakness",
            restTurn: 1,
            level: 1,
            isRemove: false
        })
    },

    /** 火焰新星: 对全体存活怪物造成 power*level*1.5 伤害 */
    skill_card_fireNova: (ctx) => {
        const list = ctx.mobList || []
        if (list.length === 0) return
        const damage = Math.ceil(ctx.power * ctx.level * 1.5)
        for (const mob of list) {
            if (mob.HP > 0) {
                dealDamage(ctx.source, mob, damage, { mobList: ctx.mobList, playerInfo: ctx.playerInfo })
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
        if (ctx.actor && ctx.actor.effect) {
            ctx.actor.effect.push({
                key: "effect_return",
                restTurn: 1,
                level: 1,
                isRemove: false,
                card: ctx.source
            })
        }
    },

    /**
     * 请叫叫(哎，大狗？): 成长+变身机制
     *   - 打出: 层数+1, 名字改为"大狗"×层数
     *   - 层数1/2/3 时分别 50%/75%/100% 概率"变身"成横扫模板卡(叫+"!"×层数), 进牌库, 不创建返还
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
            // 变身: 横扫模板卡, 不创建返还(层数3必变, 封顶)
            const evolved = {
                uid: generateUid(),
                name: "叫" + "!".repeat(layer),
                level: card.level || 1,           // level 继承
                power: (card.power || 1) * layer, // power = 大狗power × 层数
                costAP: card.costAP || 2,
                doSkill: ["skill_card_sweep"],
                rare: 2
            }
            if (ctx.drawPool) {
                ctx.drawPool.push(evolved) // 进牌库
            } else if (ctx.handPool) {
                ctx.handPool.push(evolved)
            }
            return // 不创建返还
        }

        // 未变身: 存入返还, 下回合还回手牌
        actor.effect.push({
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