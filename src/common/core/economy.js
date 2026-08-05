// common/core/economy.js
/**
 * ============================================================
 * 经济规则: 回收价 / 商店价的统一公式
 * ============================================================
 * 回收区与商店共用同一套定价, 形成"回收 -> 商店"的经济闭环:
 *   回收价 = 关卡等级 × 卡牌等级 × 稀有度(卡牌创建时丢失 rare 则取固定 2)
 *   商店价 = 回收价 × 1.5(向上取整)
 */

/**
 * 计算一张卡的"理论回收价"
 * @param {number} level - 关卡等级(rlevel)
 * @param {Object} card  - 卡牌实例(需含 level; 若有 rare 字段则按其稀有度计价)
 * @returns {number} 回收金币数
 */
export function calcRecycleGain(level, card) {
    const rare = typeof card.rare === 'number' ? card.rare : 2 // 创建时丢失则取固定 2
    return level * (card.level || 1) * rare
}

/**
 * 计算一张卡的"商店售价"(= 回收价 × 1.5, 向上取整)
 * @param {number} level - 关卡等级(rlevel)
 * @param {Object} card  - 卡牌实例
 * @returns {number} 售价
 */
export function calcShopPrice(level, card) {
    return Math.ceil(calcRecycleGain(level, card) * 1.5)
}
