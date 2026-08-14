// pages/reward/fusion.js
/**
 * ============================================================
 * 融合区逻辑(与 reward.ux 同文件夹)
 * ============================================================
 * 从 reward.ux 的融合区抽出的纯逻辑(可单测):
 *   抽素材(A、B) -> 计算融合卡 -> 销毁素材。
 * 行为与重构前逐行一致; 融合概率的随机数经 rng 注入, 便于测试。
 */

import { createCard } from "../../common/data/cards.js"
import { generateUid } from "../../common/core/core_utils.js"

/**
 * 随机抽取两张融合素材(保留原始索引供销毁)。
 * 牌库不足 2 张时, 用"牌库已空"临时卡补齐, 以 poolIndex=-1 标记(不可销毁)。
 * @param {Array} pool - 卡牌池(只读)
 * @returns {Array} [{card, poolIndex}] 长度恒为 2
 */
export function drawMaterials(pool) {
    const materials = []
    if (pool.length > 0) {
        // Fisher-Yates 洗牌取前 2(保留原始索引供销毁)
        const shuffled = pool.map((card, poolIndex) => ({card, poolIndex}))
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            const tmp = shuffled[i]
            shuffled[i] = shuffled[j]
            shuffled[j] = tmp
        }
        materials.push(...shuffled.slice(0, Math.min(2, pool.length)))
    }
    while (materials.length < 2) {
        materials.push({
            card: createCard("斩击", {level: 1, name: "牌库已空"}),
            poolIndex: -1
        })
    }
    return materials
}

/**
 * 融合计算: 按 power -> level -> costAP 顺序逐参数独立抽取(good/bad)
 * good 概率 = min(50 + rlevel*5, 95), 越高 rlevel 越容易出好参数
 * good = 取更优(power/level 取高, costAP 取低); bad = 取较差
 * 技能组去重合并; 融合卡 rare=0 作为融合惩罚(回收价值归零)
 * @param {Object} A - 素材 A
 * @param {Object} B - 素材 B
 * @param {number} rlevel - 奖励等级
 * @param {Function} [rng] - 随机源注入(默认 Math.random)
 * @returns {Object} 融合卡(全新 uid, 名字"融合卡")
 */
export function computeFusion(A, B, rlevel, rng = Math.random) {
    const goodRate = Math.min(50 + (rlevel || 1) * 5, 95)
    const roll = () => rng() * 100 < goodRate
    const pickBetter = (a, b) => (roll() ? Math.max(a, b) : Math.min(a, b))
    const pickBetterCost = (a, b) => (roll() ? Math.min(a, b) : Math.max(a, b))

    const fPower = pickBetter(A.power || 0, B.power || 0)
    const fLevel = pickBetter(A.level || 1, B.level || 1)
    const fCost = pickBetterCost(A.costAP || 1, B.costAP || 1)

    // 技能组去重合并
    const doSkill = []
    for (const s of [...(A.doSkill || []), ...(B.doSkill || [])]) {
        if (!doSkill.includes(s)) doSkill.push(s)
    }

    return {
        uid: generateUid(),
        name: "融合卡",
        level: fLevel,
        power: fPower,
        costAP: fCost,
        doSkill,
        rare: 0
    }
}

/**
 * 销毁素材: 按原索引从大到小 splice; 临时"牌库已空"卡(poolIndex=-1)跳过, 防止报错
 * @param {Array} pool - 卡牌池(原地修改)
 * @param {Array} materials - drawMaterials 的返回值
 */
export function consumeMaterials(pool, materials) {
    const toDelete = materials
        .map((x) => x.poolIndex)
        .filter((i) => i >= 0)
        .sort((a, b) => b - a)
    for (const i of toDelete) {
        pool.splice(i, 1)
    }
}
