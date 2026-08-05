// common/core/skill.js
/**
 * ============================================================
 * 技能执行器: 标准技能上下文构造 + 技能执行
 * ============================================================
 * ⭐ 这是解决旧版"skill 含义模糊"问题的核心文件。
 *
 * 旧版问题回顾:
 *   - ctx.caster 对玩家出牌时是"玩家对象", 但 power/level 却来自卡牌;
 *   - 怪物行动时 caster 又是怪物自己, 同一个技能函数两种含义;
 *   - 改玩家血量的操作散落在 ctx.caster / ctx.target / ctx.playerInfo 三个入口。
 *
 * 新版语义(三角色模型):
 *   source - 数值来源: 卡牌实例 或 怪物实例。power/level 只从它读取。
 *   actor  - 执行者: 玩家 或 怪物。"对自己生效"的操作(护盾/自疗/自伤/耗AP)
 *            一律作用于 actor。→ 解决"玩家power/level来自卡牌, 但血量操作要对玩家做":
 *            玩家出牌时 source=卡牌(提供数值), actor=玩家(承受自身效果)。
 *   target - 作用对象: 被攻击 / 被上buff的实体。
 *
 * 使用示例(页面调用):
 *   // 玩家出牌
 *   const ctx = buildSkillCtx({
 *       source: card,              // 数值来自卡牌
 *       actor: this.playerInfo,    // 执行者是玩家
 *       target: mob,               // 打这个怪物
 *       targetIndex: mobIndex,
 *       playerInfo: this.playerInfo,
 *       mobList: this.MobPool,
 *       handPool: this.fightPlayercardPool
 *   })
 *   // 怪物行动
 *   const ctx = buildSkillCtx({
 *       source: mob, actor: mob, target: this.playerInfo,
 *       playerInfo: this.playerInfo, mobList: this.MobPool, handPool: ...
 *   })
 */

import { skill_LIB } from "../skills/skills.js"

/**
 * 构造标准技能上下文
 * @param {Object} p - 上下文输入
 * @param {Object} p.source       - 数值来源(卡牌实例 或 怪物实例), 必填
 * @param {Object} p.actor        - 执行者(玩家 或 怪物), 必填
 * @param {Object} p.target       - 作用对象, 必填
 * @param {number} [p.targetIndex=-1] - 目标在怪物列表中的索引(横扫等需要)
 * @param {Object} p.playerInfo   - 玩家对象(环境注入)
 * @param {Array}  p.mobList      - 当前怪物组(环境注入)
 * @param {Array}  p.handPool     - 当前手牌(环境注入, 供复制/入手的技能使用)
 * @param {Array}  p.drawPool
 * @returns {Object} 标准 ctx
 */
export function buildSkillCtx({
    source,
    actor,
    target,
    targetIndex = -1,
    playerInfo,
    mobList,
    handPool,
    drawPool
}) {
    if (!source || !actor || !target) {
        console.warn('[buildSkillCtx] source/actor/target 三者均不可为空:', { source, actor, target })
    }
    return {
        // 三角色(语义核心)
        source,
        actor,
        target,
        // 便捷数值(只读自 source; 技能代码可用, 也可直接读 ctx.source)
        level: (source && source.level) || 1,
        power: (source && source.power) || 0,
        // 环境注入
        targetIndex,
        playerInfo,
        mobList,
        handPool,
        drawPool
    }
}

/**
 * 执行一个技能(封装校验与异常捕获)
 * @param {string} skillKey - skill_LIB 中的键名
 * @param {Object} ctx      - 由 buildSkillCtx 构造的标准上下文
 * @returns {boolean} 是否成功执行
 */
export function runSkill(skillKey, ctx) {
    const act = skill_LIB[skillKey]
    if (typeof act !== 'function') {
        console.warn(`[runSkill] 技能 "${skillKey}" 未在 skill_LIB 中定义`)
        return false
    }
    try {
        act(ctx)
        return true
    } catch (e) {
        console.error(`[runSkill] 技能 "${skillKey}" 执行异常:`, e)
        return false
    }
}
