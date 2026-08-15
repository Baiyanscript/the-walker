// common/core_effect.js
/**
 * ============================================================
 * 效果执行器: addEffect / doEffect / fireEffect / effectClear
 * ============================================================
 * 效果(effect)是挂在实体(玩家/怪物)身上的持续性 buff/debuff,
 * 在特定触发时机(trigger)由本模块统一分发执行。
 *
 * 触发时机约定(trigger):
 *   when_death   - 实体死亡时
 *   when_nextTurn- 回合开始时(先于行动结算)
 *   when_damaged - 实体受到伤害后(由 dealDamage 自动触发, 经 exDate.damage / exDate.actor 获取信息)
 *   when_act     - 行动前(效果可直接修改传入的 skillCtx)
 *   when_turnEnd - 回合末结算(经 exDate.phase 区分 pre/post 阶段)
 *   when_detox   - 主动解毒(快速充能等触发)
 *
 * 效果上下文(effectCtx)结构:
 *   owner / trigger / effSelf / exDate / mobList / playerInfo
 * (详细注释见 fun_effect.js)
 */

import { effect_LIB } from "../skill/fun_effect.js"

/**
 * 给实体挂载效果(带去重合并)
 * ⭐ 去重规则(需求): 默认去重态, 见效果条目的 dedupe 栏位。
 *   - dedupe 为 false 的效果(如"返还"): 不去重, 每次独立挂载——避免合并丢失其独有数据(card 等)。
 *   - 默认可去重(合并)时:
 *       · 前后 level 一致  -> 取较大的 restTurn(restTurn 为 "inf" 视为无限大)
 *       · 前后 level 不一致 -> 取较大的 level, 且 restTurn 采用较大 level 者的(不管大小)
 *       · 新效果的 exDate 覆盖旧值(默认可去重类效果均无 exDate, 此处仅为未来效果预留)
 *   - 旧效果已标记 isRemove(即将被清理)时直接替换, 不与"尸体"合并。
 * 技能统一调用本函数挂载效果, 不要直接 owner.effect.push。
 *
 * @param {Object} owner - 实体(玩家/怪物), effect 数组不存在时自动初始化
 * @param {Object} eff   - 效果对象 {key, restTurn, level, isRemove, ...}
 */
export function addEffect(owner, eff) {
    if (!owner || !eff || !eff.key) return
    if (!Array.isArray(owner.effect)) owner.effect = []

    const idx = owner.effect.findIndex(e => e.key === eff.key)
    if (idx === -1) {
        owner.effect.push(eff)
        return
    }
    const prev = owner.effect[idx]

    // 旧效果即将被清理: 直接替换, 不参与合并
    if (prev.isRemove === true) {
        owner.effect[idx] = eff
        return
    }

    // 不去重声明(dedupe: false): 各自独立挂载
    const entry = effect_LIB[eff.key]
    if (entry && entry.dedupe === false) {
        owner.effect.push(eff)
        return
    }

    // 默认去重合并: 规则见函数头注释
    const prevLevel = prev.level || 0
    const nextLevel = eff.level || 0
    prev.level = Math.max(prevLevel, nextLevel)
    if (prevLevel === nextLevel) {
        prev.restTurn = biggerRestTurn(prev.restTurn, eff.restTurn)
    } else {
        prev.restTurn = nextLevel > prevLevel ? eff.restTurn : prev.restTurn
    }
    if (eff.exDate !== undefined) prev.exDate = eff.exDate
}

/** 取较大的持续回合("inf" = 无限, 视为最大) */
function biggerRestTurn(a, b) {
    if (a === "inf" || b === "inf") return "inf"
    return Math.max(Number(a) || 0, Number(b) || 0)
}

/**
 * 执行单个效果(按条目声明分发)
 * @param {Object} effectCtx - 完整的效果上下文
 * @returns {boolean} 是否成功执行
 */
export function doEffect(effectCtx) {
    const key = effectCtx.effSelf.key
    const entry = effect_LIB[key]
    if (!entry || typeof entry.run !== 'function') {
        console.warn(`[doEffect] "${key}" 不存在于 effect_LIB 中(或缺少 run 函数)`)
        return false
    }
    // 声明了 trigger 栏位且不响应当前时机: 跳过(未声明则默认全部响应, 兼容旧效果)
    if (Array.isArray(entry.trigger) && !entry.trigger.includes(effectCtx.trigger)) {
        return false
    }
    try {
        entry.run(effectCtx)
        return true
    } catch (e) {
        console.warn(`[doEffect] "${key}" 对应的函数出错了:`, e)
        return false
    }
}

/**
 * 按触发时机对一批目标批量触发效果(原 fighting 页面方法的通用化)
 * @param {Object} p - 触发参数
 * @param {string} p.trigger    - 触发时机, 如 "when_death"
 * @param {Object|Array} p.targets - 单个对象(玩家/怪物)或对象数组
 * @param {Object} [p.exDate={}] - 附加数据(如 when_damaged 时的 damage/actor)
 * @param {Array}  [p.mobList]   - 当前怪物组(注入效果上下文)
 * @param {Object} [p.playerInfo] - 玩家对象(注入效果上下文)
 * @param {Array}  [p.handPool]  - 当前手牌(注入效果上下文, 供"返还"类效果使用)
 * @param {Array}  [p.discardPool] - 当前弃牌堆(注入效果上下文, 供"返还"类效果从弃牌堆拿回卡)
 * @param {Array}  [p.battlePool] - 战斗内抽牌堆(注入效果上下文, 供"抽牌/准备背包"类效果使用)
 * @param {Array}  [p.drawPool]  - 存档牌库(注入效果上下文, 供"销毁/强化"类效果使用)
 */
export function fireEffect({ trigger, targets, exDate = {}, mobList, playerInfo, handPool, discardPool, battlePool, drawPool }) {
    const list = Array.isArray(targets) ? targets : [targets]

    for (const owner of list) {
        if (!owner || !owner.effect || owner.effect.length === 0) continue

        // 反向遍历, 防止删除时索引错乱
        for (let i = owner.effect.length - 1; i >= 0; i--) {
            const effSelf = owner.effect[i]
            doEffect({
                owner,
                trigger,
                exDate,
                effSelf,
                mobList,
                playerInfo,
                handPool,
                discardPool,
                battlePool,
                drawPool
            })
        }

        // 清理已标记移除的效果
        effectClear(owner)
    }
}

/**
 * 清理需要被删除的效果(移除 isRemove 为真的项)
 * @param {Object} obj - 包含 effect 数组的对象(玩家或怪物)
 * 直接修改原对象
 */
export function effectClear(obj) {
    if (!obj || !Array.isArray(obj.effect)) return
    for (let i = obj.effect.length - 1; i >= 0; i--) {
        if (obj.effect[i].isRemove === true) {
            obj.effect.splice(i, 1)
        }
    }
}
