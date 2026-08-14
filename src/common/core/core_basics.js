// common/core_basics.js
/**
 * ============================================================
 * 基础操作层 —— 游戏中所有数值修改的【唯一入口】
 * ============================================================
 * 任何技能 / 效果 / 战斗流程代码, 都不得直接修改实体的
 * HP / AP / DP 等数值字段, 必须经由本文件中的函数。
 *
 * 这样做的意义:
 *   1. 钳制规则(治疗封顶、生命不低于 0)只写一次;
 *   2. 数值修改点集中, 日志/统计/未来的触发器可以挂在这里;
 *   3. 杜绝旧版中 `target.HP += num` 散落各处的写法。
 *
 * 实体(entity) 统一指"玩家对象 或 怪物对象",
 * 二者均需具备 { HP, DP, ... } 字段(玩家另有 maxHP/maxAP/AP)。
 */

/**
 * 修改实体生命值(差值模式)
 * @param {Object} entity - 目标实体(玩家/怪物)
 * @param {number} delta  - 变化量(正数=治疗, 负数=伤害)
 * @param {Object} [opts]
 * @param {number} [opts.cap]   - 治疗上限(默认不封顶)
 * @param {number} [opts.floor=0] - 生命下限(默认 0)
 * @returns {number} 实际生效的变化量
 */
export function changeHP(entity, delta, opts = {}) {
    if (!entity || typeof entity.HP !== 'number') {
        console.warn('[changeHP] 无效实体, 跳过:', entity)
        return 0
    }
    const { cap, floor = 0 } = opts
    const oldHP = entity.HP
    let newHP = oldHP + delta
    if (cap !== undefined) newHP = Math.min(newHP, cap)
    newHP = Math.max(newHP, floor)
    entity.HP = newHP
    return newHP - oldHP
}

/**
 * 修改实体行动点(玩家专用, 怪物没有 AP)
 * @param {Object} entity - 目标实体
 * @param {number} delta  - 变化量
 * @param {Object} [opts]
 * @param {number} [opts.cap] - 上限(默认取 entity.maxAP, 未定义则不封顶)
 * @param {number} [opts.floor=0] - 下限
 * @returns {number} 实际生效的变化量
 */
export function changeAP(entity, delta, opts = {}) {
    if (!entity || typeof entity.AP !== 'number') {
        console.warn('[changeAP] 目标不存在 AP 属性, 跳过:', entity)
        return 0
    }
    const { cap = entity.maxAP, floor = 0 } = opts
    const oldAP = entity.AP
    let newAP = oldAP + delta
    if (cap !== undefined && cap !== null) newAP = Math.min(newAP, cap)
    newAP = Math.max(newAP, floor)
    entity.AP = newAP
    return newAP - oldAP
}

/**
 * 修改实体护盾(护盾每回合会被清空, 只增不减, 不设上限)
 * @param {Object} entity - 目标实体
 * @param {number} delta  - 变化量(正数=加盾, 负数=扣盾)
 * @returns {number} 实际生效的变化量
 */
export function changeDP(entity, delta) {
    if (!entity) {
        console.warn('[changeDP] 无效实体, 跳过:', entity)
        return 0
    }
    // 容错: DP 字段缺失(如预设未初始化)时按 0 处理并初始化
    const oldDP = typeof entity.DP === 'number' ? entity.DP : 0
    entity.DP = Math.max(0, oldDP + delta)
    return entity.DP - oldDP
}

/**
 * 伤害修正: 先让目标护盾吸收, 返回穿透到生命的剩余伤害。
 * 注意: 该函数会【原地扣除】目标护盾 (与旧版 fixDamage 行为一致)。
 * @param {number} rowDamage - 原始伤害
 * @param {Object} target    - 被攻击目标
 * @returns {number} 护盾吸收后剩余的伤害(>=0)
 */
export function fixDamage(rowDamage, target) {
    let remaining = Math.max(rowDamage || 0, 0)
    if (target && target.DP && target.DP > 0) {
        if (target.DP >= remaining) {
            target.DP -= remaining
            remaining = 0
        } else {
            remaining -= target.DP
            target.DP = 0
        }
    }
    // buff减伤暂不使用
    return remaining
}

/**
 * 标准伤害管线: 护盾吸收 -> 扣除生命, 并返回实际造成的生命伤害。
 * 技能代码一律使用本函数而非"改HP + fixDamage 手写两行"。
 * ⭐ when_damaged 触发已集成: 实际造成生命伤害时, 自动触发目标身上的 when_damaged 效果。
 *   触发能力由调用方**显式传入**(opts.fireEffect, 通常来自 buildSkillCtx 注入的 ctx.fireEffect),
 *   不传则不触发——无全局状态/钩子, 依赖方向清晰。
 * @param {Object} source      - 伤害来源(攻击者, 注入 when_damaged 的 exDate.actor)
 * @param {Object} target      - 受击目标
 * @param {number} rawDamage   - 原始伤害值
 * @param {Object} [opts]
 * @param {Function} [opts.fireEffect] - when_damaged 触发函数(见 core_effect.js 的 fireEffect)
 * @param {boolean} [opts.isFireEffect=true] - 是否触发 when_damaged。effect 自身触发的伤害
 *        通常传 false, 防止"效果触发的伤害再次触发效果"导致的无限递归。
 * @param {Array}  [opts.mobList]   - 战斗怪物组(注入 when_damaged 效果上下文, 可省略)
 * @param {Object} [opts.playerInfo]- 玩家对象(同上)
 * @returns {number} 实际穿透到生命的伤害
 */
export function dealDamage(source, target, rawDamage, opts = {}) {
    const { fireEffect, isFireEffect = true, mobList, playerInfo } = opts
    const damage = fixDamage(rawDamage, target)
    if (damage > 0) {
        changeHP(target, -damage)
        if (isFireEffect && typeof fireEffect === 'function') {
            fireEffect({
                trigger: "when_damaged",
                targets: target,
                exDate: { damage, actor: source },
                mobList,
                playerInfo
            })
        }
    }
    return damage
}

/**
 * 修改实体金币(玩家专用)
 * @param {Object} entity - 目标实体(玩家)
 * @param {number} delta  - 变化量(正=获得, 负=消耗)
 * @param {Object} [opts]
 * @param {number} [opts.floor=0] - 下限(金币不为负)
 * @returns {number} 实际生效的变化量
 */
export function changeGold(entity, delta, opts = {}) {
    if (!entity) {
        console.warn('[changeGold] 无效实体, 跳过:', entity)
        return 0
    }
    const { floor = 0 } = opts
    const oldGold = typeof entity.goldNum === 'number' ? entity.goldNum : 0
    entity.goldNum = Math.max(floor, oldGold + delta)
    return entity.goldNum - oldGold
}

/**
 * 死亡判定
 * @param {Object} entity - 目标实体
 * @returns {boolean} 是否死亡
 */
export function isDead(entity) {
    return !!entity && entity.HP <= 0
}
