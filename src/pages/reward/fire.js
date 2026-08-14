// pages/reward/fire.js
/**
 * ============================================================
 * 篝火区域逻辑(与 reward.ux 同文件夹)
 * ============================================================
 * 从 reward.ux 的 fire() 抽出: 满血/非满血分支 + 随机强化选项(正态分布增量)。
 * 行为与重构前逐行一致; 随机数经 rng 注入, 便于测试。
 */

import { changeHP } from "../../common/core/core_basics.js"
import { upgradeRandomCard } from "./upgrade.js"

/**
 * 生成正态分布随机数(Box-Muller 变换)
 * @param {number} mean - 均值
 * @param {number} stddev - 标准差
 * @param {Function} rng - 均匀随机源(默认 Math.random)
 */
export function normalRandom(mean = 0, stddev = 1, rng = Math.random) {
    let u = 0,
        v = 0
    while (u === 0) u = rng()
    while (v === 0) v = rng()
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
    return mean + stddev * z
}

/**
 * 篝火结算(原地修改 playerInfo / playCardPool)
 * @param {Object} p
 * @param {Object} p.playerInfo    - 玩家对象(HP/maxHP/maxAP/maxHoldCard 原地修改)
 * @param {Array}  p.playCardPool  - 卡牌池(cardUpgrade 选项时原地修改)
 * @param {number} p.rlevel        - 奖励等级
 * @param {boolean} p.enteredFullHP - 进入时是否满血/溢血
 * @param {Function} [p.rng]       - 随机源注入(默认 Math.random)
 * @returns {Object} { log } - 提示文案
 */
export function rollCampfire({ playerInfo, playCardPool, rlevel, enteredFullHP, rng = Math.random }) {
    const fullHP = enteredFullHP

    // 1. 生命处理
    let log
    if (fullHP) {
        playerInfo.maxHP += rlevel * 10
        playerInfo.HP = playerInfo.maxHP
        log = `生命已恢复满 (上限 +${rlevel * 10})。`
    } else {
        const heal = Math.ceil((playerInfo.maxHP || 0) * 0.60)
        changeHP(playerInfo, heal, {cap: playerInfo.maxHP}) // 最多恢复到满血
        log = `恢复 ${heal} 点生命(上限60%), 未提升上限。`
    }

    // 2. 正态分布参数: 满血均值 = rlevel/2; 非满血均值 = rlevel-1(强化打折, 允许落空)
    const mu = fullHP ? rlevel / 2 : Math.max(0, rlevel - 1)
    const sigma = Math.max(1, mu / 2)

    // 生成增量: 满血至少 +1; 非满血允许 0(强化落空)
    const randomIncrement = () => {
        let val = Math.round(normalRandom(mu, sigma, rng))
        return fullHP ? Math.max(1, val) : Math.max(0, val)
    }

    // 3. 强化选项权重配置
    //    (杀戮尖塔化: 原 cardLevelUp/cardPowerUp 合并为 cardUpgrade——一次性强化, 见 upgradeCard)
    //    (需求.md bug#2: 删除 drawCountUp——单次抽卡数提升不再作为篝火强化项)
    const options = [
        {type: "cardUpgrade", weight: 4},
        {type: "maxAPUp", weight: 2},
        {type: "maxHoldCardUp", weight: 2}
    ]

    // 构建权重池
    let pool = []
    options.forEach((opt) => {
        for (let i = 0; i < opt.weight; i++) pool.push(opt.type)
    })
    const chosen = pool[Math.floor(rng() * pool.length)]

    // 4. 执行强化(属性类强化独立计算增量, 非满血时 inc 可能为 0 = 强化落空)
    if (chosen === "cardUpgrade") {
        const r = upgradeRandomCard(playCardPool)
        if (r === null) {
            log += " 牌库为空, 无法强化卡牌。"
        } else if (r.mode === "upgraded") {
            log += ` ${r.name} 强化完成`
        } else {
            log += ` 卡牌均已强化, ${r.name} 威力+1`
        }
    } else if (chosen === "maxAPUp") {
        const inc = randomIncrement()
        playerInfo.maxAP = (playerInfo.maxAP || 0) + inc
        log += inc > 0 ? ` 最大行动点 +${inc} (现 ${playerInfo.maxAP})` : " 本次未获得强化。"
    } else if (chosen === "maxHoldCardUp") {
        const inc = randomIncrement()
        playerInfo.maxHoldCard = (playerInfo.maxHoldCard || 5) + inc
        log += inc > 0 ? ` 最大持卡数 +${inc} (现 ${playerInfo.maxHoldCard})` : " 本次未获得强化。"
    }

    return {log}
}
