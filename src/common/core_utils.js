// common/core_utils.js
/**
 * 纯工具函数(无任何依赖, 可安全在任意环境使用)
 */

/**
 * 随机字符串生成器, 用于生成卡牌/实体唯一 UID
 * @returns {string} 随机UID
 */
export function generateUid() {
    const timestamp = Date.now().toString(36)
    const randomPart = Math.random().toString(36).slice(2, 8)
    return timestamp + randomPart
}

/**
 * 延时等待
 * @param {number} ms - 毫秒
 * @returns {Promise<void>}
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 加权随机抽取(区间法): 基于总权重生成一个随机落点, 落在哪个区间就选哪个
 * 相比"权重展开成数组再随机索引", 支持任意正数权重(小数/大数), 且不产生中间数组
 * @param {Array} list - 候选列表
 * @param {Function} getWeight - (item) => number, 返回该项权重(需 > 0; 全 0 时退化为等概率)
 * @returns {*} 被选中的项; 列表为空返回 undefined
 */
export function weightedPick(list, getWeight) {
    if (!list || list.length === 0) return undefined

    const total = list.reduce((sum, item) => sum + (getWeight(item) || 0), 0)
    if (total <= 0) {
        // 权重全 0/缺失: 退化为等概率随机
        return list[Math.floor(Math.random() * list.length)]
    }

    let r = Math.random() * total // 随机落点: [0, 总权重)
    for (const item of list) {
        r -= getWeight(item) || 0
        if (r < 0) return item // 落入该项的区间
    }
    return list[list.length - 1] // 浮点精度兜底
}
