// common/skills/effects.js
/**
 * ============================================================
 * 效果库 effect_LIB
 * ============================================================
 * 效果(effect)与技能(skill)的区别:
 *   技能是"主动执行的一次动作"; 效果是挂在实体身上的持续性 buff/debuff,
 *   由战斗流程在特定触发时机(trigger)回调执行。
 *
 * 效果上下文(eff_ctx)结构(由 core/effect.js 的 fireEffect 构造):
 *   owner     - 效果持有者(玩家或怪物)
 *   trigger   - 触发时机, 如 "when_death" / "when_nextTurn" / "when_damaged"
 *   effSelf   - 效果本体对象 {key, restTurn, level, isRemove}
 *   exDate    - 附加数据 (when_damaged 时含 {damage, actor}), 按 trigger 不同而不同
 *   mobList   - 当前怪物组
 *   playerInfo- 玩家对象
 *
 * 规则: 数值修改同样必须走 core/basics.js 的基础函数。
 */

import { changeHP, changeGold ,dealDamage} from "../core/basics.js"
import { createMob } from "../data/mobs.js"

export const effect_LIB = {
    /** 死而复生: 死亡时召唤一只暴怒骷髅 */
    "effect_revive": (eff_ctx) => {
        if (eff_ctx.trigger === "when_death") {
            const mob = createMob("哥布林", {
                name: "暴怒骷髅",
                level: eff_ctx.owner.level + 1,
                power: 7,
                HP: 5,
                setAct: ["skill_shared_attack"]
            })
            if (mob) eff_ctx.mobList.push(mob)
        }
    },

    /** 中毒: 每回合开始(下一回合)时扣除 level*2 真实伤害, 持续 restTurn 回合 */
    "effect_toxin": (eff_ctx) => {
        if (eff_ctx.trigger === "when_nextTurn") {
            // 真实伤害(毒): 不走护盾, 直接扣生命
            changeHP(eff_ctx.owner, -eff_ctx.effSelf.level * 2)
            eff_ctx.effSelf.restTurn -= 1
            if (eff_ctx.effSelf.restTurn <= 0) {
                eff_ctx.effSelf.isRemove = true
            }
        } else if (eff_ctx.trigger === "when_detox") {
            // 解毒(快速充能等主动触发): 直接清除
            eff_ctx.effSelf.isRemove = true
        }
    },

    /** 爆金: 死亡时给玩家 level*20 金币(黄金史莱姆等特殊怪用) */
    "effect_goldDrop": (eff_ctx) => {
        if (eff_ctx.trigger === "when_death" && eff_ctx.playerInfo) {
            changeGold(eff_ctx.playerInfo, (eff_ctx.effSelf.level || 1) * 20)
        }
    },

    /** 史莱姆之王: 死亡时分裂成两只史莱姆(等级 = max(1, 王等级-1), 防超模) */
    "effect_slimeSplit": (eff_ctx) => {
        if (eff_ctx.trigger === "when_death") {
            const level = Math.max(1, (eff_ctx.owner.level || 1) - 1)
            for (let i = 0; i < 2; i++) {
                const slime = createMob("史莱姆", { level })
                if (slime) eff_ctx.mobList.push(slime)
            }
        }
    },

    /**
     * 虚弱: 使玩家下一回合 AP 不重置。
     * 机制(when_turnEnd 双阶段):
     *   pre  阶段(AP 结算前)把当前 AP 记到 buff 本体 savedAP;
     *   post 阶段(AP 结算后)用 savedAP 覆盖回去, 等于"这次回满没发生"。
     * 跨阶段存值用 effSelf(buff 自己维护), 不要用 exDate(它是每次触发重建的临时数据)。
     */
    "effect_weakness": (eff_ctx) => {
        if (eff_ctx.trigger !== "when_turnEnd") return

        if (eff_ctx.exDate.phase === "pre") {
            eff_ctx.effSelf.savedAP = eff_ctx.owner.AP
        } else if (eff_ctx.exDate.phase === "post") {
            if (typeof eff_ctx.effSelf.savedAP === "number") {
                eff_ctx.owner.AP = eff_ctx.effSelf.savedAP
            }
            // 持续回合结算(一次结算只减一次)
            eff_ctx.effSelf.restTurn -= 1
            if (eff_ctx.effSelf.restTurn <= 0) {
                eff_ctx.effSelf.isRemove = true
            }
        }
    },

    /** 恩赐(不死图腾): 玩家死亡时恢复到 最大生命*1.25 向下取整 的状态(允许溢血), 一次性 */
    "effect_blessing": (eff_ctx) => {
        if (eff_ctx.trigger === "when_death") {
            const owner = eff_ctx.owner
            owner.HP = Math.floor((owner.maxHP || 100) * 1.25)
            eff_ctx.effSelf.isRemove = true // 触发即销毁, 不支持叠层/多次
        }
    },

    /**
     * 狂乱(狂乱的鸡尾酒): 行动前(when_act)发作——不改动作, 直接把 ctx.target 重定向为随机单位。
     * 随机池 = 所有存活怪物 + 玩家, 可能打到自己/同伴/玩家(无差别)。
     * ⭐ 修改方式: when_act 触发时战斗流程把 ctx 作为 exDate 传入, 效果直接改 ctx.target,
     *   页面随后按 ctx 执行——无需任何标记/消费机制。
     * 金币边界: 技能内部金币逻辑(黄金史莱姆/强盗)都走 playerInfo, 与 target 无关, 不会错乱。
     */
    "effect_madness": (eff_ctx) => {
        if (eff_ctx.trigger === "when_act") {
            const ctx = eff_ctx.exDate && eff_ctx.exDate.ctx
            if (ctx) {
                const pool = [...(eff_ctx.mobList || []), eff_ctx.playerInfo]
                    .filter(e => e && e.HP > 0)
                if (pool.length > 0) {
                    ctx.target = pool[Math.floor(Math.random() * pool.length)]
                }
            }
            // 每次发作 -1 回合, 归零自愈
            eff_ctx.effSelf.restTurn -= 1
            if (eff_ctx.effSelf.restTurn <= 0) {
                eff_ctx.effSelf.isRemove = true
            }
        } else if (eff_ctx.trigger === "when_detox") {
            // 解毒(快速充能等主动触发): 直接清除
            eff_ctx.effSelf.isRemove = true
        }
    },

    /**
     * 代偿(代偿卡): 行动前(when_act)把 ctx.source 替换为一张特制"斩击"卡, 并重建 ctx——
     * 效果内部自包含, 页面无任何效果分支。
     * 特制斩击: level=原卡level, power = max(1,原power)×max(1,原costAP)×max(1,层),
     *   最终伤害 = power×level = 原power×原level×原costAP×层。
     * ⭐ 重建: 修改 source 后必须用 exDate 注入的 buildSkillCtx 重算(level/power 是构建时快照),
     *   再 Object.assign 写回原 ctx 引用。
     * 一次性: 触发即移除, 拦截下一张牌(含再打代偿卡本身)。
     */
    "effect_compensation": (eff_ctx) => {
        if (eff_ctx.trigger !== "when_act") return
        const ex = eff_ctx.exDate || {}
        const ctx = ex.ctx
        if (!ctx || typeof ex.buildSkillCtx !== 'function') return

        const orig = ctx.source
        const lv = eff_ctx.effSelf.level || 1
        const ideal = {
            uid: "compensation",
            name: "斩击",
            level: orig.level || 1,
            power: Math.max(1, orig.power || 0) * Math.max(1, orig.costAP || 1) * Math.max(1, lv),
            costAP: orig.costAP || 1,
            doSkill: ["skill_shared_attack"],
            rare: 0
        }
        // 用新 source 重建 ctx(数值重算), 写回原引用
        const rebuilt = ex.buildSkillCtx({
            source: ideal,
            actor: ctx.actor,
            target: ctx.target,
            targetIndex: ctx.targetIndex,
            playerInfo: ctx.playerInfo,
            mobList: ctx.mobList,
            handPool: ctx.handPool,
            drawPool: ctx.drawPool
        })
        Object.assign(ctx, rebuilt)
        eff_ctx.effSelf.isRemove = true
    },

    /**
     * 返还: 借走的卡在下一回合开始时还回手牌(可直接打出, 无需抽牌)。
     * 借走的卡存在 effSelf.card(跨回合存储用 effSelf, 不要用 exDate——它是每次触发重建的临时数据)。
     * 需要触发侧注入 handPool(见 fighting.ux 玩家 when_nextTurn 触发处)。
     */
    "effect_return": (eff_ctx) => {
        if (eff_ctx.trigger === "when_nextTurn" && eff_ctx.handPool) {
            const card = eff_ctx.effSelf.card
            if (card) {
                eff_ctx.handPool.push(card) // 还回手中
            }
            eff_ctx.effSelf.isRemove = true // 一次性
        }
    }
}

// ============================================================
// 注: 旧版中的 deepseek_* 效果(召唤史莱姆/萨满buff/死亡给AP/
// 炸弹/荆棘 等)暂未迁移, 如需恢复请按上述 eff_ctx 规范补全。
// ============================================================
