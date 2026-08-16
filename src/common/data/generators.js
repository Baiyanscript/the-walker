// common/data/generators.js
/**
 * ============================================================
 * 奖励/地图生成器库: generators 查表 + getGenerator 提取回退
 * ============================================================
 * ⭐ 仿 skill_LIB + runSkill 模式(需求.md 2026-08-16):
 *   每个"奖励类型/地图"对应一个可替换的生成器, 玩家通过
 *   playerInfo.map 字段声明使用哪个生成器(如 typeOfMap:"map_七咒"),
 *   页面进入 reward/map 时按声明提取并执行; 任何问题回退 common。
 *
 * 玩家 map 字段(可选, 未定义即回退默认):
 *   { typeOfMap:"map_七咒", fire:"fire_七咒", shop:"shop_七咒", ... }
 *   - typeOfMap: 随机地图生成器键(固定脚本层不经过生成器, 见下)
 *   - fire     : 篝火结算生成器键
 *   - powerUp  : 强化卡牌生成器键
 *   - mix      : 融合卡牌生成器键
 *   - shop     : 商店商品生成器键(对象形态: 多个子函数)
 *   - cardGain : 获得卡牌生成器键
 *   - recycle  : 回收卡牌生成器键
 *   - relic    : 遗物候选生成器键
 *
 * 调用规则(需求.md):
 *   1. 进入 reward/map 时, 查找玩家 map 字段对应奖励是否有声明;
 *   2. 有则尝试提取 generators 中的函数并执行;
 *   3. 中间出现任何问题(字段未定义/键不存在)直接回退 *_common。
 *
 * 注: 固定脚本层(getLevelScript 命中, 如 49 层)不经过生成器——
 *     随机地图生成器仅用于"无硬编码"的随机层(即不影响 49 层的纯奖励)。
 *
 * 键名约定: 多函数区域(shop/mix)用对象形态, 单函数区域直接用函数。
 */

import {
    changeHP
} from "../core/core_basics.js"
import { weightedPick, generateUid } from "../core/core_utils.js"
import { calcRecycleGain, calcShopPrice } from "../core/core_economy.js"
import { createCard, createCardByRare, upgradeCard } from "./cards.js"
import { rollRelicCandidates, gainRelic } from "./relics.js"
import { getCardDetail } from "../skill/fun_details.js"

// ============================================================
// 获得卡牌区(cardGain_common)
// ============================================================

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
function buildRewardCards({isBoss, limitedCards = [], rewardLevel, rng = Math.random}) {
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

// ============================================================
// 强化卡牌区(powerUp_common)
// ============================================================

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
        return {name: card.name, mode: "upgraded"}
    }
    const card = pool[Math.floor(Math.random() * pool.length)]
    card.power = (card.power || 0) + 1
    return {name: card.name, mode: "boost"}
}

/**
 * 强化卡牌区域核心: 对一张卡执行强化(含状态卡/已强化拦截)
 * @param {Object} p
 * @param {Object} [p.card] - 目标卡牌
 * @returns {Object} {ok, name?, msg?} - ok=false 时 msg 为拦截原因(可为空)
 */
function powerUpOnce({card}) {
    if (!card) return {ok: false}
    if (card.rare === "status") return {ok: false, msg: "状态卡无法强化"}
    if (card.upgraded === true) return {ok: false, msg: "该卡牌已强化"}
    upgradeCard(card)
    return {ok: true, name: card.name}
}

// ============================================================
// 回收卡牌区(recycle_common)
// ============================================================

export { calcRecycleGain }

/**
 * 本区域可回收张数 = 向上取整(奖励档/2)
 * @param {number} rewardLevel - 奖励等级
 * @returns {number}
 */
function calcRecycleNum(rewardLevel) {
    return Math.ceil((rewardLevel || 1) / 2)
}

/**
 * 单张卡的回收展示文本
 * @param {number} rewardLevel - 奖励等级
 * @param {Object} card - 卡牌实例
 * @returns {string}
 */
function recycleGainTxt(rewardLevel, card) {
    return `回收: ${calcRecycleGain(rewardLevel || 1, card)} 金币`
}

// ============================================================
// 遗物区(relic_common)
// ============================================================

/**
 * 生成遗物候选列表
 * @param {Object} playerInfo - 玩家对象(读 playerInfo.relics)
 * @param {number} [count=3] - 候选数量
 * @returns {Array} [{key, name, desc}]
 */
function buildRelicCandidates(playerInfo, count = 3) {
    const owned = (playerInfo.relics || []).map(r => r.key)
    return rollRelicCandidates(count, owned)
}

// ============================================================
// 融合卡牌区(mix_common, 对象形态)
// ============================================================

/**
 * 随机抽取两张融合素材(保留原始索引供销毁)。
 * 牌库不足 2 张时, 用"牌库已空"临时卡补齐, 以 poolIndex=-1 标记(不可销毁)。
 * @param {Array} pool - 卡牌池(只读)
 * @returns {Array} [{card, poolIndex}] 长度恒为 2
 */
function drawMaterials(pool) {
    const materials = []
    if (pool.length > 0) {
        // Fisher-Yates 洗牌取前 2(保留原始索引供销毁)
        const shuffled = pool.map((card, poolIndex) => ({card, poolIndex}))
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            const tmp = shuffled[i]
            shuffled[i] = shuffled[j]
            shuffled[j] = tmp
        }
        materials.push(...shuffled.slice(0, Math.min(2, pool.length)))
    }
    while (materials.length < 2) {
        materials.push({
            card: createCard("斩击", {level: 1, name: "牌库已空"}),
            poolIndex: -1
        })
    }
    return materials
}

/**
 * 融合计算: 按 power -> level -> costAP 顺序逐参数独立抽取(good/bad)
 * good 概率 = min(50 + rewardLevel*5, 95), 越高 rewardLevel 越容易出好参数
 * good = 取更优(power/level 取高, costAP 取低); bad = 取较差
 * 技能组去重合并; 融合卡 rare=0 作为融合惩罚(回收价值归零)
 * @param {Object} A - 素材 A
 * @param {Object} B - 素材 B
 * @param {number} rewardLevel - 奖励等级
 * @param {Function} [rng] - 随机源注入(默认 Math.random)
 * @returns {Object} 融合卡(全新 uid, 名字"融合卡")
 */
function computeFusion(A, B, rewardLevel, rng = Math.random) {
    const goodRate = Math.min(50 + (rewardLevel || 1) * 5, 95)
    const roll = () => rng() * 100 < goodRate
    const pickBetter = (a, b) => (roll() ? Math.max(a, b) : Math.min(a, b))
    const pickBetterCost = (a, b) => (roll() ? Math.min(a, b) : Math.max(a, b))

    const fPower = pickBetter(A.power || 0, B.power || 0)
    const fLevel = pickBetter(A.level || 1, B.level || 1)
    const fCost = pickBetterCost(A.costAP || 1, B.costAP || 1)

    // 技能组去重合并
    const doSkill = []
    for (const s of [...(A.doSkill || []), ...(B.doSkill || [])]) {
        if (!doSkill.includes(s)) doSkill.push(s)
    }

    return {
        uid: generateUid(),
        name: "融合卡",
        level: fLevel,
        power: fPower,
        costAP: fCost,
        doSkill,
        rare: 0
    }
}

/**
 * 销毁素材: 按原索引从大到小 splice; 临时"牌库已空"卡(poolIndex=-1)跳过, 防止报错
 * @param {Array} pool - 卡牌池(原地修改)
 * @param {Array} materials - drawMaterials 的返回值
 */
function consumeMaterials(pool, materials) {
    const toDelete = materials
        .map((x) => x.poolIndex)
        .filter((i) => i >= 0)
        .sort((a, b) => b - a)
    for (const i of toDelete) {
        pool.splice(i, 1)
    }
}

// ============================================================
// 商店区(shop_common, 对象形态: 多个子函数可独立替换)
// ============================================================

/** 商店卡牌商品稀有度权重(与"获得卡牌"区的 rareWeights 不同权重, 各自维护) */
const shopRareWeights = [
    {rare: 1, weight: 5},
    {rare: 2, weight: 3},
    {rare: 3, weight: 1}
]

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

/** 随机卡牌商品(3 件, 稀有度加权; 2026-08-15: 卡牌 level 固定 1, 仅由强化决定) */
function genCardGoods({rewardLevel, rng = Math.random}) {
    const rl = rewardLevel || 1
    const goods = []
    for (let i = 0; i < 3; i++) {
        const rare = weightedPick(shopRareWeights, (r) => r.weight).rare
        const card = createCardByRare(rare, {level: 1}) || createCard("斩击", {level: 1})
        goods.push(makeCardGoods(card, rl))
    }
    return goods
}

/** 随机奖励类型商品(1 件, 可重复) */
function genRewardGoods({rewardLevel, rng = Math.random}) {
    const rl = rewardLevel || 1
    const rewardTypes = ["maxAPUp", "maxHPUp", "cardBoost"]
    const key = rewardTypes[Math.floor(rng() * rewardTypes.length)]
    return makeRewardGoods(key, rl * 3, rl)
}

/** 随机遗物商品(1 件; 已集齐全部遗物则返回空数组) */
function genRelicGoods({playerInfo, rewardLevel}) {
    const rl = rewardLevel || 1
    const relicGoods = makeRelicGoods(playerInfo, rl * 5)
    return relicGoods ? [relicGoods] : []
}

/**
 * 生成商店商品 —— 卡牌 + 奖励类型 + 遗物混合(内部调用三个子生成器)
 * 商品 = {type, key?, name, desc, price, sold, apply(player, pool)}
 * @param {Object} p
 * @param {Object} p.playerInfo - 玩家对象(读 relics / goldNum)
 * @param {number} p.rewardLevel     - 奖励等级
 * @param {Function} [p.rng]    - 随机源注入(默认 Math.random)
 * @returns {Array} 商品列表
 */
function generateShopGoods({playerInfo, rewardLevel, rng = Math.random}) {
    return [
        ...genCardGoods({rewardLevel, rng}),
        genRewardGoods({rewardLevel, rng}),
        ...genRelicGoods({playerInfo, rewardLevel})
    ]
}

// ============================================================
// 篝火区(fire_common)
// ============================================================

/**
 * 篝火结算(原地修改 playerInfo)
 * ⭐ 需求.md 2026-08-16: 默认(非七咒)篝火【没有强化功能】——
 *   强化选项仅七咒等扩展生成器拥有(取旧 rollCampfire 强化逻辑)。
 * @param {Object} p
 * @param {Object} p.playerInfo    - 玩家对象(HP/maxHP 原地修改)
 * @param {Object} p.drawPool      - 卡牌池(保留入参; 无强化后不使用, 兼容扩展生成器签名)
 * @param {number} p.rewardLevel   - 奖励等级
 * @param {boolean} p.enteredFullHP - 进入时是否满血/溢血
 * @returns {Object} { log } - 提示文案
 */
function campfire({playerInfo, drawPool, rewardLevel, enteredFullHP}) {
    const fullHP = enteredFullHP

    // 生命处理
    let log
    if (fullHP) {
        playerInfo.maxHP += rewardLevel * 10
        playerInfo.HP = playerInfo.maxHP
        log = `生命已恢复满 (上限 +${rewardLevel * 10})。`
    } else {
        const heal = Math.ceil((playerInfo.maxHP || 0) * 0.60)
        changeHP(playerInfo, heal, {cap: playerInfo.maxHP}) // 最多恢复到满血
        log = `恢复 ${heal} 点生命(上限60%), 未提升上限。`
    }

    return {log}
}

// ============================================================
// 地图区(map_common)
// ============================================================

/** 随机层节点权重(与 map.ux 旧 reward_weight 一致) */
const mapRewardWeight = [
    {name: "商店", w: 1},
    {name: "强化卡牌", w: 5},
    {name: "篝火", w: 3},
    {name: "获得卡牌", w: 5},
    {name: "回收卡牌", w: 3},
    {name: "融合卡牌", w: 1},
    {name: "遗物", w: 2}
]

/**
 * 生成单个战斗节点上下文(原 map.ux generateFightContext)
 * @param {number} basicLevel - 基础等级(10关提升一次难度)
 * @param {number} stage      - 当前层数
 * @returns {Object} nodeCtx {mobLevel, mobSet, rewardLevel, isHard, _isHard?}
 */
function generateFightContext(basicLevel, stage) {
    // 确保 basicLevel 至少为 1
    const level = Math.max(1, basicLevel)

    // 难度阶段: 前期(<=10)放水 / 中期(11~30)加压 / 后期(>30)两极分化
    const isEarly = stage <= 10
    const isMid = stage > 10 && stage <= 30

    // 1. 纯奖励概率: 前期高(喘息回血), 中期正常, 后期低(战斗密集)
    const pureRewardChance = isEarly ? 3 : isMid ? 4 : 6 // 1/3 / 1/4 / 1/6
    if (Math.floor(Math.random() * pureRewardChance) === 0) {
        return {
            mobLevel: 0,
            mobSet: [],
            rewardLevel: 1, // 直接奖励固定 1(2026-08-15 level隐藏方案: 不再随层数涨)
            _isHard: false
        }
    }

    // 2. 困难概率: 前期低, 中期正常, 后期高(两极分化的一端)
    const isHard = Math.floor(Math.random() * (isEarly ? 6 : isMid ? 4 : 3)) === 1

    // 3. 稀有度上限: 前期逐步解锁(前4关只有稀有度1怪), 中期全开
    let totalRare
    if (isEarly) {
        totalRare = stage <= 4 ? 1 : stage <= 7 ? 2 : 3
    } else {
        totalRare = 3
    }
    if (isHard) totalRare = Math.max(totalRare, 2)

    // 4. 怪物等级: 困难 +1(mobLevel 仍是难度曲线, 数值封顶交给 createMob)
    let mobLevel = level
    if (isHard) mobLevel = level + 1

    // 5. 奖励等级固定(2026-08-15 level隐藏方案: 普通=2, 困难=3, 全程不变)
    const rewardLevel = isHard ? 3 : 2

    // 6. 动态计算波次和每波数量上限(线性增长, 限制在 2~5)
    const maxWaves = Math.min(2 + (level - 1) * 0.75, 5)
    const maxMobsPerWave = Math.min(2 + (level - 1) * 0.75, 5)
    const waveCount = Math.floor(Math.random() * Math.max(1, Math.floor(maxWaves))) + 1

    const mobSet = []
    for (let i = 0; i < waveCount; i++) {
        const numOfMob = Math.floor(Math.random() * Math.max(1, Math.floor(maxMobsPerWave))) + 1
        mobSet.push({
            totalRare: totalRare,
            numOfMob: numOfMob
        })
    }

    // 7. 构建战斗上下文
    return {
        mobLevel,
        mobSet,
        rewardLevel,
        isHard
    }
}

/**
 * 随机地图生成器(默认版): 生成整层随机节点
 * ⭐ 仅用于"无硬编码"的随机层——固定脚本层(getLevelScript 命中, 如 49 层)
 *   不经过本生成器, 由页面直接展开(需求.md: 不影响 49 层的纯奖励)。
 * @param {Object} p
 * @param {Object} p.playerInfo - 玩家对象(读 stage)
 * @returns {Array} 节点数组(与 expandScriptNode 产出同构, 含 rewardType)
 */
function rollMap({playerInfo}) {
    const stage = playerInfo.stage || 1
    const num = Math.floor(Math.random() * 3) + 3
    const basic_level = Math.ceil(stage / 10) //10关提升一次难度

    const nodes = []
    for (let i = 0; i < num; i++) {
        const node = generateFightContext(basic_level, stage)
        // 加权随机(区间法): 基于总权重 18 生成随机落点, 权重越大越常出现
        node.rewardType = weightedPick(mapRewardWeight, (item) => item.w).name
        nodes.push(node)
    }
    return nodes
}

// ============================================================
// generators 查表 + 提取回退
// ============================================================

/**
 * 生成器总表(仿 skill_LIB):
 *   键 = 完整生成器键(如 "map_七咒"), 值 = 函数 或 对象(多函数区域)。
 *   页面一律经 getGenerator 提取, 不要直接索引本表。
 */
export const generators = {
    // -------- 地图 --------
    "map_common": rollMap,
    // "map_七咒": 七咒预设的地图生成器(需求.md 预留, 未实现)

    // -------- 篝火 --------
    "fire_common": campfire,
    // "fire_七咒": 七咒预设的篝火生成器(需求.md 预留, 未实现)

    // -------- 强化卡牌 --------
    "powerUp_common": powerUpOnce,

    // -------- 融合卡牌(对象形态) --------
    "mix_common": {
        drawMaterials,
        computeFusion,
        consumeMaterials
    },

    // -------- 商店(对象形态: 多个子函数可独立替换, 需求.md) --------
    "shop_common": {
        generateGoods: generateShopGoods,
        genCardGoods,
        genRewardGoods,
        genRelicGoods
    },

    // -------- 获得卡牌 --------
    "cardGain_common": buildRewardCards,

    // -------- 回收卡牌(对象形态) --------
    "recycle_common": {
        calcRecycleNum,
        calcRecycleGain,
        recycleGainTxt
    },

    // -------- 遗物 --------
    "relic_common": buildRelicCandidates
}

/**
 * 奖励类型 -> 玩家 map 字段名 & common 回退键
 * (map 区域字段名特殊为 typeOfMap, 其余与类型同名, 见需求.md)
 */
const GEN_TYPE = {
    map: {field: "typeOfMap", fallback: "map_common"},
    fire: {field: "fire", fallback: "fire_common"},
    powerUp: {field: "powerUp", fallback: "powerUp_common"},
    mix: {field: "mix", fallback: "mix_common"},
    shop: {field: "shop", fallback: "shop_common"},
    cardGain: {field: "cardGain", fallback: "cardGain_common"},
    recycle: {field: "recycle", fallback: "recycle_common"},
    relic: {field: "relic", fallback: "relic_common"}
}

/**
 * 提取生成器(仿 runSkill 查表; 需求.md 提取回退规则):
 *   1. 读玩家 map 字段对应奖励的声明键(如 playerInfo.map.fire === "fire_七咒");
 *   2. 有声明且 generators 中存在 -> 返回该生成器;
 *   3. 字段未定义 / 键不存在 / 值非法 -> 回退 *_common。
 * @param {Object} playerInfo - 玩家对象(读 playerInfo.map)
 * @param {string} type - 奖励类型: map / fire / powerUp / mix / shop / cardGain / recycle / relic
 * @returns {Function|Object} 生成器(函数或对象)
 */
export function getGenerator(playerInfo, type) {
    const cfg = GEN_TYPE[type]
    if (!cfg) return generators[type + "_common"] || null

    const declared = playerInfo && playerInfo.map && playerInfo.map[cfg.field]
    const gen = typeof declared === "string" ? generators[declared] : null
    return gen || generators[cfg.fallback]
}
