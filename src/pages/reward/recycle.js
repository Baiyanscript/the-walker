// pages/reward/recycle.js
/**
 * ============================================================
 * 回收卡牌区域逻辑(与 reward.ux 同文件夹)
 * ============================================================
 * 回收数量上限 + 单卡回收展示文本(定价公式在 core/core_economy.js)。
 */

import { calcRecycleGain } from "../../common/core/core_economy.js"

export { calcRecycleGain }

/**
 * 本区域可回收张数 = 向上取整(关卡等级/2)
 * @param {number} rewardLevel - 奖励等级
 * @returns {number}
 */
export function calcRecycleNum(rewardLevel) {
    return Math.ceil((rewardLevel || 1) / 2)
}

/**
 * 单张卡的回收展示文本
 * @param {number} rewardLevel - 奖励等级
 * @param {Object} card - 卡牌实例
 * @returns {string}
 */
export function recycleGainTxt(rewardLevel, card) {
    return `回收: ${calcRecycleGain(rewardLevel || 1, card)} 金币`
}
