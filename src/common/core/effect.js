// common/core/effect.js
/**
 * ============================================================
 * 效果执行器: doEffect / fireEffect / effectClear
 * ============================================================
 * 效果(effect)是挂在实体(玩家/怪物)身上的持续性 buff/debuff,
 * 在特定触发时机(trigger)由本模块统一分发执行。
 *
 * 触发时机约定(trigger):
 *   when_death   - 实体死亡时
 *   when_nextTurn- 回合开始时(先于行动结算)
 *   when_damaged - 实体受到伤害后(由 dealDamage 自动触发, 经 exDate.damage / exDate.actor 获取信息)
 *
 * 效果上下文(eff_ctx)结构:
 *   owner / trigger / effSelf / exDate / mobList / playerInfo
 * (详细注释见 skills/effects.js)
 */

import { effect_LIB } from "../skills/effects.js"
import { dealDamage } from "./basics.js"

/**
 * 注入 when_damaged 分发钩子到 dealDamage:
 *   basics 保持无依赖(不 import 本模块, 避免 basics<->effects 循环依赖),
 *   由本模块在加载时把"触发 when_damaged"的能力挂到 dealDamage.onDamage 上。
 * 此后任何 dealDamage 造成实际生命伤害, 都会自动触发目标的 when_damaged 效果。
 * exDate = { damage: 实际伤害, actor: 攻击者 }
 */
dealDamage.onDamage = (target, damage, actor, ctx = {}) => {
    fireEffect({
        trigger: "when_damaged",
        targets: target,
        exDate: { damage, actor },
        mobList: ctx.mobList,
        playerInfo: ctx.playerInfo
    })
}

/**
 * 执行单个效果(旧版同名函数的规范化版本, 逻辑不变)
 * @param {Object} ctx - 完整的效果上下文
 * @returns {boolean} 是否成功执行
 */
export function doEffect(ctx) {
    const key = ctx.effSelf.key
    if (!effect_LIB.hasOwnProperty(key)) {
        console.warn(`[doEffect] "${key}" 不存在于 effect_LIB 中`)
        return false
    }
    const act = effect_LIB[key]
    if (typeof act !== 'function') {
        console.warn(`[doEffect] "${key}" 对应的 ${act} 似乎不是函数`)
        return false
    }
    try {
        act(ctx)
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
 */
export function fireEffect({ trigger, targets, exDate = {}, mobList, playerInfo, handPool }) {
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
                handPool
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
