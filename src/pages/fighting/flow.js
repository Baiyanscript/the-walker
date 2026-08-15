// pages/fighting/flow.js
/**
 * ============================================================
 * 战斗流程纯逻辑层(从 fighting.ux 抽出, 与页面同文件夹)
 * ============================================================
 * 职责: 战斗页中"非界面"的流程逻辑 —— 抽卡 / 召唤 / 死亡结算 / 胜负判定。
 *
 * 设计约定:
 *   1. 本模块不 import 任何页面, 不触碰 this; 页面状态一律通过参数注入,
 *      页面行为(跳转/提示/召唤回调)通过回调(onPlayerLose / onWinCheck / onShuffle…)注入;
 *   2. fireEffect(触发器分发)属于 core 层能力, 本模块可直接调用;
 *      页面(界面代码区)同样可以自行调用 fireEffect —— 两处共用同一套 trigger 语义;
 *   3. 数值修改只经 core_basics.js(金币掉落走 changeGold)。
 *
 * 行为与重构前 fighting.ux 内联实现逐行一致(回归要求), 仅调整了调用形态。
 */

import { createCard } from "../../common/data/cards.js"
import { createMob, createMobByRare } from "../../common/data/mobs.js"
import { refillDrawPool } from "../../common/core/core_draw.js"
import { fireEffect } from "../../common/core/core_effect.js"
import { changeGold } from "../../common/core/core_basics.js"

/**
 * 抽卡(杀戮尖塔化: 弃牌堆洗回机制)
 * 尖塔规则: 抽牌堆空 -> 弃牌堆随机洗回再抽; 双堆全空 -> 抽牌无效。
 * 本项目降级保留原"牌库已空"保底卡(仅双堆全空且手牌未满时), 防 0 牌库死局。
 * @param {Object} p
 * @param {Object} p.playerInfo - 玩家对象(读 maxHoldCard / getCardNum)
 * @param {Array}  p.handPool       - 当前手牌(原地修改)
 * @param {Array}  p.battlePool       - 战斗内抽牌堆(原地修改)
 * @param {Array}  p.discardPool    - 弃牌堆(原地修改)
 * @param {number} [p.mobLevel] - 怪物等级(保留, 保底卡已固定 level 1)
 * @param {Function} [p.onShuffle] - 洗牌回调: 弃牌堆洗回抽牌堆时调用(页面在此 fireEffect when_shuffle)
 * @returns {number} 实际抽到的张数
 */
export function gacha({ playerInfo, handPool, battlePool, discardPool, mobLevel, onShuffle }) {
    const info = playerInfo
    const freeSlots = info.maxHoldCard - handPool.length

    let drawCount = Math.min(info.getCardNum, freeSlots)
    // 双堆全空 + 手牌未满: 至少补一张保底卡(原"牌库已空"机制降级保留)
    // 需求.md 2026-08-13: 仅在"抽牌开始时双堆全空"才补——中途抽空视为尖塔"抽牌无效", 不再补
    if (battlePool.length === 0 && discardPool.length === 0 && freeSlots > 0) {
        drawCount = Math.max(drawCount, 1)
    }
    if (drawCount <= 0) {
        return 0
    }

    let drawn = 0
    for (let i = 0; i < drawCount; i++) {
        let card
        // 抽牌堆空: 弃牌堆随机洗回抽牌堆(尖塔核心规则——打出/弃掉的牌循环回归)
        if (battlePool.length === 0) {
            if (refillDrawPool(battlePool, discardPool)) {
                // 洗牌回调(页面在此 fireEffect when_shuffle: 遗物·日晷等监听)
                if (typeof onShuffle === "function") onShuffle()
            }
        }
        if (battlePool.length > 0) {
            // 从牌库随机选取一个索引并取出
            const randomIndex = Math.floor(Math.random() * battlePool.length)
            card = battlePool.splice(randomIndex, 1)[0]
        } else if (drawn === 0) {
            // 双堆全空(当且仅当此时): 保底卡(尖塔中此处"抽牌无效", 本游戏保留防死局)
            // 需求.md 2026-08-13: 仅双堆全空才生成本卡, 且整轮只补一张——
            //   生成后 break, 后续循环即使仍双堆全空也不再补(防一次性抽一摞"牌库已空")
            // 2026-08-15 level隐藏方案: level 固定 1, 不再随 mobLevel 涨
            card = createCard("斩击", {
                level: 1,
                name: "牌库已空"
            })
            if (card) {
                card.exhaust = true // 打出即销毁, 不进弃牌堆(销毁诅咒语义)
                card.isFallback = true // 回合末未打出也直接销毁, 不进弃牌堆循环
                handPool.push(card)
                drawn++
            }
            break // 保底卡只补一张
        } else {
            break // 双堆全空但本轮已抽过牌: 不再补保底卡, 剩余抽数作废(尖塔: 抽牌无效)
        }
        if (card) {
            handPool.push(card)
            drawn++
        }
    }
    return drawn
}

/**
 * 召唤一波怪物(纯创建, 不修改页面状态)
 * @param {Object} waveObj - 波次配置对象 {addMob?, totalRare?, numOfMob?}
 * @param {number} [mobLevel] - 怪物等级(随机怪的 level)
 * @param {string|Object|Array} [nextAct] - 初始 nextSkill(createMob 时传入)
 * @returns {Array} 新生成的怪物数组(由调用方 concat 进怪物池)
 */
export function summonMob(waveObj, mobLevel, nextAct = undefined) {
    if (!waveObj || typeof waveObj !== "object") {
        console.warn("[summonMob] 无效的波次配置")
        return []
    }

    const {addMob, totalRare, numOfMob} = waveObj
    const totalRareValid = typeof totalRare === "number" && totalRare >= 1 ? totalRare : 3
    let numOfMobValid = typeof numOfMob === "number" && numOfMob >= 0 ? numOfMob : 0
    numOfMobValid = Math.min(numOfMobValid, 20)
    const level = mobLevel ?? 1

    const mobs = []

    // 随机生成
    for (let i = 0; i < numOfMobValid; i++) {
        let mob = null
        // 最多尝试 3 次, 避免因池为空无限循环
        for (let attempt = 0; attempt < 3; attempt++) {
            const rare = Math.floor(Math.random() * totalRareValid) + 1
            mob = createMobByRare(rare, {level, nextSkill: nextAct})
            if (mob) break
        }
        // 保底: 尝试 3 次都失败则降级到稀有度 1
        if (!mob) {
            mob = createMobByRare(1, {level})
        }
        if (mob) mobs.push(mob)
    }

    // 手动追加
    const addList = Array.isArray(addMob) ? addMob : addMob ? [addMob] : []
    for (const item of addList) {
        let key,
            detail = {}
        if (typeof item === "string") {
            key = item
        } else if (item !== null && typeof item === "object" && item.key) {
            key = item.key
            detail = item.detail || {}
        } else {
            console.warn("[summonMob] addMob 项格式错误, 跳过:", item)
            continue
        }
        if (key) {
            const mob = createMob(key, detail)
            if (mob) mobs.push(mob)
        }
    }

    return mobs
}

/**
 * 单独检测一个怪物是否死亡。
 * 死亡则触发其 when_death 效果、结算通用金币掉落并从怪物池移除, 返回是否死亡。
 * 供 cleanDeath 批量清扫复用, 也供战斗流程"精确处死"单个目标
 * (如自爆/处决类技能需要立即结算某个怪的死亡效果)。
 * @param {Object} mob - 要检测的怪物
 * @param {Object} p
 * @param {Array}  p.mobPool   - 当前怪物组(原地修改)
 * @param {Object} p.playerInfo - 玩家对象(通用掉落金币)
 * @param {Array}  [p.handPool]  - 手牌(注入 when_death, 蕴含卡牌等效果用)
 * @param {Array}  [p.discardPool] - 弃牌堆(同上)
 * @param {Array}  [p.battlePool]  - 战斗内抽牌堆(同上)
 * @param {Array}  [p.drawPool]    - 存档牌库(同上)
 * @returns {boolean} 是否死亡(且已触发死亡效果并移除)
 */
export function checkMobDeath(mob, {mobPool, playerInfo, handPool, discardPool, battlePool, drawPool}) {
    if (!mob || mob.HP > 0) return false

    fireEffect({
        trigger: "when_death",
        targets: mob,
        mobList: mobPool,
        playerInfo,
        // 注入牌池(蕴含卡牌等效果释放卡/拿卡需要, 与玩家侧 when_death 一致)
        handPool,
        discardPool,
        battlePool,
        drawPool
    })

    // 通用掉落: 所有怪死亡都给玩家 rare*level*2 金币
    // (rare 可能为非数字字符串如 "BOSS", 按 1 计, 防 NaN)
    // (特殊怪如黄金史莱姆另有 effect_goldDrop 大额爆金)
    if (playerInfo) {
        const rareNum = typeof mob.rare === "number" ? mob.rare : 1
        changeGold(playerInfo, rareNum * (mob.level || 1) * 2)
    }

    // 用 indexOf 而非遍历索引, 兼容 when_death 效果向 mobList push 新怪的情况
    const idx = mobPool.indexOf(mob)
    if (idx !== -1) {
        mobPool.splice(idx, 1)
    }
    return true
}

/**
 * 批量处理死亡单位(对每个怪物复用 checkMobDeath, 再处理玩家死亡)。
 * 玩家死亡时触发其 when_death(恩赐类效果可能在此时救回玩家), 仍未救回则回调 onPlayerLose;
 * 最后无条件回调 onWinCheck(与重构前 fighting.ux 的 cleanDeath -> isWin 顺序一致)。
 * @param {Object} p
 * @param {Array}  p.mobPool      - 当前怪物组(原地修改)
 * @param {Object} p.playerInfo   - 玩家对象
 * @param {Array}  [p.handPool]   - 手牌(注入 when_death: 死亡返还类效果用)
 * @param {Array}  [p.discardPool]- 弃牌堆(注入 when_death: 防卡复制)
 * @param {Array}  [p.battlePool] - 战斗内抽牌堆(怪物 when_death 用)
 * @param {Array}  [p.drawPool]   - 存档牌库(怪物 when_death 用)
 * @param {Function} [p.onPlayerLose] - 玩家确认死亡回调(页面在此跳失败页)
 * @param {Function} [p.onWinCheck]   - 死亡结算后的胜负检查回调(页面在此判下一波/胜利)
 */
export function cleanDeath({mobPool, playerInfo, handPool, discardPool, battlePool, drawPool, onPlayerLose, onWinCheck}) {
    for (let i = mobPool.length - 1; i >= 0; i--) {
        checkMobDeath(mobPool[i], {mobPool, playerInfo, handPool, discardPool, battlePool, drawPool})
    }

    if (playerInfo.HP <= 0) {
        fireEffect({
            trigger: "when_death",
            targets: playerInfo,
            mobList: mobPool,
            playerInfo,
            handPool, // 注入手牌: 供"死亡返还"类效果把卡回归手中
            discardPool // 注入弃牌堆: 防卡复制(同 effect_return)
        })
        // 恩赐类效果可能在 when_death 中救回玩家(如不死图腾), 复查一次再判负
        if (playerInfo.HP <= 0 && typeof onPlayerLose === "function") {
            onPlayerLose()
        }
    }
    if (typeof onWinCheck === "function") {
        onWinCheck()
    }
}

/**
 * 测试是否下一波或者胜利者。
 * @param {Array} mobPool   - 当前怪物组(非空则无事发生)
 * @param {number} currWave - 当前波次索引
 * @param {Array} waves     - 全部波次配置
 * @param {Object} p
 * @param {Function} p.onSummonWave - 有下一波时回调(参数 = 下一波索引, 页面在此召唤+提示)
 * @param {Function} p.onWin        - 全部波次结束回调(页面在此结算胜利)
 */
export function isWin(mobPool, currWave, waves, {onSummonWave, onWin}) {
    if (mobPool.length > 0) return

    const nextWaveIndex = currWave + 1
    if (nextWaveIndex < waves.length) {
        if (typeof onSummonWave === "function") onSummonWave(nextWaveIndex)
    } else {
        // 所有波次结束 → 胜利
        if (typeof onWin === "function") onWin()
    }
}
