// pages/reward/upgrade.js
/**
 * ============================================================
 * 强化卡牌区域逻辑(与 reward.ux 同文件夹)
 * ============================================================
 * 从 reward.ux(篝火 cardUpgrade 选项)与 shop.ux(cardBoost 商品)中
 * 抽出的公共逻辑: "随机强化一张未强化卡; 全部已强化则随机一张 power+1 保底"。
 * 两处共用, 行为与重构前逐行一致。
 */

import { upgradeCard } from "../../common/data/cards.js"

/**
 * 随机强化一张卡(杀戮尖塔化一次性强化)
 * @param {Array} pool - 卡牌池(原地修改)
 * @returns {Object|null} null=牌库为空(调用方提示); 否则 {name, mode}
 *   mode: "upgraded"=走 upgradeCard 正式强化 / "boost"=全部已强化, power+1 保底
 */
export function upgradeRandomCard(pool) {
    if (!pool || pool.length === 0) return null

    // 优先强化未强化卡; 全部已强化则随机一张 power+1 保底
    const upgradable = pool.filter(c => c.upgraded !== true)
    if (upgradable.length > 0) {
        const card = upgradable[Math.floor(Math.random() * upgradable.length)]
        upgradeCard(card)
        return { name: card.name, mode: "upgraded" }
    }
    const card = pool[Math.floor(Math.random() * pool.length)]
    card.power = (card.power || 0) + 1
    return { name: card.name, mode: "boost" }
}
