// common/data/cards.js
/**
 * ============================================================
 * 卡牌数据表 + 卡牌工厂
 * ============================================================
 * 本文件包含三部分:
 *   1. card_LIB    —— 卡牌模板表(纯数据)
 *   2. cardByRare  —— 稀有度索引(构建于模板表之上, 必须同文件)
 *   3. createCard / createCardByRare —— 卡牌工厂函数
 *      工厂函数因强依赖 card_LIB(深拷贝模板), 与表同文件存放。
 *      如后续卡牌逻辑膨胀, 可将其迁出至独立文件, 此处仅留注释。
 *
 * 卡牌实例字段规范:
 *   uid     - 唯一标识(生成时自动)
 *   name    - 展示名
 *   level   - 卡牌等级(数值缩放依据)
 *   power   - 基础威力(与 level 相乘得到最终数值)
 *   costAP  - 行动点消耗
 *   doSkill - 技能键名数组, 按顺序执行(键名定义于 skills/skills.js)
 */

import { generateUid } from "../core/utils.js"

/** 卡牌模板表: 键名 = 模板键(创建时传入) */
export const card_LIB = {
    "斩击": {
        name: "斩击", power: 8, rare: 1, costAP: 1,
        doSkill: ["skill_shared_attack"]
    },
    "持盾": {
        name: "持盾", power: 5, rare: 1, costAP: 1,
        doSkill: ["skill_shared_defend"]
    },
    "攻防一体": {
        name: "攻防一体", power: 5, rare: 1, costAP: 2,
        doSkill: ["skill_shared_attack", "skill_shared_defend"]
    },
    "横扫": {
        name: "横扫", power: 3, rare: 2, costAP: 4,
        doSkill: ["skill_card_sweep"]
    },
    "淬毒": {
        name: "淬毒", power: 1, rare: 1, costAP: 1,
        doSkill: ["skill_card_poison"]
    },
    "治愈之光": {
        name: "治愈之光", power: 2, rare: 1, costAP: 1,
        doSkill: ["skill_shared_heal"]
    },
    "快速充能": {
        name: "快速充能", power: 2, rare: 1, costAP: 0,
        doSkill: ["skill_card_energize"]
    },
    "强效呼吸": {
        name: "强效呼吸", power: 2, rare: 1, costAP: 1,
        doSkill: ["skill_card_deepBreath"]
    },
    "小蛋糕": {
        name: "小蛋糕", power: 0, rare: 1, costAP: 1,
        doSkill: ["skill_card_feed"]
    },
    "不死图腾": {
        name: "不死图腾", power: 0, rare: 3, costAP: 5,
        doSkill: ["skill_card_totemCurse", "skill_card_totemBless"]
    },
    "狂乱的鸡尾酒": {
        name: "狂乱的鸡尾酒", power: 0, rare: 2, costAP: 2,
        doSkill: ["skill_card_madCocktail"]
    },
    "代偿": {
        name: "代偿", power: 1, rare: 3, costAP: 3,
        doSkill: ["skill_card_compensation"]
    },
    "哎，大狗？": {
        name: "哎，大狗？", power: 1, rare: 2, costAP: 2,
        exDate: { layer: 0 }, // 成长层数(每次打出+1, 名字变"大狗"×层数)
        doSkill: ["skill_card_dog"]
    },
    "贪婪之刃": {
        name: "贪婪之刃", power: 3, rare: 2, costAP: 2,
        doSkill: ["skill_card_goldenAttack"]
    },
    "火焰新星": {
        name: "火焰新星", power: 4, rare: 3, costAP: 4,
        doSkill: ["skill_card_fireNova"]
    },
    "模仿者": {
        name: "模仿者", power: 2, rare: 3, costAP: 3,
        doSkill: ["skill_card_mimic"]
    },
    "衔尾蛇": {
        name: "衔尾蛇", power: 1, rare: 2, costAP: 3,
        doSkill: ["skill_card_ouroboros", "skill_shared_attack"]
    },
}

/** 稀有度索引: rare -> 模板键名数组 (构建于 card_LIB 之上) */
export const cardByRare = {}

for (const key in card_LIB) {
    const card = card_LIB[key]
    const rare = card.rare
    if (!cardByRare[rare]) {
        cardByRare[rare] = []
    }
    cardByRare[rare].push(key)
}

// ============================================================
// 以下为卡牌工厂函数 (依赖上方模板表, 故同文件存放)
// ============================================================

/**
 * 根据模板键创建一张卡牌实例
 * @param {string} nameKey - 卡牌模板键(必填), 不存在则返回 null 并警告
 * @param {Object} [detail] - 自定义配置参数
 * @param {string} [detail.name]        - 自定义卡牌名称
 * @param {number} [detail.level=1]     - 卡牌等级, 影响最终数值
 * @param {number} [detail.power]       - 自定义最终威力(不传则按 base.power * level)
 * @param {number} [detail.costAP]      - 自定义行动点消耗
 * @param {Array}  [detail.setDoSkill]  - 指定技能数组(最高优先级, 覆盖模板)
 * @param {string} [detail.doSkillAs]   - 从另一张卡牌模板复制技能列表
 * @param {Array}  [detail.addDoSkill]  - 追加技能列表(拼在最后)
 * @returns {Object|null} 卡牌实例
 */
export function createCard(nameKey, detail = {}) {
    // 1. 校验模板是否存在
    const template = card_LIB[nameKey]
    if (!template) {
        console.warn(`[createCard] 未知卡牌模板: ${nameKey}`)
        return null
    }

    // 2. 深拷贝模板(防止污染原配置)
    const base = JSON.parse(JSON.stringify(template))

    // 3. 提取参数
    const {
        name,
        level = 1,
        power,
        costAP,
        setDoSkill,
        doSkillAs,
        addDoSkill = []
    } = detail

    // 4. 确定最终名称
    const finalName = name || base.name

    // 5. 确定最终 power(显式传入则覆盖, 否则按等级缩放)
    const finalPower = (power !== undefined) ? power : (base.power || 0) * level

    // 6. 确定最终 costAP(传入则覆盖, 否则沿用模板)
    const finalCost = (costAP !== undefined) ? costAP : base.costAP

    // 7. 确定最终 doSkill 数组(优先级: setDoSkill > doSkillAs > 模板自带, 最后拼 addDoSkill)
    let finalDoSkill = []
    if (setDoSkill && Array.isArray(setDoSkill)) {
        finalDoSkill = [...setDoSkill]
    } else if (doSkillAs) {
        const sourceTemplate = card_LIB[doSkillAs]
        if (sourceTemplate) {
            finalDoSkill = [...(sourceTemplate.doSkill || [])]
        } else {
            console.warn(`[createCard] doSkillAs 指向的 "${doSkillAs}" 不存在, 将回退到模板自带技能`)
            finalDoSkill = [...(base.doSkill || [])]
        }
    } else {
        finalDoSkill = [...(base.doSkill || [])]
    }
    if (addDoSkill && Array.isArray(addDoSkill)) {
        finalDoSkill = [...finalDoSkill, ...addDoSkill]
    }

    // 8. 生成唯一 UID
    const uid = generateUid()

    // 9. 构建最终实例(只含"固有资产", 不含运行时状态)
    return {
        uid,
        name: finalName,
        level,
        power: finalPower,
        costAP: finalCost,
        doSkill: finalDoSkill,
        rare: base.rare, // 保留稀有度(回收等玩法需要; 旧存档中无此字段的卡, 按丢失处理)
        exDate: base.exDate // 模板自定义数据(如"哎，大狗？"的成长层数; 无则 undefined)
    }
}

/**
 * 根据稀有度随机创建一张卡牌
 * @param {number} rare - 稀有度
 * @param {Object} [detail={}] - 自定义配置参数, 透传给 createCard
 * @returns {Object|null} 卡牌实例, 或 null(稀有度无效或池为空)
 */
export function createCardByRare(rare, detail = {}) {
    const pool = cardByRare[rare]
    if (!pool || pool.length === 0) {
        console.warn(`[createCardByRare] 稀有度 ${rare} 没有卡牌`)
        return null
    }
    const randomIndex = Math.floor(Math.random() * pool.length)
    const keyName = pool[randomIndex]
    return createCard(keyName, detail)
}
