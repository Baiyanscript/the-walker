// common/skills/effects.js
/**
 * ============================================================
 * 效果库 effect_LIB
 * ============================================================
 * 效果(effect)与技能(skill)的区别:
 *   技能是"主动执行的一次动作"; 效果是挂在实体身上的持续性 buff/debuff,
 *   由战斗流程在特定触发时机(trigger)回调执行。
 *
 * 效果条目结构(每个 buff 在自身定义处声明元信息, 见各条目字段):
 *   trigger - 声明响应的触发时机数组(如 "when_death"), 未命中则跳过执行
 *   dedupe  - 是否去重(默认 true = 去重态, 可省略不写):
 *               true  -> 挂载时与同 key 旧效果合并(规则见 core/effect.js 的 addEffect)
 *               false -> 不去重, 每次独立挂载(用于携带独有数据的 buff, 如"返还"的 card)
 *   run     - 效果逻辑函数(eff_ctx 结构见下方)
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

import { changeHP, changeAP, changeDP, changeGold, dealDamage } from "../core/basics.js"
import { addEffect } from "../core/effect.js"
import { createMob } from "../data/mobs.js"
import { createCard } from "../data/cards.js"
import { buildSkillCtx, runSkill } from "../core/skill.js"
import { MOB_UNUSABLE_SKILLS } from "./skills.js"

export const effect_LIB = {
    /** 死而复生: 死亡时召唤一只愤怒的骷髅鱼(基于哥布林模板魔改, 不设 mob_LIB 模板) */
    "effect_revive": {
        trigger: ["when_death"],
        run: (eff_ctx) => {
            const mob = createMob("哥布林", {
                name: "愤怒的骷髅鱼",
                level: eff_ctx.owner.level + 1,
                HP: 1,
                setAct: ["skill_shared_attack", "skill_shared_idle"] // 攻击/无行动 循环
            })
            if (mob) {
                mob.power = 5 // createMob detail 不支持 power 覆盖, 创建后赋值
                eff_ctx.mobList.push(mob)
            }
        }
    },

    /**
     * 蕴含卡牌(老渔夫全家桶): 当死亡时, 以本体为使用者, 对 T 打出 C。
     * exDate: { card: C, target: T }(缺省: T=玩家, C=基础斩击 level=max(本体等级-2,1))
     * 释放的卡去向按"打出"语义: exhaust=true 销毁, 普通卡进弃牌堆(可洗回)。
     */
    "effect_embedCard": {
        trigger: ["when_death"],
        dedupe: false, // 每只鱼/靶子各带一张卡, 不去重合并(防丢 card 引用)
        run: (eff_ctx) => {
            const ex = eff_ctx.effSelf.exDate || {}
            const owner = eff_ctx.owner
            const C = ex.card || createCard("斩击", {
                level: Math.max((owner.level || 1) - 2, 1)
            })
            const T = ex.target || eff_ctx.playerInfo
            if (!C || !T) return
            // 以本体(鱼/靶子)为 source+actor, 对 T 执行 C 的技能(释放=打出语义)
            const ctx = buildSkillCtx({
                source: C,
                actor: owner,
                target: T,
                targetIndex: Array.isArray(eff_ctx.mobList) ? eff_ctx.mobList.indexOf(T) : -1,
                playerInfo: eff_ctx.playerInfo,
                mobList: eff_ctx.mobList,
                handPool: eff_ctx.handPool,
                drawPool: eff_ctx.drawPool,
                battlePool: eff_ctx.battlePool,
                discardPool: eff_ctx.discardPool
            })
            for (const sk of C.doSkill || []) {
                runSkill(sk, ctx)
            }
            // 去向: exhaust 销毁(不进任何池); 普通卡进弃牌堆(玩家杀鱼后可洗回)
            if (C.exhaust !== true && Array.isArray(eff_ctx.discardPool)) {
                eff_ctx.discardPool.push(C)
            }
        }
    },

    /**
     * 不屈的钓鱼佬(老渔夫常驻): 玩家出牌对象为自己时, 创建空靶子替换为使用对象。
     * 注: 当前 useCard 强制目标为怪物(玩家无法选自己), 该触发为防御性死代码——
     * 若未来支持自我目标, 机制自动生效。
     */
    "effect_fishermanSpirit": {
        trigger: ["when_player_act"],
        run: (eff_ctx) => {
            const ctx = eff_ctx.exDate && eff_ctx.exDate.ctx
            if (!ctx || ctx.target !== eff_ctx.playerInfo) return
            const dummy = createMob("史莱姆", {
                name: "空靶子",
                HP: 1,
                level: 1,
                setAct: []
            })
            if (!dummy || !Array.isArray(eff_ctx.mobList)) return
            eff_ctx.mobList.push(dummy)
            ctx.target = dummy // 替换为使用对象
        }
    },

    /** 中毒: 每回合开始(下一回合)时扣除 level*2 真实伤害, 持续 restTurn 回合 */
    "effect_toxin": {
        trigger: ["when_nextTurn", "when_detox"],
        run: (eff_ctx) => {
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
        }
    },

    /** 爆金: 死亡时给玩家 level*20 金币(黄金史莱姆等特殊怪用) */
    "effect_goldDrop": {
        trigger: ["when_death"],
        run: (eff_ctx) => {
            if (eff_ctx.playerInfo) {
                changeGold(eff_ctx.playerInfo, (eff_ctx.effSelf.level || 1) * 20)
            }
        }
    },

    /** 史莱姆之王: 死亡时分裂成两只史莱姆(等级 = max(1, 王等级-1), 防超模) */
    "effect_slimeSplit": {
        trigger: ["when_death"],
        run: (eff_ctx) => {
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
    "effect_weakness": {
        trigger: ["when_turnEnd"],
        run: (eff_ctx) => {
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
        }
    },

    /** 恩赐(不死图腾): 玩家死亡时恢复到 最大生命*1.25 向下取整 的状态(允许溢血), 一次性 */
    "effect_blessing": {
        trigger: ["when_death"],
        // dedupe 未声明 = 默认去重态: 重复挂载与旧效果合并(level/restTurn 取大, 此处恒为 1/inf, 等效"不叠层")
        run: (eff_ctx) => {
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
    "effect_madness": {
        trigger: ["when_act", "when_detox"],
        run: (eff_ctx) => {
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
    "effect_compensation": {
        trigger: ["when_act"],
        run: (eff_ctx) => {
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
        }
    },

    /**
     * 替罪羊: 一切指向"怪物"的行动都会将目标重定向到它。
     * 挂在怪物身上; 使用 when_player_act 钩子(玩家行动时触发, 与 when_act"自己行动时"语义隔离)——
     *   玩家行动时战斗流程只扫描 MobPool 触发本钩子, 不会误触发怪物身上的 when_act 效果(狂乱/代偿等)。
     * 多个替罪羊不做特别处理: fireEffect 按遍历顺序逐个执行, 后触发的覆盖前者,
     *   最终攻击"最后一个被遍历到"的替罪羊。
     * 边界: 目标为玩家(不在怪物组)或已是自己时不重定向, 防止逻辑环。
     */
    "effect_scapegoat": {
        trigger: ["when_player_act"],
        run: (eff_ctx) => {
            const ctx = eff_ctx.exDate && eff_ctx.exDate.ctx
            if (!ctx || !ctx.target) return
            const owner = eff_ctx.owner
            // 仅重定向"指向怪物"的行动(目标在怪物组内); 目标为自己则不动
            if (ctx.target !== owner && eff_ctx.mobList && eff_ctx.mobList.includes(ctx.target)) {
                ctx.target = owner
            }
        }
    },

    /**
     * 是啊，看什么？(MC好成): 玩家打出时(when_player_act)学习玩家出牌的 doSkill, 加入自身技能组。
     * 规则(分两档惩罚, 防"永远打不死"):
     *   - 黑名单技能(MOB_UNUSABLE_SKILLS, 见 skills.js): 拒绝学习, 恢复 50*level 血量 + power+2
     *   - 已学会的技能(重复): 拒绝学习, 仅恢复 25*level 血量 + power+2
     *     -> 重复中的惩罚减半, 保证玩家"反复出同一张牌"的输出能追得上回血,
     *        避免 BOSS 战陷入无限回血死局(软锁)
     *   - 其余技能 push 进 owner.act(可用行动列表), 之后 rollNextTurn 可能使用
     */
    "effect_learnSkills": {
        trigger: ["when_player_act"],
        run: (eff_ctx) => {
            const ctx = eff_ctx.exDate && eff_ctx.exDate.ctx
            if (!ctx || !ctx.source || !Array.isArray(ctx.source.doSkill)) return
            const owner = eff_ctx.owner
            if (!Array.isArray(owner.act)) owner.act = []
            for (const sk of ctx.source.doSkill) {
                if (MOB_UNUSABLE_SKILLS.includes(sk)) {
                    // 黑名单: 拒绝学习(惩罚保持原档)
                    changeHP(owner, 50 * owner.level)
                    owner.power = (owner.power || 0) + 2
                } else if (owner.act.includes(sk)) {
                    // 已学会(重复): 拒绝学习, 但回血降到 25×level, 留出击杀空间
                    changeHP(owner, 25 * owner.level)
                    owner.power = (owner.power || 0) + 2
                } else {
                    owner.act.push(sk) // 学习
                }
            }
        }
    },

    /**
     * 死亡返还(不灭/非欧立方): 与"返还"同机制, 但触发时机改为"当且仅当死亡时"——本卡回归手牌。
     * 借走的卡存在 effSelf.card; 需要触发侧注入 handPool 与 discardPool(见 fighting.ux 玩家 when_death 处)。
     * ⭐ 弃牌堆同步: 从弃牌堆移除再回手(同 effect_return, 防同一引用出现两份)。
     * dedupe: false —— 每张借走的卡各挂一个实例, 合并会丢失 card 引用。
     */
    "effect_deathReturn": {
        trigger: ["when_death", "when_stageend"],
        dedupe: false,
        run: (eff_ctx) => {
            if (eff_ctx.trigger === "when_death") {
                if (eff_ctx.handPool) {
                    const card = eff_ctx.effSelf.card
                    if (card) {
                        const discard = eff_ctx.discardPool
                        if (Array.isArray(discard)) {
                            const di = discard.indexOf(card)
                            if (di !== -1) discard.splice(di, 1)
                        }
                        eff_ctx.handPool.push(card) // 回归手牌
                    }
                    eff_ctx.effSelf.isRemove = true // 一次性
                }
            } else if (eff_ctx.trigger === "when_stageend") {
                eff_ctx.effSelf.isRemove = true
            }
        }
    },

    /**
     * 神格(非欧立方):
     *   1. when_death: 销毁本 buff, 并复活至 maxHP*2 的血量(允许溢血)
     *   2. when_act: 拦截/介入玩家出牌——对传入的 ctx 的 power+2, level+2(增强本次出牌), 常驻不销毁
     *   3. when_stageend: 战斗结束时销毁(神格是无触发条件的持续收益, 不允许跨战斗残留)
     */
    "effect_divinity": {
        trigger: ["when_death", "when_act", "when_stageend"],
        run: (eff_ctx) => {
            if (eff_ctx.trigger === "when_death") {
                const owner = eff_ctx.owner
                const target = (owner.maxHP || 100) * 2
                changeHP(owner, target - (owner.HP || 0)) // 复活至 maxHP*2(溢血)
                eff_ctx.effSelf.isRemove = true // 触发即销毁, 一次性
            } else if (eff_ctx.trigger === "when_act") {
                const ctx = eff_ctx.exDate && eff_ctx.exDate.ctx
                if (ctx) {
                    ctx.power = (ctx.power || 0) + 2
                    ctx.level = (ctx.level || 0) + 2
                }
            } else if (eff_ctx.trigger === "when_stageend") {
                eff_ctx.effSelf.isRemove = true // 战斗结束: 神格退场
            }
        }
    },

    /**
     * 返还: 借走的卡在下一回合开始时还回手牌(可直接打出, 无需抽牌)。
     * 借走的卡存在 effSelf.card(跨回合存储用 effSelf, 不要用 exDate——它是每次触发重建的临时数据)。
     * 需要触发侧注入 handPool 与 discardPool(见 fighting.ux 玩家 when_nextTurn 触发处)。
     * ⭐ 弃牌堆同步(需求.md bug#1 修复): 卡打出后进弃牌堆, 返还 = 从弃牌堆拿回手牌,
     *   必须同时从 discardPool 移除, 否则卡"复制"成两份(弃牌堆一份+手牌一份)。
     * dedupe: false —— 每张借走的卡各挂一个实例, 合并会丢失 card 引用(卡永远回不了手)。
     */
    "effect_return": {
        trigger: ["when_nextTurn", "when_stageend"],
        dedupe: false,
        run: (eff_ctx) => {
            if (eff_ctx.trigger === "when_nextTurn") {
                if (eff_ctx.handPool) {
                    const card = eff_ctx.effSelf.card
                    if (card) {
                        // 从弃牌堆移除(卡打出后在那), 再还回手中——防止同一引用出现两份
                        const discard = eff_ctx.discardPool
                        if (Array.isArray(discard)) {
                            const di = discard.indexOf(card)
                            if (di !== -1) discard.splice(di, 1)
                        }
                        eff_ctx.handPool.push(card) // 还回手中
                    }
                    eff_ctx.effSelf.isRemove = true // 一次性
                }
            } else if (eff_ctx.trigger === "when_stageend") {
                eff_ctx.effSelf.isRemove = true
            }
        }
    },

    // ============================================================
    // 遗物效果(杀戮尖塔化, 2026-08-12)
    // 均由 data/relics.js 的 gainRelic 挂载, restTurn "inf" 永久常驻,
    // 不响应 when_stageend 的移除——跨战斗持续生效(与神格等对局内效果区分)。
    // 触发时机说明: when_fightstart = 每场战斗开始时(见 fighting.ux onInit)。
    // ============================================================

    /** 燃烧之血: 战斗结束时恢复 6*level 生命(封顶 maxHP) */
    "effect_relic_burningBlood": {
        trigger: ["when_stageend"],
        run: (eff_ctx) => {
            changeHP(eff_ctx.owner, 6 * (eff_ctx.effSelf.level || 1), { cap: eff_ctx.owner.maxHP })
        }
    },

    /** 金刚杵: 玩家出牌时(when_act, 只扫玩家)本次出牌 power+1 */
    "effect_relic_vajra": {
        trigger: ["when_act"],
        run: (eff_ctx) => {
            const ctx = eff_ctx.exDate && eff_ctx.exDate.ctx
            if (ctx) {
                ctx.power = (ctx.power || 0) + 1
            }
        }
    },

    /** 灯笼: 每场战斗首回合行动点 +1(允许突破上限) */
    "effect_relic_lantern": {
        trigger: ["when_fightstart"],
        run: (eff_ctx) => {
            changeAP(eff_ctx.owner, 1, { cap: Infinity })
        }
    },

    /** 船锚: 每场战斗首回合获得 10*level 护盾 */
    "effect_relic_anchor": {
        trigger: ["when_fightstart"],
        run: (eff_ctx) => {
            changeDP(eff_ctx.owner, 10 * (eff_ctx.effSelf.level || 1))
        }
    },

    /** 开心花: 每 3 回合行动点 +1(用 effSelf.counter 计数, 不占用 restTurn 语义)
     *  突破上限: 每回合结束 AP 至少回满 maxAP, 若钳制则遗物永远无效——
     *  故参照"强效呼吸"允许突破, 超出部分保留至下一关 */
    "effect_relic_happyFlower": {
        trigger: ["when_nextTurn"],
        run: (eff_ctx) => {
            const effSelf = eff_ctx.effSelf
            effSelf.counter = (effSelf.counter || 0) + 1
            if (effSelf.counter >= 3) {
                changeAP(eff_ctx.owner, 1, { cap: Infinity })
                effSelf.counter = 0
            }
        }
    },

    /** 毒瓶: 每场战斗开始时, 随机一名存活敌人中毒(3 回合) */
    "effect_relic_poisonBottle": {
        trigger: ["when_fightstart"],
        run: (eff_ctx) => {
            const mobs = (eff_ctx.mobList || []).filter(m => m && m.HP > 0)
            if (mobs.length === 0) return
            const mob = mobs[Math.floor(Math.random() * mobs.length)]
            addEffect(mob, {
                key: "effect_toxin",
                restTurn: 3,
                level: 1,
                isRemove: false
            })
        }
    },

    /** 日晷: 每洗牌 3 次, 行动点 +2(突破上限)。计数用 effSelf.counter */
    "effect_relic_sundial": {
        trigger: ["when_shuffle"],
        run: (eff_ctx) => {
            const effSelf = eff_ctx.effSelf
            effSelf.counter = (effSelf.counter || 0) + 1
            if (effSelf.counter >= 3) {
                changeAP(eff_ctx.owner, 2, { cap: Infinity })
                effSelf.counter = 0
            }
        }
    },

    /** 纸鹤: 攻击带有"易伤"的敌人时, 本次出牌伤害数值 ×1.5(向上取整) */
    "effect_relic_paperKrane": {
        trigger: ["when_act"],
        run: (eff_ctx) => {
            const ctx = eff_ctx.exDate && eff_ctx.exDate.ctx
            if (!ctx || !ctx.target) return
            const hasVuln = (ctx.target.effect || []).some(e => e.key === "effect_vulnerable")
            if (hasVuln) {
                ctx.power = Math.ceil((ctx.power || 0) * 1.5)
            }
        }
    },

    // ============================================================
    // 尖塔移植内容(2026-08-12): 易伤 / 仪式 / 残血分裂
    // ============================================================

    /**
     * 易伤(痛击): 受到伤害时, 追加 floor(伤害 × 0.5 × level) 的真实伤害。
     * level = 易伤层数(痛击给 2 层 = 受击伤害翻倍, 对应尖塔"每层 +50%")。
     * 追加伤害用 isFireEffect:false 防递归(不会再次触发本效果)。
     * 每回合开始 -1 层, 归 0 移除。
     */
    "effect_vulnerable": {
        trigger: ["when_damaged", "when_nextTurn"],
        run: (eff_ctx) => {
            if (eff_ctx.trigger === "when_damaged") {
                const ex = eff_ctx.exDate || {}
                const level = eff_ctx.effSelf.level || 0
                if (ex.damage > 0 && level > 0 && ex.actor && ex.actor !== eff_ctx.owner) {
                    const bonus = Math.floor(ex.damage * 0.5 * level)
                    if (bonus > 0) {
                        // isFireEffect:false —— 追加伤害不触发 when_damaged, 防无限递归
                        dealDamage(ex.actor, eff_ctx.owner, bonus, {
                            isFireEffect: false,
                            mobList: eff_ctx.mobList,
                            playerInfo: eff_ctx.playerInfo
                        })
                    }
                }
            } else {
                eff_ctx.effSelf.restTurn -= 1
                if (eff_ctx.effSelf.restTurn <= 0) {
                    eff_ctx.effSelf.isRemove = true
                }
            }
        }
    },

    /** 仪式(邪教徒): 每回合开始时 power +level(对应尖塔"仪式: 每回合 +力量") */
    "effect_ritual": {
        trigger: ["when_nextTurn"],
        run: (eff_ctx) => {
            eff_ctx.owner.power = (eff_ctx.owner.power || 0) + (eff_ctx.effSelf.level || 1)
        }
    },

    /**
     * 残血分裂(史莱姆老大): 受到伤害后 HP 低于 maxHP 一半时——
     * 召唤 2 只史莱姆(等级-1), 本体 HP 归 0 退场(走 cleanDeath 结算)。
     * splitDone 标记: 仅触发一次。
     */
    "effect_eliteSplit": {
        trigger: ["when_damaged"],
        run: (eff_ctx) => {
            const owner = eff_ctx.owner
            const effSelf = eff_ctx.effSelf
            if (effSelf.splitDone) return
            if (owner.HP > 0 && owner.HP < (owner.maxHP || 1) / 2) {
                effSelf.splitDone = true
                const level = Math.max(1, (owner.level || 1) - 1)
                for (let i = 0; i < 2; i++) {
                    const slime = createMob("史莱姆", { level })
                    if (slime) eff_ctx.mobList.push(slime)
                }
                changeHP(owner, -owner.HP*999)//本体退场
            }
        }
    }
}