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
 *   slot   - 可选: 装备槽位(如 "spellstone" 术石)。同 slot 能且仅能装备 1 个,
 *            新获得时替换掉已装备的同槽旧遗物(移除旧效果)——术石等系列遗物用
 *   limit  - 可选: 来源白名单(与卡牌共用 isTplEligible, 需求.md 2026-08-16)。
 *            如 ["七咒"] 仅七咒预设可刷, ["BOSS"] 仅 BOSS 来源可见; 未声明 = 通用
 *   rare   - 可选: 需求.md 标注的稀有度(数据声明, 暂不参与逻辑)
 */

import { addEffect } from "../core/core_effect.js"
import { isTplEligible } from "./cards.js"

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
    },
    // ---------- 尖塔移植遗物(2026-08-13, 需求.md) ----------
    "relic_bagOfPrep": { // 尖塔准备背包: 每场战斗开始额外抽2张
        name: "准备背包",
        desc: "每场战斗开始时, 额外抽 2 张牌",
        effect: { key: "effect_relic_bagOfPrep", level: 1 }
    },
    "relic_gremlinHorn": { // 尖塔地精之角: 敌人死亡时 +1 能量抽1张
        name: "地精之角",
        desc: "每当有敌人死亡, 行动点 +1 并抽 1 张牌",
        effect: { key: "effect_relic_gremlinHorn", level: 1 }
    },
    "relic_shuriken": { // 尖塔手里剑: 每回合打出第3张攻击牌时 +1 力量
        name: "手里剑",
        desc: "每回合打出第 3 张攻击牌时, 本场战斗 power+1",
        effect: { key: "effect_relic_shuriken", level: 1 }
    },
    "relic_mercuryHourglass": { // 尖塔水银沙漏: 回合开始对全体敌人造成伤害
        name: "水银沙漏",
        desc: "回合开始时, 对所有敌人造成 3 点伤害",
        effect: { key: "effect_relic_mercuryHourglass", level: 1 }
    },
    // ---------- 术石(spellstone 槽系列遗物, 需求.md 2026-08-16: 原"ring"改名) ----------
    "relic_golemHeart": {
        name: "术石·魔像之心",
        desc: "回合开始时: 无护盾则获得 20 点护盾, 已有护盾则仅获得 4 点",
        slot: "spellstone", // 术石槽: 与复苏之叶互斥, 新获得替换旧的
        effect: { key: "effect_relic_golemHeart", level: 1 }
    },
    "relic_leafOfRevival": {
        name: "术石·复苏之叶",
        desc: "每次出牌恢复 2 点生命; 每回合额外 1 点行动力(可突破上限)",
        slot: "spellstone", // 术石槽: 与魔像之心互斥
        effect: { key: "effect_relic_leafOfRevival", level: 1 }
    },
    // ---------- 七咒专属遗物(需求.md 2026-08-16, limit:["七咒"] 仅七咒预设可刷) ----------
    "relic_voidPearl": {
        name: "术石·虚空珍珠",
        desc: "回合结束时对全体敌人造成 5 点伤害; 死亡时 35% 概率复活(满血)",
        slot: "spellstone", // 术石槽: 与魔像之心/复苏之叶互斥
        limit: ["七咒"],
        rare: 3, // 需求.md 标注稀有度(数据声明, 暂不参与逻辑)
        effect: { key: "effect_relic_voidPearl", level: 1 }
    },
    "relic_celestialFruit": {
        name: "天体果实",
        desc: "获得时: 生命回满, 生命上限 +20",
        limit: ["七咒"],
        rare: 2,
        onGain(player) {
            player.maxHP = (player.maxHP || 0) + 20
            player.HP = player.maxHP
        }
    },
    // ---------- BOSS 专属遗物(limit:"BOSS", 铜制机械人偶 75 层, 需求.md 2026-08-16) ----------
    "relic_copperCore": {
        name: "铜制核心",
        desc: "每场战斗开始时, 召唤 1 只铜球(铜制机械人偶的核心残片)",
        limit: ["BOSS"], // 专属遗物: 仅 BOSS 来源(遗物区 require:["BOSS"] / 75层等)可刷
        effect: { key: "effect_relic_copperCore", level: 1 }
    }
}

/**
 * 随机抽取若干不重复的遗物候选(遗物区三选一用)
 * 需求.md 2026-08-16: 追加来源过滤——limit 专属遗物仅对应来源(RL)可刷,
 * 与卡牌共用同一套 isTplEligible 匹配机制(交集/严格/看门人)
 * @param {number} [count=3] - 候选数量(不超过当前来源下可用遗物总数)
 * @param {Array<string>} [excludeKeys=[]] - 排除的遗物键(已拥有的遗物不会被重复抽取, 需求.md bug#3)
 * @param {Object} [opts]
 * @param {Array}  [opts.sources=[]]  - 当前环境来源列表(RL, 如 ["七咒"] / ["BOSS"])
 * @param {boolean}[opts.allowCommon=true] - 是否允许无 limit 遗物进入(默认 true)
 * @param {Array}  [opts.require=[]]  - 看门人: 候选遗物 limit 必须包含的来源(如 require:["BOSS"] 只出BOSS级遗物)
 * @returns {Array<{key, name, desc}>} 候选列表(含 key 便于获取)
 */
export function rollRelicCandidates(count = 3, excludeKeys = [], {sources = [], allowCommon = true, require = []} = {}) {
    // 排除已拥有 + 来源过滤(limit 专属遗物仅对应来源可刷, 需求.md 2026-08-16)
    const keys = Object.keys(relic_LIB).filter(k => !excludeKeys.includes(k))
        .filter(k => isTplEligible(relic_LIB[k], sources, {allowCommon, required: require}))
    const copy = [...keys]
    const picked = []
    // ⭐ 抽取数需在循环外固定: 循环内 copy.length 随 splice 递减,
    //   若 Math.min 写在循环条件里, count 大时循环会提前结束(历史 bug)
    const total = Math.min(count, copy.length)
    for (let i = 0; i < total; i++) {
        const idx = Math.floor(Math.random() * copy.length)
        picked.push(copy.splice(idx, 1)[0])
    }
    return picked.map(k => ({ key: k, ...relic_LIB[k] }))
}

/**
 * 获取一个遗物(挂永久效果 + 记录 relic 条目)
 * 同名遗物唯一: 已拥有则拒绝
 * 同 slot 唯一(需求.md 2026-08-13 系列遗物): slot 字段相同的旧遗物被替换(移除其效果与记录),
 *   新遗物顶替该槽位——如戒指槽(术石: 魔像之心/复苏之叶)
 * @param {Object} player - 玩家对象(原地修改: effect / relics / 属性)
 * @param {string} relicKey - relic_LIB 键名
 * @returns {boolean} 是否获取成功
 */
export function gainRelic(player, relicKey) {
    const r = relic_LIB[relicKey]
    if (!r || !player) return false
    if (!Array.isArray(player.relics)) player.relics = []
    if (player.relics.some(x => x.key === relicKey)) return false // 同名遗物唯一

    // 同 slot 替换: 移除旧遗物的效果与记录(术石等系列遗物——能且仅能装备 1 种)
    if (r.slot) {
        const oldIdx = player.relics.findIndex(x => {
            const old = relic_LIB[x.key]
            return old && old.slot === r.slot
        })
        if (oldIdx !== -1) {
            const oldRelic = player.relics[oldIdx]
            // 移除旧遗物挂在玩家身上的效果(按 effect key 匹配)
            if (oldRelic && Array.isArray(player.effect)) {
                for (let i = player.effect.length - 1; i >= 0; i--) {
                    const eff = player.effect[i]
                    const oldEntry = relic_LIB[oldRelic.key]
                    if (oldEntry && oldEntry.effect && eff.key === oldEntry.effect.key) {
                        player.effect.splice(i, 1)
                    }
                }
            }
            player.relics.splice(oldIdx, 1) // 替换记录(移除最早)
        }
    }

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
    player.relics.push({ key: relicKey, name: r.name, slot: r.slot || undefined })
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
