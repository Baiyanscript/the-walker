// common/core_draw.js
/**
 * ============================================================
 * 牌堆机制(杀戮尖塔化, 2026-08-12)
 * ============================================================
 * 对照杀戮尖塔官方规则(灰机 wiki《游戏机制》)落地:
 *   1. 打出的牌 -> 弃牌堆(带消耗词条的牌 -> 消耗堆/直接移除, 见卡牌 exhaust 标记)
 *   2. 回合结束时, 所有手牌 -> 弃牌堆
 *   3. 抽牌时若抽牌堆为空, 弃牌堆以随机顺序洗回抽牌堆, 再继续抽
 *   4. 弃牌堆也为空时抽牌无效(本项目保留"牌库已空"保底卡防 0 牌库死局, 见 fighting.ux)
 *
 * 本文件只含纯函数(不依赖页面状态), 便于测试与复用。
 */

/**
 * 洗牌(Fisher-Yates): 原地随机打乱数组
 * @param {Array} arr - 要打乱的数组(原地修改)
 * @returns {Array} 打乱后的同一引用
 */
export function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const tmp = arr[i]
        arr[i] = arr[j]
        arr[j] = tmp
    }
    return arr
}

/**
 * 抽牌堆补牌(尖塔洗牌规则): 抽牌堆为空时, 把弃牌堆随机洗回抽牌堆。
 * 抽牌堆非空则不做任何事。
 * @param {Array} drawPool - 抽牌堆(原地修改)
 * @param {Array} discardPool - 弃牌堆(原地清空)
 * @returns {boolean} 是否发生了洗牌
 */
export function refillDrawPool(drawPool, discardPool) {
    if (!Array.isArray(drawPool) || !Array.isArray(discardPool)) return false
    if (drawPool.length > 0 || discardPool.length === 0) return false
    while (discardPool.length > 0) {
        drawPool.push(discardPool.pop())
    }
    shuffleArray(drawPool)
    return true
}

/**
 * 回合结束: 手牌全部放入弃牌堆(尖塔规则)。
 * 消耗卡(exhaust=true)不回弃牌堆——由调用方(useCard)在打出时拦截,
 * 手牌回收不涉及消耗判断(手牌中不应存在已消耗的卡)。
 * @param {Array} handPool - 手牌(原地清空)
 * @param {Array} discardPool - 弃牌堆(原地追加)
 * @returns {number} 回收的卡牌数
 */
export function recycleHandToDiscard(handPool, discardPool) {
    if (!Array.isArray(handPool) || !Array.isArray(discardPool)) return 0
    let count = 0
    while (handPool.length > 0) {
        discardPool.push(handPool.pop())
        count++
    }
    return count
}
