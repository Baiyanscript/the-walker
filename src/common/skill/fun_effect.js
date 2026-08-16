// common/fun_effect.js
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
 *               true  -> 挂载时与同 key 旧效果合并(规则见 core_effect.js 的 addEffect)
 *               false -> 不去重, 每次独立挂载(用于携带独有数据的 buff, 如"返还"的 card)
 *   run     - 效果逻辑函数(effectCtx 结构见下方)
 *
 * 效果上下文(effectCtx)结构(由 core_effect.js 的 fireEffect 构造):
 *   owner     - 效果持有者(玩家或怪物)
 *   trigger   - 触发时机, 如 "when_death" / "when_nextTurn" / "when_damaged"
 *   effSelf   - 效果本体对象 {key, restTurn, level, isRemove}
 *   exDate    - 附加数据 (when_damaged 时含 {damage, actor}), 按 trigger 不同而不同
 *   mobList   - 当前怪物组
 *   playerInfo- 玩家对象
 *
 * 规则: 数值修改同样必须走 core_basics.js 的基础函数。
 */

import { changeHP, changeAP, changeDP, changeGold, dealDamage } from "../core/core_basics.js"
import { addEffect } from "../core/core_effect.js"
import { createMob } from "../data/mobs.js"
import { createCard } from "../data/cards.js"
import { buildSkillCtx, runSkill } from "../core/core_skill.js"
import { MOB_UNUSABLE_SKILLS } from "./fun_skill.js"

/** 攻击类技能集合(手里剑等"攻击牌"判定用)——与 skills.js 的攻击技能实现一一对应 */
const ATTACK_SKILLS = [
    "skill_shared_attack",
    "skill_card_sweep",
    "skill_card_bash",
    "skill_card_pommel",
    "skill_card_bodySlam",
    "skill_card_goldenAttack",
    "skill_card_fireNova",
    "skill_mob_goldAttack",
    "skill_mob_slimeAttack",
    "skill_mob_goldSlimeAttack",
    "skill_card_fishingRod",
    "skill_card_thrownMob"
]

export const effect_LIB = {
    /** 死而复生: 死亡时召唤一只愤怒的骷髅鱼(基于哥布林模板魔改, 不设 mob_LIB 模板) */
    "effect_revive": {
        trigger: ["when_death"],
        run: (effectCtx) => {
            const mob = createMob("哥布林", {
                name: "愤怒的骷髅鱼",
                level: effectCtx.owner.level + 1,
                HP: 1,
                setAct: ["skill_shared_attack", "skill_shared_idle"] // 攻击/无行动 循环
            })
            if (mob) {
                mob.power = 5 // createMob detail 不支持 power 覆盖, 创建后赋值
                effectCtx.mobList.push(mob)
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
        run: (effectCtx) => {
            const ex = effectCtx.effSelf.exDate || {}
            const owner = effectCtx.owner
            const C = ex.card || createCard("斩击", {
                level: Math.max((owner.level || 1) - 2, 1)
            })
            const T = ex.target || effectCtx.playerInfo
            if (!C || !T) return
            // 以本体(鱼/靶子)为 source+actor, 对 T 执行 C 的技能(释放=打出语义)
            const skillCtx = buildSkillCtx({
                source: C,
                actor: owner,
                target: T,
                targetIndex: Array.isArray(effectCtx.mobList) ? effectCtx.mobList.indexOf(T) : -1,
                playerInfo: effectCtx.playerInfo,
                mobList: effectCtx.mobList,
                handPool: effectCtx.handPool,
                drawPool: effectCtx.drawPool,
                battlePool: effectCtx.battlePool,
                discardPool: effectCtx.discardPool
            })
            for (const sk of C.doSkill || []) {
                runSkill(sk, skillCtx)
            }
            // 去向: exhaust 销毁(不进任何池); 普通卡进弃牌堆(玩家杀鱼后可洗回)
            if (C.exhaust !== true && Array.isArray(effectCtx.discardPool)) {
                effectCtx.discardPool.push(C)
            }
        }
    },

    /**
     * 激怒(地精大块头): 玩家任意出牌时, 本怪 power+1(简化版——不检测技能类型, 出牌即怒)
     */
    "effect_gremlinNob": {
        trigger: ["when_player_act"],
        run: (effectCtx) => {
            if (effectCtx.owner && effectCtx.owner.HP > 0) {
                effectCtx.owner.power = (effectCtx.owner.power || 0) + 1
            }
        }
    },

    /**
     * 不屈的钓鱼佬(老渔夫常驻): 玩家的使用卡牌对象为"自己"(老渔夫本体)时,
     * 创建空靶子替换为使用对象——老渔夫免疫玩家直接单体攻击。
     * 与替罪羊同构(替罪羊: 目标不是自己->改自己; 不屈: 目标是自己->改空靶子)。
     * 空靶子复用: 场上已有"空靶子"则不新建(防玩家连续打老渔夫时靶子无限累积)。
     * 注意: 范围攻击(火焰新星等打全体 mobList 的技能)不受影响, 仍可命中老渔夫。
     */
    "effect_fishermanSpirit": {
        trigger: ["when_player_act"],
        run: (effectCtx) => {
            const skillCtx = effectCtx.exDate && effectCtx.exDate.skillCtx
            const owner = effectCtx.owner
            if (!skillCtx || !skillCtx.target || !owner) return
            // 仅当玩家出牌目标为老渔夫本体时触发
            if (skillCtx.target !== owner) return
            if (!Array.isArray(effectCtx.mobList)) return
            // 复用场上已有空靶子(钓牌靶子也算——打死它同样释放蕴含卡牌), 防无限累积
            let dummy = effectCtx.mobList.find(m => m.name === "只有大鱼才能让钓鱼佬心服口服")
            if (!dummy) {
                dummy = createMob("史莱姆", {
                    name: "只有大鱼才能让钓鱼佬心服口服",
                    HP: 1,
                    level: 1,
                    setAct: []
                })
                if (!dummy) return
                effectCtx.mobList.push(dummy)
            }
            skillCtx.target = dummy // 替换为使用对象
        }
    },

    /** 中毒: 每回合开始(下一回合)时扣除 level*2 真实伤害, 持续 restTurn 回合 */
    "effect_toxin": {
        trigger: ["when_nextTurn", "when_detox"],
        run: (effectCtx) => {
            if (effectCtx.trigger === "when_nextTurn") {
                // 真实伤害(毒): 不走护盾, 直接扣生命
                changeHP(effectCtx.owner, -effectCtx.effSelf.level * 2)
                effectCtx.effSelf.restTurn -= 1
                if (effectCtx.effSelf.restTurn <= 0) {
                    effectCtx.effSelf.isRemove = true
                }
            } else if (effectCtx.trigger === "when_detox") {
                // 解毒(快速充能等主动触发): 直接清除
                effectCtx.effSelf.isRemove = true
            }
        }
    },

    /** 爆金: 死亡时给玩家 level*20 金币(黄金史莱姆等特殊怪用) */
    "effect_goldDrop": {
        trigger: ["when_death"],
        run: (effectCtx) => {
            if (effectCtx.playerInfo) {
                changeGold(effectCtx.playerInfo, (effectCtx.effSelf.level || 1) * 20)
            }
        }
    },

    /** 史莱姆之王: 死亡时分裂成两只史莱姆(等级 = max(1, 王等级-1), 防超模) */
    "effect_slimeSplit": {
        trigger: ["when_death"],
        run: (effectCtx) => {
            const level = Math.max(1, (effectCtx.owner.level || 1) - 1)
            for (let i = 0; i < 2; i++) {
                const slime = createMob("史莱姆", { level })
                if (slime) effectCtx.mobList.push(slime)
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
        run: (effectCtx) => {
            if (effectCtx.exDate.phase === "pre") {
                effectCtx.effSelf.savedAP = effectCtx.owner.AP
            } else if (effectCtx.exDate.phase === "post") {
                if (typeof effectCtx.effSelf.savedAP === "number") {
                    effectCtx.owner.AP = effectCtx.effSelf.savedAP
                }
                // 持续回合结算(一次结算只减一次)
                effectCtx.effSelf.restTurn -= 1
                if (effectCtx.effSelf.restTurn <= 0) {
                    effectCtx.effSelf.isRemove = true
                }
            }
        }
    },

    /** 恩赐(不死图腾): 玩家死亡时恢复到 最大生命*1.25 向下取整 的状态(允许溢血), 一次性
     *  ⭐ 诅咒7(生死之渺, 需求.md 2026-08-16): 持有"七咒之戒"(effect_sevenCurses)时,
     *    不死图腾的效果将失效——死亡时不再复活(恩赐内部检测, 不复活也不销毁本效果,
     *    由战斗流程在确认玩家死亡后正常判负)。
     */
    "effect_blessing": {
        trigger: ["when_death"],
        // dedupe 未声明 = 默认去重态: 重复挂载与旧效果合并(level/restTurn 取大, 此处恒为 1/inf, 等效"不叠层")
        run: (effectCtx) => {
            const owner = effectCtx.owner
            // 诅咒7: 七咒之戒存在 -> 恩赐失效(不复活)
            if ((owner.effect || []).some(e => e.key === "effect_sevenCurses")) return
            owner.HP = Math.floor((owner.maxHP || 100) * 1.25)
            effectCtx.effSelf.isRemove = true // 触发即销毁, 不支持叠层/多次
        }
    },

    /**
     * 狂乱(狂乱的鸡尾酒): 行动前(when_act)发作——不改动作, 直接把 skillCtx.target 重定向为随机单位。
     * 随机池 = 所有存活怪物 + 玩家, 可能打到自己/同伴/玩家(无差别)。
     * ⭐ 修改方式: when_act 触发时战斗流程把 skillCtx 作为 exDate 传入, 效果直接改 skillCtx.target,
     *   页面随后按 skillCtx 执行——无需任何标记/消费机制。
     * 金币边界: 技能内部金币逻辑(黄金史莱姆/强盗)都走 playerInfo, 与 target 无关, 不会错乱。
     */
    "effect_madness": {
        trigger: ["when_act", "when_detox"],
        run: (effectCtx) => {
            if (effectCtx.trigger === "when_act") {
                const skillCtx = effectCtx.exDate && effectCtx.exDate.skillCtx
                if (skillCtx) {
                    const pool = [...(effectCtx.mobList || []), effectCtx.playerInfo]
                        .filter(e => e && e.HP > 0)
                    if (pool.length > 0) {
                        skillCtx.target = pool[Math.floor(Math.random() * pool.length)]
                    }
                }
                // 每次发作 -1 回合, 归零自愈
                effectCtx.effSelf.restTurn -= 1
                if (effectCtx.effSelf.restTurn <= 0) {
                    effectCtx.effSelf.isRemove = true
                }
            } else if (effectCtx.trigger === "when_detox") {
                // 解毒(快速充能等主动触发): 直接清除
                effectCtx.effSelf.isRemove = true
            }
        }
    },

    /**
     * 代偿(代偿卡): 行动前(when_act)把 skillCtx.source 替换为一张特制"斩击"卡, 并重建 skillCtx——
     * 效果内部自包含, 页面无任何效果分支。
     * 特制斩击: level=原卡level, power = max(1,原power)×max(1,原costAP)×max(1,层),
     *   最终伤害 = power×level = 原power×原level×原costAP×层。
     * ⭐ 重建: 修改 source 后必须用 exDate 注入的 buildSkillCtx 重算(level/power 是构建时快照),
     *   再 Object.assign 写回原 skillCtx 引用。
     * 一次性: 触发即移除, 拦截下一张牌(含再打代偿卡本身)。
     */
    "effect_compensation": {
        trigger: ["when_act"],
        run: (effectCtx) => {
            const ex = effectCtx.exDate || {}
            const skillCtx = ex.skillCtx
            if (!skillCtx || typeof ex.buildSkillCtx !== 'function') return

            const orig = skillCtx.source
            const lv = effectCtx.effSelf.level || 1
            const ideal = {
                uid: "compensation",
                name: "斩击",
                level: orig.level || 1,
                power: Math.max(1, orig.power || 0) * Math.max(1, orig.costAP || 1) * Math.max(1, lv),
                costAP: orig.costAP || 1,
                doSkill: ["skill_shared_attack"],
                rare: 0
            }
            // 用新 source 重建 skillCtx(数值重算), 写回原引用
            const rebuilt = ex.buildSkillCtx({
                source: ideal,
                actor: skillCtx.actor,
                target: skillCtx.target,
                targetIndex: skillCtx.targetIndex,
                playerInfo: skillCtx.playerInfo,
                mobList: skillCtx.mobList,
                handPool: skillCtx.handPool,
                drawPool: skillCtx.drawPool
            })
            Object.assign(skillCtx, rebuilt)
            effectCtx.effSelf.isRemove = true
        }
    },

    /**
     * 替罪羊: 一切指向"怪物"的行动都会将目标重定向到它。
     * 挂在怪物身上; 使用 when_player_act 钩子(玩家行动时触发, 与 when_act"自己行动时"语义隔离)——
     *   玩家行动时战斗流程只扫描 mobPool 触发本钩子, 不会误触发怪物身上的 when_act 效果(狂乱/代偿等)。
     * 多个替罪羊不做特别处理: fireEffect 按遍历顺序逐个执行, 后触发的覆盖前者,
     *   最终攻击"最后一个被遍历到"的替罪羊。
     * 边界: 目标为玩家(不在怪物组)或已是自己时不重定向, 防止逻辑环。
     */
    "effect_scapegoat": {
        trigger: ["when_player_act"],
        run: (effectCtx) => {
            const skillCtx = effectCtx.exDate && effectCtx.exDate.skillCtx
            if (!skillCtx || !skillCtx.target) return
            const owner = effectCtx.owner
            // 仅重定向"指向怪物"的行动(目标在怪物组内); 目标为自己则不动
            if (skillCtx.target !== owner && effectCtx.mobList && effectCtx.mobList.includes(skillCtx.target)) {
                skillCtx.target = owner
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
        run: (effectCtx) => {
            const skillCtx = effectCtx.exDate && effectCtx.exDate.skillCtx
            if (!skillCtx || !skillCtx.source || !Array.isArray(skillCtx.source.doSkill)) return
            const owner = effectCtx.owner
            if (!Array.isArray(owner.act)) owner.act = []
            for (const sk of skillCtx.source.doSkill) {
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
        run: (effectCtx) => {
            if (effectCtx.trigger === "when_death") {
                if (effectCtx.handPool) {
                    const card = effectCtx.effSelf.card
                    if (card) {
                        const discard = effectCtx.discardPool
                        if (Array.isArray(discard)) {
                            const di = discard.indexOf(card)
                            if (di !== -1) discard.splice(di, 1)
                        }
                        effectCtx.handPool.push(card) // 回归手牌
                    }
                    effectCtx.effSelf.isRemove = true // 一次性
                }
            } else if (effectCtx.trigger === "when_stageend") {
                effectCtx.effSelf.isRemove = true
            }
        }
    },

    /**
     * 神格(非欧立方):
     *   1. when_death: 销毁本 buff, 并复活至 maxHP*2 的血量(允许溢血)
     *   2. when_act: 拦截/介入玩家出牌——对传入的 skillCtx 的 power+2, level+2(增强本次出牌), 常驻不销毁
     *   3. when_stageend: 战斗结束时销毁(神格是无触发条件的持续收益, 不允许跨战斗残留)
     */
    "effect_divinity": {
        trigger: ["when_death", "when_act", "when_stageend"],
        run: (effectCtx) => {
            if (effectCtx.trigger === "when_death") {
                const owner = effectCtx.owner
                const target = (owner.maxHP || 100) * 2
                changeHP(owner, target - (owner.HP || 0)) // 复活至 maxHP*2(溢血)
                effectCtx.effSelf.isRemove = true // 触发即销毁, 一次性
            } else if (effectCtx.trigger === "when_act") {
                const skillCtx = effectCtx.exDate && effectCtx.exDate.skillCtx
                if (skillCtx) {
                    skillCtx.power = (skillCtx.power || 0) + 2
                    skillCtx.level = (skillCtx.level || 0) + 2
                }
            } else if (effectCtx.trigger === "when_stageend") {
                effectCtx.effSelf.isRemove = true // 战斗结束: 神格退场
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
        run: (effectCtx) => {
            if (effectCtx.trigger === "when_nextTurn") {
                if (effectCtx.handPool) {
                    const card = effectCtx.effSelf.card
                    if (card) {
                        // 从弃牌堆移除(卡打出后在那), 再还回手中——防止同一引用出现两份
                        const discard = effectCtx.discardPool
                        if (Array.isArray(discard)) {
                            const di = discard.indexOf(card)
                            if (di !== -1) discard.splice(di, 1)
                        }
                        effectCtx.handPool.push(card) // 还回手中
                    }
                    effectCtx.effSelf.isRemove = true // 一次性
                }
            } else if (effectCtx.trigger === "when_stageend") {
                effectCtx.effSelf.isRemove = true
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
        run: (effectCtx) => {
            changeHP(effectCtx.owner, 6 * (effectCtx.effSelf.level || 1), { cap: effectCtx.owner.maxHP })
        }
    },

    /** 金刚杵: 玩家出牌时(when_act, 只扫玩家)本次出牌 power+1 */
    "effect_relic_vajra": {
        trigger: ["when_act"],
        run: (effectCtx) => {
            const skillCtx = effectCtx.exDate && effectCtx.exDate.skillCtx
            if (skillCtx) {
                skillCtx.power = (skillCtx.power || 0) + 1
            }
        }
    },

    /** 灯笼: 每场战斗首回合行动点 +1(允许突破上限) */
    "effect_relic_lantern": {
        trigger: ["when_fightstart"],
        run: (effectCtx) => {
            changeAP(effectCtx.owner, 1, { cap: Infinity })
        }
    },

    /** 船锚: 每场战斗首回合获得 10*level 护盾 */
    "effect_relic_anchor": {
        trigger: ["when_fightstart"],
        run: (effectCtx) => {
            changeDP(effectCtx.owner, 10 * (effectCtx.effSelf.level || 1), {
                fireEffect: effectCtx.fireEffect,
                mobList: effectCtx.mobList,
                playerInfo: effectCtx.playerInfo
            })
        }
    },

    /** 开心花: 每 3 回合行动点 +1(用 effSelf.counter 计数, 不占用 restTurn 语义)
     *  突破上限: 每回合结束 AP 至少回满 maxAP, 若钳制则遗物永远无效——
     *  故参照"强效呼吸"允许突破, 超出部分保留至下一关 */
    "effect_relic_happyFlower": {
        trigger: ["when_nextTurn"],
        run: (effectCtx) => {
            const effSelf = effectCtx.effSelf
            effSelf.counter = (effSelf.counter || 0) + 1
            if (effSelf.counter >= 3) {
                changeAP(effectCtx.owner, 1, { cap: Infinity })
                effSelf.counter = 0
            }
        }
    },

    /** 毒瓶: 每场战斗开始时, 随机一名存活敌人中毒(3 回合) */
    "effect_relic_poisonBottle": {
        trigger: ["when_fightstart"],
        run: (effectCtx) => {
            const mobs = (effectCtx.mobList || []).filter(m => m && m.HP > 0)
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
        run: (effectCtx) => {
            const effSelf = effectCtx.effSelf
            effSelf.counter = (effSelf.counter || 0) + 1
            if (effSelf.counter >= 3) {
                changeAP(effectCtx.owner, 2, { cap: Infinity })
                effSelf.counter = 0
            }
        }
    },

    /** 纸鹤: 攻击带有"易伤"的敌人时, 本次出牌伤害数值 ×1.5(向上取整) */
    "effect_relic_paperKrane": {
        trigger: ["when_act"],
        run: (effectCtx) => {
            const skillCtx = effectCtx.exDate && effectCtx.exDate.skillCtx
            if (!skillCtx || !skillCtx.target) return
            const hasVuln = (skillCtx.target.effect || []).some(e => e.key === "effect_vulnerable")
            if (hasVuln) {
                skillCtx.power = Math.ceil((skillCtx.power || 0) * 1.5)
            }
        }
    },

    // ---------- 尖塔移植遗物(2026-08-13, 需求.md) ----------

    /** 准备背包: 每场战斗开始额外抽 2 张牌(手牌上限内) */
    "effect_relic_bagOfPrep": {
        trigger: ["when_fightstart"],
        run: (effectCtx) => {
            const hand = effectCtx.handPool
            const owner = effectCtx.owner
            if (!Array.isArray(hand) || !owner) return
            const freeSlots = (owner.maxHoldCard || 10) - hand.length
            const pool = effectCtx.battlePool
            for (let i = 0; i < Math.min(2, freeSlots); i++) {
                if (!Array.isArray(pool) || pool.length === 0) break
                const idx = Math.floor(Math.random() * pool.length)
                hand.push(pool.splice(idx, 1)[0])
            }
        }
    },

    /** 地精之角: 每当有敌人死亡, 行动点 +1(突破上限) 并抽 1 张牌 */
    "effect_relic_gremlinHorn": {
        trigger: ["when_death"],
        run: (effectCtx) => {
            const owner = effectCtx.owner
            // 仅怪物死亡触发(玩家死亡不触发: 玩家身上不会挂此遗物效果以外的情况——但防御性判断 owner 是玩家)
            if (!owner || effectCtx.exDate && effectCtx.exDate.isPlayer) return
            changeAP(owner, 1, { cap: Infinity })
            const hand = effectCtx.handPool
            const pool = effectCtx.battlePool
            if (Array.isArray(hand) && Array.isArray(pool)) {
                const freeSlots = (owner.maxHoldCard || 10) - hand.length
                if (freeSlots > 0 && pool.length > 0) {
                    const idx = Math.floor(Math.random() * pool.length)
                    hand.push(pool.splice(idx, 1)[0])
                }
            }
        }
    },

    /** 手里剑: 每回合打出第 3 张攻击牌时, 本场战斗 power+1(计数每回合清零)
     *  用 when_act(玩家出牌时只扫玩家)而非 when_player_act(只扫怪物组)——
     *  遗物挂在玩家身上, when_player_act 语义隔离不会扫到玩家 */
    "effect_relic_shuriken": {
        trigger: ["when_act", "when_nextTurn"],
        run: (effectCtx) => {
            const effSelf = effectCtx.effSelf
            if (effectCtx.trigger === "when_nextTurn") {
                effSelf.counter = 0 // 每回合清零
                return
            }
            const skillCtx = effectCtx.exDate && effectCtx.exDate.skillCtx
            if (!skillCtx || !skillCtx.source || !Array.isArray(skillCtx.source.doSkill)) return
            // 攻击牌判定: doSkill 含攻击类技能(与"攻击牌"语义对应, 见 ATTACK_SKILLS)
            const isAttack = skillCtx.source.doSkill.some(sk => ATTACK_SKILLS.includes(sk))
            if (!isAttack) return
            effSelf.counter = (effSelf.counter || 0) + 1
            if (effSelf.counter >= 3) {
                effectCtx.owner.power = (effectCtx.owner.power || 0) + 1 // 本场战斗力量+1
                effSelf.counter = 0
            }
        }
    },

    /** 水银沙漏: 回合开始时, 对所有敌人造成 3*level 伤害(固定值, 不乘 power) */
    "effect_relic_mercuryHourglass": {
        trigger: ["when_nextTurn"],
        run: (effectCtx) => {
            const dmg = 3 * (effectCtx.effSelf.level || 1)
            const mobs = (effectCtx.mobList || []).filter(m => m && m.HP > 0)
            for (const mob of mobs) {
                changeHP(mob, -dmg)
            }
        }
    },

    // ---------- 术石(戒指槽系列遗物, 2026-08-13, 需求.md) ----------

    /** 魔像之心: 回合开始时, 玩家无护盾则提供 20 点, 已有护盾则仅提供 4 点 */
    "effect_relic_golemHeart": {
        trigger: ["when_nextTurn"],
        run: (effectCtx) => {
            const owner = effectCtx.owner
            if (!owner) return
            const dp = owner.DP || 0
            changeDP(owner, dp === 0 ? 20 : 4, {
                fireEffect: effectCtx.fireEffect,
                mobList: effectCtx.mobList,
                playerInfo: effectCtx.playerInfo
            })
        }
    },

    /** 复苏之叶: 每次出牌(when_act)恢复 2 点生命; 每回合(when_nextTurn)额外 1 点 AP(可超上限) */
    "effect_relic_leafOfRevival": {
        trigger: ["when_act", "when_nextTurn"],
        run: (effectCtx) => {
            const owner = effectCtx.owner
            if (!owner) return
            if (effectCtx.trigger === "when_act") {
                // 出牌回血: 封顶 maxHP
                changeHP(owner, 2, { cap: owner.maxHP })
            } else {
                // 回合开始 AP+1(可突破上限)
                changeAP(owner, 1, { cap: Infinity })
            }
        }
    },

    /**
     * 球生成器(失落引擎常驻): 玩家出牌时按 costAP 产球——
     *   costAP=0 → 0 个; 1~4 → 1 个; >4 → 2 个; 随机球种(闪电/冰霜)。
     *   产球直接进手牌(渲染层, 马上可以打出); 球不进存档牌库, 不打出的球回合末自然进弃牌堆。
     */
    "effect_orbGenerator": {
        trigger: ["when_act"],
        run: (effectCtx) => {
            const skillCtx = effectCtx.exDate && effectCtx.exDate.skillCtx
            const hand = effectCtx.handPool
            if (!skillCtx || !skillCtx.source || !Array.isArray(hand)) return
            const cost = skillCtx.source.costAP || 0
            let count = 0
            if (cost >= 1 && cost <= 4) count = 1
            else if (cost > 4) count = 2
            if (count <= 0) return
            const orbKeys = ["闪电球", "冰霜球"]
            for (let i = 0; i < count; i++) {
                const key = orbKeys[Math.floor(Math.random() * orbKeys.length)]
                const orb = createCard(key, { level: 1 })
                if (orb) hand.push(orb) // 直接入手牌(渲染层), 本回合即可打出/三消
            }
        }
    },

    /** 铜制核心(BOSS专属遗物): 每场战斗开始时召唤 1 只铜球(等级=1) */
    "effect_relic_copperCore": {
        trigger: ["when_fightstart"],
        run: (effectCtx) => {
            const mobList = effectCtx.mobList
            if (!Array.isArray(mobList)) return
            const orb = createMob("铜球", { level: 1, nextSkill: null })
            if (orb) mobList.push(orb)
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
        run: (effectCtx) => {
            if (effectCtx.trigger === "when_damaged") {
                const ex = effectCtx.exDate || {}
                const level = effectCtx.effSelf.level || 0
                if (ex.damage > 0 && level > 0 && ex.actor && ex.actor !== effectCtx.owner) {
                    const bonus = Math.floor(ex.damage * 0.5 * level)
                    if (bonus > 0) {
                        // isFireEffect:false —— 追加伤害不触发 when_damaged, 防无限递归
                        dealDamage(ex.actor, effectCtx.owner, bonus, {
                            isFireEffect: false,
                            mobList: effectCtx.mobList,
                            playerInfo: effectCtx.playerInfo
                        })
                    }
                }
            } else {
                effectCtx.effSelf.restTurn -= 1
                if (effectCtx.effSelf.restTurn <= 0) {
                    effectCtx.effSelf.isRemove = true
                }
            }
        }
    },

    /** 仪式(邪教徒): 每回合开始时 power +level(对应尖塔"仪式: 每回合 +力量") */
    "effect_ritual": {
        trigger: ["when_nextTurn"],
        run: (effectCtx) => {
            effectCtx.owner.power = (effectCtx.owner.power || 0) + (effectCtx.effSelf.level || 1)
        }
    },

    /**
     * 残血分裂(史莱姆老大): 受到伤害后 HP 低于 maxHP 一半时——
     * 召唤 2 只史莱姆(等级-1), 本体 HP 归 0 退场(走 cleanDeath 结算)。
     * splitDone 标记: 仅触发一次。
     */
    "effect_eliteSplit": {
        trigger: ["when_damaged"],
        run: (effectCtx) => {
            const owner = effectCtx.owner
            const effSelf = effectCtx.effSelf
            if (effSelf.splitDone) return
            if (owner.HP > 0 && owner.HP < (owner.maxHP || 1) / 2) {
                effSelf.splitDone = true
                const level = Math.max(1, (owner.level || 1) - 1)
                for (let i = 0; i < 2; i++) {
                    const slime = createMob("史莱姆", { level })
                    if (slime) effectCtx.mobList.push(slime)
                }
                changeHP(owner, -owner.HP*999)//本体退场
            }
        }
    },

    // ============================================================
    // 七咒之戒(混沌预设常驻 buff, 需求.md 2026-08-16)
    // ============================================================
    /**
     * 七咒之戒: 混沌预设自带的常驻效果, 七咒全部效果集中于此一个 buff。
     * 触发时机:
     *   when_mob_act  - 诅咒1: 任意敌人的攻击等效 power+1(怪物行动时扫玩家, 篡改 skillCtx)
     *   when_shieldGain - 诅咒2: 任意获得的护盾量减半(向上取整)(changeDP 钩子, 篡改 exDate.delta)
     *   when_act      - 诅咒3: 任意造成的攻击等效 power-1
     *                 诅咒4: 过度劳累——打出牌时额外消耗 1 点 AP(不扣到负数)
     * 诅咒 7(不死图腾失效)在 effect_blessing 内部检测本效果存在即失效。
     */
    "effect_sevenCurses": {
        trigger: ["when_mob_act", "when_shieldGain", "when_act"],
        run: (effectCtx) => {
            const ex = effectCtx.exDate || {}

            // 诅咒 1: 敌人攻击等效 power+1(篡改怪物行动的 skillCtx)
            if (effectCtx.trigger === "when_mob_act") {
                const skillCtx = ex.skillCtx
                if (skillCtx) skillCtx.power = (skillCtx.power || 0) + 1
                return
            }

            // 诅咒 2: 获得的护盾量减半, 向上取整(篡改 changeDP 的 exDate.delta)
            if (effectCtx.trigger === "when_shieldGain") {
                if (typeof ex.delta === "number") ex.delta = Math.ceil(ex.delta / 2)
                return
            }

            // 诅咒 3/4: 玩家出牌时(when_act)
            if (effectCtx.trigger !== "when_act") return
            const skillCtx = ex.skillCtx
            if (!skillCtx) return
            // 诅咒 3: 攻击等效 power-1(本次出牌数值篡改, 与金刚杵同理)
            skillCtx.power = (skillCtx.power || 0) - 1
            // 诅咒 4: 过度劳累——额外消耗 1 点 AP, 不扣到负数
            changeAP(effectCtx.owner, -1, { floor: 0 })
        }
    }
}