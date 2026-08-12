// common/data/relics.js
/**
 * ============================================================
 * 遗物表 relic_LIB + 遗物工厂函数
 * ============================================================
 * 杀戮尖塔化(2026-08-12): 新增"遗物"机制——
 * 遗物是永久生效的 buff, 获取后随存档保留, 跨战斗持续。
 *
 * 实现方式(参考"非欧立方"的神格/不灭——effect + restTurn:"inf"):
 *   - 每个遗物 = 一个 effect(挂在玩家 playerInfo.effect 上, 随存档持久化)
 *     → 战斗流程在既有触发时机(when_act/when_stageend/when_fightstart 等)分发执行
 *   - 部分遗物是"获取即生效"型(如草莓+最大生命), 走 onGain 函数, 不挂 effect
 *   - playerInfo.relics = [{key, name}] 仅用于展示/去重(同名遗物唯一)
 *
 * 遗物条目结构:
 *   name   - 展示名
 *   desc   - 描述文本(遗物栏/商店展示)
 *   effect - 可选: 要挂到玩家身上的 effect 配置 {key, level}(restTurn 统一 "inf")
 *   onGain - 可选: 获取时的立即生效函数(player) => void
 */

import { addEffect } from "../core/effect.js"

export const relic_LIB = {
    "relic_burningBlood": {
        name: "燃烧之血",
        desc: "战斗结束时, 恢复 6 点生命",
        effect: { key: "effect_relic_burningBlood", level: 1 }
    },
    "relic_vajra": {
        name: "金刚杵",
        desc: "出牌时, 本次伤害数值 +1",
        effect: { key: "effect_relic_vajra", level: 1 }
    },
    "relic_lantern": {
        name: "灯笼",
        desc: "每场战斗首回合, 行动点 +1",
        effect: { key: "effect_relic_lantern", level: 1 }
    },
    "relic_anchor": {
        name: "船锚",
        desc: "每场战斗首回合, 获得 10 点护盾",
        effect: { key: "effect_relic_anchor", level: 1 }
    },
    "relic_happyFlower": {
        name: "开心花",
        desc: "每 3 个回合, 行动点 +1",
        effect: { key: "effect_relic_happyFlower", level: 1 }
    },
    "relic_strawberry": {
        name: "草莓",
        desc: "获得时: 最大生命 +7, 并回复 7 点生命",
        onGain(player) {
            player.maxHP = (player.maxHP || 0) + 7
            player.HP = (player.HP || 0) + 7
        }
    },
    "relic_poisonBottle": {
        name: "毒瓶",
        desc: "每场战斗开始时, 随机一名敌人中毒",
        effect: { key: "effect_relic_poisonBottle", level: 1 }
    },
    // ---------- 尖塔移植遗物(2026-08-12) ----------
    "relic_sundial": { // 尖塔日晷: 每洗牌 3 次 +2 能量
        name: "日晷",
        desc: "每洗牌 3 次, 行动点 +2",
        effect: { key: "effect_relic_sundial", level: 1 }
    },
    "relic_paperKrane": { // 尖塔纸鹤: 对易伤目标增伤(原版为虚弱减伤, 本项目改为易伤联动)
        name: "纸鹤",
        desc: "攻击带有易伤的敌人时, 伤害提高 50%",
        effect: { key: "effect_relic_paperKrane", level: 1 }
    },
    "relic_mango": { // 尖塔芒果: 最大生命 +10
        name: "芒果",
        desc: "获得时: 最大生命 +10, 并回复 10 点生命",
        onGain(player) {
            player.maxHP = (player.maxHP || 0) + 10
            player.HP = (player.HP || 0) + 10
        }
    }
}

/**
 * 随机抽取若干不重复的遗物候选(遗物区三选一用)
 * @param {number} [count=3] - 候选数量(不超过遗物总数)
 * @returns {Array<{key, name, desc}>} 候选列表(含 key 便于获取)
 */
export function rollRelicCandidates(count = 3) {
    const keys = Object.keys(relic_LIB)
    const copy = [...keys]
    const picked = []
    for (let i = 0; i < Math.min(count, copy.length); i++) {
        const idx = Math.floor(Math.random() * copy.length)
        picked.push(copy.splice(idx, 1)[0])
    }
    return picked.map(k => ({ key: k, ...relic_LIB[k] }))
}

/**
 * 获取一个遗物(挂永久效果 + 记录 relic 条目)
 * 同名遗物唯一: 已拥有则拒绝
 * @param {Object} player - 玩家对象(原地修改: effect / relics / 属性)
 * @param {string} relicKey - relic_LIB 键名
 * @returns {boolean} 是否获取成功
 */
export function gainRelic(player, relicKey) {
    const r = relic_LIB[relicKey]
    if (!r || !player) return false
    if (!Array.isArray(player.relics)) player.relics = []
    if (player.relics.some(x => x.key === relicKey)) return false // 同名遗物唯一

    // 获取即生效型(onGain)
    if (typeof r.onGain === "function") r.onGain(player)
    // 挂永久效果(restTurn "inf" = 跨战斗常驻, 不响应任何移除时机)
    if (r.effect) {
        addEffect(player, {
            key: r.effect.key,
            restTurn: "inf",
            level: r.effect.level || 1,
            isRemove: false
        })
    }
    player.relics.push({ key: relicKey, name: r.name })
    return true
}

/**
 * 查询遗物详情文本(展示用)
 * @param {string} relicKey - relic_LIB 键名
 * @returns {string} "名字: 描述"; 未知键返回 "?"
 */
export function getRelicDetail(relicKey) {
    const r = relic_LIB[relicKey]
    return r ? `${r.name}: ${r.desc}` : "?"
}
