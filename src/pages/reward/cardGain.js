// pages/reward/cardGain.js
/**
 * ============================================================
 * "获得卡牌"区域逻辑(与 reward.ux 同文件夹)
 * ============================================================
 * 从 reward.ux 的 onInit 抽卡分支抽出:
 *   稀有度权重池 + 30% 直接强化版 + BOSS/限定卡三选一。
 * 行为与重构前逐行一致。
 */

import { createCard, createCardByRare } from "../../common/data/cards.js"
import { weightedPick } from "../../common/core/core_utils.js"

/** 稀有度权重池(区间法: 基于总权重10随机落点; 尖塔化微调: 普通略多) */
export const rareWeights = [
    {rare: 1, weight: 6},
    {rare: 2, weight: 3},
    {rare: 3, weight: 1}
]

/** 奖励卡牌直接出"强化版"的概率(杀戮尖塔化: 无限升级已删, 奖励里偶尔直接给 +) */
export const upgradedChance = 0.3

/**
 * 生成三选一奖励卡牌
 * @param {Object} p
 * @param {boolean} p.isBoss      - BOSS 战奖励(isBoss 标记, 来自节点 exDate)
 * @param {Array}  [p.limitedCards] - 限定卡列表(数据驱动, exDate.limitedCards)
 * @param {number} p.rewardLevel       - 奖励等级(仅用于经济, 不传给卡牌 level)
 * @param {Function} [p.rng]      - 随机源注入(默认 Math.random; 仅强化版掷骰用)
 * @returns {Array} 3 张卡牌
 */
export function buildRewardCards({isBoss, limitedCards = [], rewardLevel, rng = Math.random}) {
    // 2026-08-15 level隐藏方案: 卡牌 level 仅由强化状态决定(未强化=1, 强化版 upgrade 时 +1),
    // rewardLevel 不再透传给卡牌——困难战斗不会因此拿到 level:3 的卡
    const cards = []
    for (let i = 0; i < 3; i++) {
        let card
        if (isBoss) {
            if (limitedCards.length > 0) {
                // 限定 BOSS 奖励(数据驱动, exDate.limitedCards): 混合三选一——
                //   选项0: 限定卡(仅本层可得) / 选项1~2: rare3 必强化
                if (i === 0) {
                    card = createCard(limitedCards[0], {level: 1})
                } else {
                    card = createCardByRare(3, {level: 1, upgraded: true})
                }
            } else {
                // 其他 BOSS 专属奖励: 从全部 rare:"boss" 的卡池抽取, 必为强化版
                card = createCardByRare("boss", {level: 1, upgraded: true})
            }
        } else {
            const rare = weightedPick(rareWeights, (item) => item.weight).rare
            card = createCardByRare(rare, {
                level: 1,
                upgraded: rng() < upgradedChance
            })
        }
        if (!card) {
            // 降级保护
            card = createCard("斩击", {level: 1})
        }
        cards.push(card)
    }
    return cards
}
