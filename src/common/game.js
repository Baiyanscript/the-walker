// common/game.js
/**
 * ============================================================
 * 存档服务: 玩家的存取档
 * ============================================================
 * 存档位约定:
 *   playerInfo_0  / playCardPool_0  —— 自动存档
 *   playerInfo_1~10 / playCardPool_1~10 —— 手动存档位(10 个)
 */

import { storageWrite, storageRead } from "./storage.js"

/**
 * 加载所有存档位的玩家信息(0 ~ 10), 按索引顺序返回数组
 * @param {string} type - storageRead 的类型参数, 默认 'obj'
 * @returns {Promise<Array>} 长度为 11 的数组
 *   - 每个元素是该存档位的 playerInfo 对象
 *   - 如果该存档位不存在或为空, 则返回空对象 {}
 */
export async function loadAllPlayerInfos(type = 'obj') {
    const results = []

    for (let i = 0; i <= 10; i++) {
        const key = `playerInfo_${i}`
        try {
            // storageRead 在 key 不存在时会返回默认值(对于 'obj' 类型返回 {})
            const data = await storageRead(key, type)
            results.push(data)
        } catch (e) {
            console.warn(`[loadAllPlayerInfos] 读取 ${key} 失败:`, e)
            // 发生异常时也 push 一个空对象, 保持数组顺序和长度
            results.push({})
        }
    }

    return results
}

/**
 * 保存当前进度到自动存档(索引0)
 * @param {Object} player - 玩家对象(会被写入 saveDate 字段)
 * @param {Array} [card]  - 卡牌池, 可选
 * @returns {Promise<void>}
 */
export async function saveForAuto(player, card = undefined) {
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const timeStr = `${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
    player.saveDate = timeStr

    await storageWrite('playerInfo_0', player)
    if (card) {
        await storageWrite('playCardPool_0', card)
    }
}
