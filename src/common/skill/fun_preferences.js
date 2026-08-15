// common/fun_preferences.js
/**
 * ============================================================
 * 行动偏好库 actionPref_LIB
 * ============================================================
 * 行动偏好(特殊行动): 挂在怪物模板的 sAct 字段(键数组)上, 优先级高于 act。
 * 由 mobs.js 的 rollNextTurn 在"偏好阶段"按顺序调用:
 *
 *   偏好函数签名: (mob, prefCtx) => "技能key" | null | undefined
 *     - "技能key"  -> 使用该技能(本回合行动定案; 不更新主 act 状态, 不进 act 黑名单)
 *     - null       -> 明确"无行动"(本回合发呆)
 *     - undefined  -> 条件不满足 / 偏好未定义: 跳过找下一个偏好, 全部 undefined 则回退 act 正常决策
 *
 * prefCtx: { banned: {key: true} } —— 框架递减前的黑名单禁用集(与对象模式 act 黑名单同一节奏:
 *   值>=1 时本次 roll 仍禁用)。偏好如需"禁用自己若干回合", 自行把偏好 key 写入
 *   mob.blackList(与 act 黑名单一同管理/递减), 参考 effect 自行维护 isRemove 的方式。
 */

export const actionPref_LIB = {
    /**
     * 暴怒(anger): 血量低于 maxHP 1/4 时触发暴怒。
     *   - 触发: 把自己("anger")写入 blackList 禁 3 回合(与 act 黑名单同一递减节奏), 返回"生气"技能
     *   - 生气(skill_mob_anger): 本怪物 power 永久 +2
     *   - 禁用期间 / 血量未低于阈值: 返回 undefined(回退主 act)
     */
    anger: (mob, prefCtx) => {
        // 禁用中(递减前值 > 0): 跳过
        if (prefCtx && prefCtx.banned && prefCtx.banned["anger"]) return undefined

        // 血量低于 maxHP 1/4: 触发暴怒
        const maxHP = mob.maxHP || mob.HP || 1
        if (mob.HP < maxHP / 4) {
            mob.blackList = mob.blackList || {}
            mob.blackList["anger"] = 3 // 自行写入禁用表(禁 3 回合)
            return "skill_mob_anger"
        }
        return undefined
    }
}
