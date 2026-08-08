// common/data/mobs.js
/**
 * ============================================================
 * 怪物数据表 + 怪物工厂
 * ============================================================
 * 本文件包含三部分:
 *   1. mob_LIB     —— 怪物模板表(纯数据)
 *   2. mobByRare   —— 稀有度索引(构建于模板表之上, 必须同文件)
 *   3. createMob / createMobByRare / rollNextTurn —— 怪物工厂函数
 *      ⭐ 工厂函数因强依赖 mob_LIB(深拷贝模板), 与表同文件存放。
 *
 * 怪物实例字段规范:
 *   name     - 展示名
 *   HP       - 当前生命
 *   power    - 基础威力(与 level 相乘得到最终数值)
 *   level    - 等级(影响基础血量)
 *   rare     - 稀有度
 *   DP       - 当前护盾(每回合刷新)
 *   effect   - 效果列表 [{key, restTurn, level, isRemove}]
 *   act      - 可用技能键名数组(键名定义于 skills/skills.js)
 *   nextTurn - 下一回合要使用的技能键名(undefined 时由 rollNextTurn 掷出)
 */

/** 怪物模板表: 键名 = 模板键(创建时传入) */
export const mob_LIB = {
    "史莱姆": {
        name: "史莱姆", HP: 10, power: 5, rare: 1,
        act: ["skill_shared_heal", "skill_shared_attack"]
    },
    "哥布林": {
        name: "哥布林", HP: 15, power: 7, rare: 1,
        act: ["skill_shared_defend", "skill_shared_attack"]
    },
    "苦力怕": {
        name: "苦力怕", HP: 15, power: 7, rare: 2,
        act: ["skill_shared_boom"]
    },
    "龟龟": {
        name: "龟龟", HP: 30, power: 2, rare: 2,
        act: ["skill_shared_attack", "skill_shared_superDefend", "skill_shared_defend"]
    },
    "黄金史莱姆": {
        name: "黄金史莱姆", HP: 30, power: 3, rare: 2,
        act: ["skill_mob_goldAttack", "skill_shared_defend"],
        effect: [{ key: "effect_goldDrop", restTurn: "inf", level: 1 }]
    },
    "强盗": {
        name: "强盗", HP: 15, power: 6, rare: 2,
        act: ["skill_mob_steal", "skill_shared_attack"]
    },
    "史莱姆之王": {
        name: "史莱姆之王", HP: 25, power: 2, rare: 3,
        act: ["skill_shared_attack", "skill_shared_heal"],
        effect: [{ key: "effect_slimeSplit", restTurn: "inf", level: 1 }]
    },
    "超级龟龟": {
        name: "超级龟龟", HP: 50, power: 3, rare: 2,
        DP: 300, // 初始护盾: 过一回合后自然消失(战斗流程每回合重置 DP)
        act: ["skill_shared_attack", "skill_shared_superDefend", "skill_shared_defend"]
    },
    "萨满哥布林": {
        name: "萨满哥布林", HP: 18, power: 4, rare: 3,
        act: ["skill_card_poison", "skill_mob_weakness", "skill_shared_attack"]
    },
    "王牌": {
        name: "王牌", HP: 15, power: 1, rare: 3,
        // 通用攻击 + 狂乱的鸡尾酒(给玩家上狂乱, 使玩家出牌随机打错目标)
        act: ["skill_shared_attack", "skill_card_madCocktail"]
    },
    "腐烂僵尸": {
        name: "腐烂僵尸", HP: 10, power: 2, rare: 3,
        act: ["skill_shared_defend", "skill_shared_attack"],
        effect: [{ key: "effect_revive", restTurn: "inf", level: 0 }] // 常驻: 死后变骷髅
    },
    "哎？大狗": {
        name: "哎？大狗", HP: 30, power: 3, rare: 3,
        // 有且仅有一个技能组: 请叫叫(层数成长/爆发)
        act: ["skill_mob_dog"]
    },
    "史莱姆王": {
        name: "史莱姆王", HP: 60, power: 8, rare: 3,
        // 占位BOSS(第50层固定战): 数值放大版史莱姆, 后续设计真BOSS时替换此模板
        act: ["skill_shared_attack", "skill_shared_heal", "skill_shared_superDefend"]
    }
}

/** 稀有度索引: rare -> 怪物模板对象(保留 key, 构建于 mob_LIB 之上) */
export const mobByRare = {}

for (const key in mob_LIB) {
    const mob = mob_LIB[key]
    const rare = mob.rare
    if (!mobByRare[rare]) {
        mobByRare[rare] = []
    }
    mobByRare[rare].push({ key, ...mob })
}

// ============================================================
// 以下为怪物工厂函数 (依赖上方模板表, 故同文件存放)
// ============================================================

/**
 * 创建怪物实例
 * @param {string} keyName - 怪物模板键(必填), 不存在则返回 null 并警告
 * @param {Object} [detail={}] - 自定义配置参数
 * @param {string} [detail.name]       - 自定义名字(不传则用模板原名)
 * @param {number} [detail.level=1]    - 等级(影响基础血量)
 * @param {number} [detail.HP]         - 自定义当前血量(不传则按 level * 模板HP)
 * @param {number} [detail.DP]         - 初始护盾(不传则用模板 DP 字段, 模板也没有则为 0)
 * @param {Array}  [detail.effect=[]]  - 效果列表, 必须符合 {key, restTurn, level} 结构
 * @param {Array}  [detail.setAct]     - 直接指定最终技能列表(最高优先级)
 * @param {string} [detail.actAs]      - 技能来源怪物键名(默认取模板自身)
 * @param {Array}  [detail.addAct=[]]  - 追加技能列表
 * @param {string} [detail.nextTurn]   - 指定下一回合行动(不传则随机掷)
 * @returns {Object|null} 怪物实例
 */
export function createMob(keyName, detail = {}) {
    // 1. 校验模板是否存在
    if (!keyName || !mob_LIB[keyName]) {
        console.warn(`[createMob] 未知怪物: ${keyName}`)
        return null
    }

    // 2. 深拷贝模板(防止污染原配置)
    const template = JSON.parse(JSON.stringify(mob_LIB[keyName]))

    // 3. 提取参数
    const {
        name,
        level = 1,
        HP,
        DP,
        effect: extraEffect = [],
        setAct,
        actAs,
        addAct = [],
        nextTurn
    } = detail

    // 4. 确定最终名字
    const finalName = name || template.name

    // 5. 计算最终血量
    const baseHp = template.HP || 10
    const finalHP = (HP !== undefined) ? HP : level * baseHp

    // 6. 确定最终技能列表
    let finalAct = []
    if (setAct && Array.isArray(setAct)) {
        finalAct = [...setAct]
    } else {
        const sourceKey = (actAs !== undefined) ? actAs : keyName
        if (sourceKey && mob_LIB[sourceKey]) {
            finalAct = [...(mob_LIB[sourceKey].act || [])]
        } else {
            if (sourceKey) {
                console.warn(`[createMob] actAs 指向的 "${sourceKey}" 不存在, 技能列表将为空`)
            }
            finalAct = []
        }
        if (addAct && Array.isArray(addAct)) {
            finalAct = [...finalAct, ...addAct]
        }
    }

    // 7. 合并效果(模板自带 + 外部传入)并进行标准化校验
    const rawEffects = [...(template.effect || []), ...extraEffect]
    const normalizedEffects = []
    for (const eff of rawEffects) {
        if (typeof eff !== 'object' || eff === null) {
            console.warn(`[createMob] 效果格式错误, 已跳过: 期望对象, 实际 ${typeof eff}`, eff)
            continue
        }
        if (!eff.key || typeof eff.key !== 'string') {
            console.warn(`[createMob] 效果缺少 key 字段或类型错误, 已跳过:`, eff)
            continue
        }
        if (typeof eff.level !== 'number' || eff.level < 0) {
            console.warn(`[createMob] 效果 level 必须为非负数字, 已跳过:`, eff)
            continue
        }
        normalizedEffects.push({ ...eff })
    }

    // 8. 构建最终实例(DP: 显式传入优先, 其次模板 DP, 都没有则为 0)
    const newMob = {
        name: finalName,
        HP: finalHP,
        power: template.power || 0,
        rare: template.rare || 0,
        level,
        DP: (DP !== undefined) ? DP : (template.DP || 0),
        effect: normalizedEffects,
        act: finalAct,
        nextTurn: undefined
    }

    // 9. 初始化下一回合行动
    newMob.nextTurn = (nextTurn !== undefined) ? nextTurn : rollNextTurn(newMob)

    return newMob
}

/**
 * 根据怪物可用的 act 操作, 随机抽取一个动作
 * @param {Object} mob_obj - 怪物实例(必须包含 act 数组)
 * @returns {string|null} 随机选中的技能键名; 无可用技能时返回 null
 *   null 语义: 由战斗流程按"本回合不行动(发呆)"处理, 不会触发无效技能警告
 */
export function rollNextTurn(mob_obj) {
    const acts = mob_obj && mob_obj.act
    if (!acts || !Array.isArray(acts) || acts.length === 0) {
        console.warn('[rollNextTurn] 怪物没有可用的技能, 返回 null')
        return null
    }
    const randomIndex = Math.floor(Math.random() * acts.length)
    return acts[randomIndex]
}

/**
 * 按稀有度随机创建怪物
 * @param {number} rare - 稀有度
 * @param {Object} [detail={}] - 自定义配置, 透传给 createMob
 * @returns {Object|null} 怪物实例, 或 null(稀有度无怪物)
 */
export function createMobByRare(rare, detail = {}) {
    const pool = mobByRare[rare]
    if (!pool || pool.length === 0) {
        console.warn(`[createMobByRare] 稀有度 ${rare} 没有怪物`)
        return null
    }
    const randomIndex = Math.floor(Math.random() * pool.length)
    const mobEntry = pool[randomIndex]
    return createMob(mobEntry.key, detail)
}
