// pages/reward/relic.js
/**
 * ============================================================
 * 遗物区逻辑(与 reward.ux 同文件夹)
 * ============================================================
 * 三选一候选生成(排除已拥有; 需求.md bug#3——遗物不会被重复抽取)。
 */

import { rollRelicCandidates } from "../../common/data/relics.js"

/**
 * 生成遗物候选列表
 * @param {Object} playerInfo - 玩家对象(读 playerInfo.relics)
 * @param {number} [count=3] - 候选数量
 * @returns {Array} [{key, name, desc}]
 */
export function buildRelicCandidates(playerInfo, count = 3) {
    const owned = (playerInfo.relics || []).map(r => r.key)
    return rollRelicCandidates(count, owned)
}
