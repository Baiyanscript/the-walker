// pages/reward/shop.js
/**
 * ============================================================
 * 商店区域逻辑(与 reward.ux 同文件夹, 2026-08-14 自 shop.ux 合并)
 * ============================================================
 * 商品生成(卡牌 + 奖励类型 + 遗物商品)。行为与 shop.ux 逐行一致;
 * 购买交互(sold/金币校验/toast)留在 reward.ux 页面代码区。
 * 定价公式在 core/core_economy.js; cardBoost 强化复用 ./upgrade.js。
 */

import { createCardByRare, createCard } from "../../common/data/cards.js"
import { calcShopPrice } from "../../common/core/core_economy.js"
import { weightedPick } from "../../common/core/core_utils.js"
import { rollRelicCandidates, gainRelic } from "../../common/data/relics.js"
import { getCardDetail } from "../../common/skill/fun_details.js"
import { upgradeRandomCard } from "./upgrade.js"

/** 商店卡牌商品稀有度权重(与"获得卡牌"区的 rareWeights 不同权重, 各自维护) */
const shopRareWeights = [
    {rare: 1, weight: 5},
    {rare: 2, weight: 3},
    {rare: 3, weight: 1}
]

/**
 * 生成商店商品 —— 卡牌 + 奖励类型混合(数量可调)
 *   卡牌商品  : 稀有度加权随机生成, 价格 = 公共商店公式(回收价 × 1.5)
 *   奖励商品  : 随机抽取奖励类型(提升AP/提升生命/卡强化), 价格 = rewardLevel * 3
 *   遗物商品  : 随机抽取, 排除已拥有, 价格 = rewardLevel * 5(已集齐全部遗物则不生成)
 * 商品 = {type, key?, name, desc, price, sold, apply(player, pool)}
 * @param {Object} p
 * @param {Object} p.playerInfo - 玩家对象(读 relics / goldNum)
 * @param {number} p.rewardLevel     - 奖励等级
 * @param {Function} [p.rng]    - 随机源注入(默认 Math.random)
 * @returns {Array} 商品列表
 */
export function generateShopGoods({playerInfo, rewardLevel, rng = Math.random}) {
    const goods = []
    const rl = rewardLevel || 1

    // 卡牌商品: 3 件(稀有度加权, 区间法: 基于总权重9随机落点)
    // 2026-08-15 level隐藏方案: 卡牌 level 固定 1(仅由强化决定), rewardLevel 只用于定价
    for (let i = 0; i < 3; i++) {
        const rare = weightedPick(shopRareWeights, (r) => r.weight).rare
        const card = createCardByRare(rare, {level: 1}) || createCard("斩击", {level: 1})
        goods.push(makeCardGoods(card, rl))
    }

    // 奖励类型商品: 1 件(可重复)
    const rewardTypes = ["maxAPUp", "maxHPUp", "cardBoost"]
    const key = rewardTypes[Math.floor(rng() * rewardTypes.length)]
    goods.push(makeRewardGoods(key, rl * 3, rl))

    // 遗物商品: 1 件(已集齐全部遗物则不生成)
    const relicGoods = makeRelicGoods(playerInfo, rl * 5)
    if (relicGoods) goods.push(relicGoods)

    return goods
}

/** 卡牌商品: 售价 = 公共商店公式(回收价 × 1.5); 暴露 card 字段供详情页使用 */
function makeCardGoods(card, rewardLevel) {
    return {
        type: "card",
        card, // 超级详情页入口数据
        name: card.name,
        desc: getCardDetail(card),
        price: calcShopPrice(rewardLevel, card),
        sold: false,
        apply(player, pool) {
            pool.push(card)
        }
    }
}

/** 构造一个奖励类型商品(强化数值比篝火更强) */
function makeRewardGoods(key, price, rewardLevel) {
    if (key === "maxAPUp") {
        return {
            type: "reward", key, name: "行动力强化",
            desc: `最大行动力 +${rewardLevel}`,
            price, sold: false,
            apply(player) {
                player.maxAP = (player.maxAP || 0) + rewardLevel
            }
        }
    }

    if (key === "maxHPUp") {
        return {
            type: "reward", key, name: "生命上限强化",
            desc: `最大生命 +${rewardLevel * 20}, 回复全部生命`,
            price, sold: false,
            apply(player) {
                player.maxHP = (player.maxHP || 0) + rewardLevel * 20
                player.HP = player.maxHP
            }
        }
    }

    // cardBoost: 随机一张未强化卡强化(杀戮尖塔化); 全部已强化则随机一张 power+1 保底
    return {
        type: "reward", key, name: "卡牌强化",
        desc: `随机一张未强化卡牌强化一次`,
        price, sold: false,
        apply(player, pool) {
            upgradeRandomCard(pool) // 牌库为空时静默(与原实现一致)
        }
    }
}

/** 构造一个遗物商品: 随机抽取, 排除已拥有(需求.md bug#3), 全部集齐返回 null */
function makeRelicGoods(playerInfo, price) {
    const owned = (playerInfo.relics || []).map(r => r.key)
    const relic = rollRelicCandidates(1, owned)[0]
    if (!relic) return null // 已集齐全部遗物
    return {
        type: "relic", key: relic.key, name: "遗物·" + relic.name,
        desc: relic.desc,
        price, sold: false,
        apply(player) {
            gainRelic(player, relic.key)
        }
    }
}
