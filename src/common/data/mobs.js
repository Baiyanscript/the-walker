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
 *   act      - 行动技能配置, 支持两种状态(2026-08-12):
 *                数组 [k1,k2,...] —— 按 actIndex 顺序循环遍历, 非法 key 跳过;
 *                对象 {k1:权重,k2:权重} —— 加权随机, 配合黑名单系统:
 *                  实例 blackList{key:剩余禁用回合} 中的 key 不被随机到;
 *                  每次行动后 markActUsed 把该 key 加入黑名单(banTime 回合, 模板字段, 默认 3);
 *                  roll 前全体值-1, 归 0 放出; 全部可行动都在黑名单则"什么也不做"(返回 null)
 *   banTime  - 对象模式专用: 技能使用后的禁用回合数(模板字段, 默认 3)
 *   actIndex - 数组模式专用: 循环遍历指针(实例维护, 初始 0)
 *   blackList- 对象模式专用: 黑名单 {key: 剩余禁用回合}(实例维护)
 *   nextTurn - 下一回合要使用的技能键名(undefined 时由 rollNextTurn 掷出)
 *   sAct     - 预留: 特殊行动偏好键数组(优先级高于 act), 设计讨论中, 暂未实现
 */

import { weightedPick } from "../core/utils.js"
import { skill_LIB } from "../skills/skills.js"
import { actionPref_LIB } from "../skills/preferences.js"

/** 怪物模板表: 键名 = 模板键(创建时传入) */
export const mob_LIB = {
    "史莱姆": {
        name: "史莱姆", HP: 10, power: 5, rare: 1,
        // 循环: 普攻 → 回血 → 粘液攻击(推送粘液状态卡, 2026-08-13)
        act: ["skill_shared_attack", "skill_shared_heal", "skill_mob_slimeAttack"]
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
        // 对象模式示例: 加权随机(攻2/超防1/防1), 技能用后禁用 banTime=2 回合
        act: { skill_shared_attack: 2, skill_shared_superDefend: 1, skill_shared_defend: 1 },
        banTime: 2
    },
    "黄金史莱姆": {
        name: "黄金史莱姆", HP: 30, power: 3, rare: 2,
        // 循环: 金币攻击 → 回血 → 金币堆攻击(推送"粘在一起的金币", 2026-08-13)
        act: ["skill_mob_goldAttack", "skill_shared_heal", "skill_mob_goldSlimeAttack"],
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
        // 对象模式示例: 普攻权重2/狂乱权重1, 狂乱用后禁用默认 3 回合(防连续锁玩家)
        act: { skill_shared_attack: 2, skill_card_madCocktail: 1 }
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
    "MC好成": {
        name: "MC好成", HP: 100, power: 5, rare: "BOSS", // 网络迷因BOSS(第50层固定战)
        // 数组模式: 召唤先行(初始行动=act[0], createMob 自动掷), 之后 召唤/攻击 交替循环;
        // learnSkills 学到的技能 push 进此数组(去重), 一并参与循环
        act: ["skill_mob_summonScapegoat", "skill_shared_attack"],
        // 初始BUFF [是啊，看什么？]: 玩家行动时学习其出牌技能(黑名单/重复则回血+power, 见 effect_learnSkills)
        effect: [
            { key: "effect_learnSkills", restTurn: "inf", level: 1, isRemove: false }
        ]
    },
    "青春生骑士": {
        name: "青春生骑士", HP: 10, power: 2, rare: 2,
        // 数组模式 + sAct 偏好(暴怒): 残血(<maxHP/4)时暴怒 power+2, 平时 攻/防/回血 循环
        act: ["skill_shared_attack", "skill_shared_defend", "skill_shared_heal"],
        sAct: ["anger"]
    },
    // ---------- 尖塔移植怪(2026-08-12) ----------
    "大颚虫": { // 尖塔 Jaw Worm: 重击/盾击/咆哮循环
        name: "大颚虫", HP: 18, power: 5, rare: 1,
        // 重击→咆哮(+power)→重击→盾击 循环(咆哮=skill_mob_anger 永久+2)
        act: ["skill_shared_attack", "skill_mob_anger", "skill_shared_attack", "skill_shared_defend"]
    },
    "邪教徒": { // 尖塔 Cultist: 仪式(每回合+力量) + 黑暗打击递增
        name: "邪教徒", HP: 16, power: 4, rare: 1,
        act: ["skill_shared_attack"],
        // 仪式: 每回合开始 power+2(结算见 effect_ritual), 攻击随回合递增
        effect: [{ key: "effect_ritual", restTurn: "inf", level: 2 }]
    },
    "史莱姆老大": { // 尖塔 Slime Boss: 盾→撞击→黏液毒 循环, 残血分裂
        name: "史莱姆老大", HP: 100, power: 8, rare: "BOSS",
        // 3回合循环: 准备(盾) → 史莱姆撞击(高伤普攻) → 黏液喷射(毒)
        act: ["skill_shared_defend", "skill_shared_attack", "skill_card_poison"],
        // 残血分裂: 生命低于一半时分裂成 2 只史莱姆(结算见 effect_eliteSplit)
        effect: [{ key: "effect_eliteSplit", restTurn: "inf", level: 1 }]
    },
    // ---------- 老渔夫 BOSS 全家桶(2026-08-13, 需求.md 新BOSS) ----------
    "老渔夫": {
        name: "老渔夫", HP: 300, power: 5, rare: "BOSS",
        // 4回合循环: 钓鱼(召2~4鱼) → 回血 → 钓牌(偷手牌) → 超级防御
        act: ["skill_mob_fishCast", "skill_shared_heal", "skill_mob_fishHand", "skill_shared_superDefend"],
        // 不屈的钓鱼佬: 玩家对自己出牌时替换为空靶子(结算见 effect_fishermanSpirit)
        effect: [{ key: "effect_fishermanSpirit", restTurn: "inf", level: 1 }]
    },
    // ---------- 尖塔移植怪(2026-08-13, 需求.md 素材) ----------
    "地精大块头": { // 尖塔 Gremlin Nob: 精英, 玩家出牌即被激怒
        name: "地精大块头", HP: 70, power: 10, rare: 3,
        // 循环: 咆哮(power+2) → 颅骨重击(伤害+易伤) → 蛮牛冲撞(高伤) 交替
        act: ["skill_mob_anger", "skill_card_bash", "skill_mob_charge"],
        // 激怒: 玩家任意出牌时本怪 power+1(简化版, 不检测技能类型)
        effect: [{ key: "effect_gremlinNob", restTurn: "inf", level: 1 }]
    },
    "地精法师": { // 尖塔 Gremlin Wizard: 蓄力读条后大爆炸
        name: "地精法师", HP: 25, power: 8, rare: 1,
        // 循环: 蓄力×2 → 终极大爆炸(20伤) → 蓄力×3 → 终极大爆炸
        act: ["skill_shared_idle", "skill_shared_idle", "skill_mob_bigBoom", "skill_shared_idle", "skill_shared_idle", "skill_shared_idle", "skill_mob_bigBoom"]
    },
    "圆球守护者": { // 尖塔 Spheric Guardian: 护盾坦克, 固定循环
        name: "圆球守护者", HP: 22, power: 8, rare: 2,
        // 开局带盾: 激活(盾25) → 脆弱打击(伤害+易伤) → 硬化打击(伤害+盾15) → 双击(两段) 交替
        act: ["skill_shared_defend", "skill_card_bash", "skill_mob_harden", "skill_mob_doubleHit"],
        DP: 25 // 初始护盾(战斗内每回合重置, 首回合保留)
    },
    "真菌兽": { // 尖塔 Fungi Beast: 成长型杂兵, 越打越疼
        name: "真菌兽", HP: 24, power: 6, rare: 1,
        // 循环: 生长(power+2) → 攻击 → 攻击(固定练功怪)
        act: ["skill_mob_anger", "skill_shared_attack", "skill_shared_attack"]
    },
    // ---------- 尖塔 BOSS: 铜制机械人偶(2026-08-13, 75 层, 需求.md) ----------
    "铜制机械人偶": { // 尖塔 Bronze Automaton: 召唤铜球 + 力量累积 + 超能光束
        name: "铜制机械人偶", HP: 400, power: 6, rare: "BOSS",
        // 开场召唤2铜球 → 6回合循环: 双击→强化→双击→强化→超能光束→发呆(眩晕)
        act: ["skill_mob_summonOrb", "skill_mob_doubleHit", "skill_mob_boost",
              "skill_mob_doubleHit", "skill_mob_boost", "skill_mob_hyperBeam", "skill_shared_idle"]
    },
    "铜球": { // 尖塔 Bronze Orb: 召唤物, 攻击=激光, 防御=保护光束(给主人加盾)
        name: "铜球", HP: 30, power: 3, rare: 1, hidden: true, // 仅铜制机械人偶召唤, 不进随机池
        // 循环: 激光(攻击) → 激光 → 保护光束(给BOSS加盾) → 激光
        act: ["skill_shared_attack", "skill_shared_attack", "skill_mob_protectBeam", "skill_shared_attack"]
    },
    "腐烂的鱼": {
        name: "腐烂的鱼", HP: 10, power: 1, rare: 3,
        // 攻击/回血循环; 普通池出现时 T=玩家, BOSS 钓鱼召唤时 T=老渔夫(技能内硬编码覆盖 exDate)
        act: ["skill_shared_attack", "skill_shared_heal"],
        // 蕴含卡牌: 死亡时以本体为使用者对 T 打出 C(默认 T=玩家, C=基础斩击, 见 effect_embedCard)
        effect: [{ key: "effect_embedCard", restTurn: "inf", level: 1 }]
    }
    // 注: 空靶子(钓牌/不屈靶子)与愤怒的骷髅鱼(死变骷髅)不设模板——
    //   基于已有模板(史莱姆/哥布林)硬编码魔改创建, 见 skill_mob_fishHand / effect_revive
}

/** 稀有度索引: rare -> 怪物模板对象(保留 key, 构建于 mob_LIB 之上) */
export const mobByRare = {}

for (const key in mob_LIB) {
    const mob = mob_LIB[key]
    // 隐藏模板(hidden: true)不进随机池——仅由特定机制(技能召唤)生成, 如铜球
    if (mob.hidden === true) continue
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

    // 6. 确定最终技能列表(数组=循环遍历 / 对象=加权+黑名单, 见文件头注释)
    let finalAct = []
    if (setAct) {
        if (Array.isArray(setAct)) {
            finalAct = [...setAct]
        } else if (typeof setAct === "object") {
            finalAct = { ...setAct } // 对象模式(加权+黑名单)
        }
    } else {
        const sourceKey = (actAs !== undefined) ? actAs : keyName
        if (sourceKey && mob_LIB[sourceKey]) {
            const srcAct = mob_LIB[sourceKey].act
            if (Array.isArray(srcAct)) {
                finalAct = [...srcAct]
            } else if (srcAct && typeof srcAct === "object") {
                finalAct = { ...srcAct } // 对象模式(浅拷贝, 避免共享模板)
            } else {
                finalAct = []
            }
        } else {
            if (sourceKey) {
                console.warn(`[createMob] actAs 指向的 "${sourceKey}" 不存在, 技能列表将为空`)
            }
            finalAct = []
        }
        if (addAct && Array.isArray(addAct) && addAct.length > 0) {
            if (Array.isArray(finalAct)) {
                finalAct = [...finalAct, ...addAct]
            } else {
                console.warn("[createMob] act 为对象模式, addAct 追加仅支持数组模式, 已忽略")
            }
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
        maxHP: finalHP,           // 血量上限(回血钳制用, 见 skill_shared_heal 的 cap)
        power: template.power || 0,
        rare: template.rare || 0,
        level,
        DP: (DP !== undefined) ? DP : (template.DP || 0),
        effect: normalizedEffects,
        act: finalAct,
        actIndex: 0,          // 数组模式循环指针(初始 0)
        blackList: {},        // 禁用表(对象模式 act 黑名单 + 行动偏好的自禁用, 一同管理/递减)
        banTime: template.banTime, // 对象模式禁用回合(模板字段, 缺省时 rollNextTurn 按 3 处理)
        sAct: Array.isArray(template.sAct) ? [...template.sAct] : undefined, // 行动偏好键数组(优先级高于 act)
        nextTurn: undefined
    }

    // 9. 初始化下一回合行动(优先级: detail.nextTurn > 模板 nextTurn > 随机掷)
    newMob.nextTurn = (nextTurn !== undefined)
        ? nextTurn
        : (template.nextTurn !== undefined ? template.nextTurn : rollNextTurn(newMob))

    return newMob
}

/**
 * 掷出怪物下一回合的行动技能(act 双模式, 见文件头注释)
 * 数组模式: 按 actIndex 顺序循环遍历, 非法 key 跳过(指针同步推进), 全部非法返回 null
 * 对象模式: 先清理黑名单(全体值-1, 归 0 放出), 再从非黑名单 key 中加权随机;
 *           全部可行动都在黑名单则"什么也不做"(返回 null)
 * @param {Object} mob_obj - 怪物实例(必须包含 act)
 * @returns {string|null} 技能键名; null = 本回合不行动(发呆)
 */
export function rollNextTurn(mob_obj) {
    const acts = mob_obj && mob_obj.act
    if (!acts) {
        console.warn('[rollNextTurn] 怪物没有可用的技能, 返回 null')
        return null
    }
    mob_obj._prefAct = false // 偏好行动标记(由战斗流程读取后消费, 用于跳过 markActUsed)

    // 禁用表阶段: 先取"本轮禁用集"(递减前值>0 的 key——含即将归0的本次仍禁用),
    // 再递减, 归 0 的 key 放出(下次 roll 起可被随机到)。对所有模式执行
    // (数组模式怪也可能有禁用表条目——行动偏好的自禁用, 如暴怒的 "anger")。
    const bannedNow = {}
    if (mob_obj.blackList) {
        for (const k in mob_obj.blackList) {
            if (mob_obj.blackList[k] > 0) bannedNow[k] = true
            mob_obj.blackList[k] -= 1
            if (mob_obj.blackList[k] <= 0) {
                delete mob_obj.blackList[k]
            }
        }
    }

    // -------- sAct 偏好阶段(优先级高于 act) --------
    // 偏好函数签名: (mob, ctx) => "技能key" | null | undefined
    //   key = 使用该技能(不更新主 act 状态); null = 明确无行动; undefined = 跳过找下一个, 全 undefined 回退 act
    if (Array.isArray(mob_obj.sAct)) {
        for (const prefKey of mob_obj.sAct) {
            const prefFn = actionPref_LIB[prefKey]
            if (typeof prefFn !== 'function') {
                console.warn(`[rollNextTurn] 行动偏好 "${prefKey}" 未定义, 跳过(需后续补充)`)
                continue
            }
            const result = prefFn(mob_obj, { banned: bannedNow })
            if (result === null) {
                return null // 明确无行动: 本回合发呆
            }
            if (typeof result === 'string' && skill_LIB[result]) {
                mob_obj._prefAct = true // 偏好行动: 不更新主 act, 不进 act 黑名单
                return result
            }
            if (typeof result === 'string') {
                console.warn(`[rollNextTurn] 偏好 "${prefKey}" 返回了不存在的技能 "${result}", 跳过`)
            }
            // undefined / 非法: 继续下一个偏好
        }
    }

    if (Array.isArray(acts)) {
        // -------- 数组模式: actIndex 循环遍历 --------
        const len = acts.length
        if (len === 0) return null
        const start = mob_obj.actIndex || 0
        for (let i = 0; i < len; i++) {
            const idx = (start + i) % len
            // 维护指针: 每步都推进(跳过非法 key 时同样推进, 防止卡在同一 key 死循环)
            mob_obj.actIndex = (idx + 1) % len
            const key = acts[idx]
            if (typeof key === 'string' && skill_LIB[key]) {
                return key
            }
        }
        return null // 全部不合法
    }

    if (typeof acts === 'object') {
        // -------- 对象模式: 加权随机(排除本轮禁用集) --------
        const entries = []
        for (const k in acts) {
            if (!bannedNow[k]) entries.push([k, acts[k]])
        }
        if (entries.length === 0) {
            return null // 全部可行动都在黑名单: 什么也不做
        }
        const picked = weightedPick(entries, (e) => e[1])
        return picked ? picked[0] : null
    }

    console.warn('[rollNextTurn] act 结构异常, 返回 null')
    return null
}

/**
 * 标记怪物技能"已使用"(对象模式黑名单维护): 该技能进入黑名单 banTime 回合。
 * 由战斗流程在怪物执行完技能后调用; 数组模式(循环遍历)不适用, 内部自动忽略。
 * @param {Object} mob - 怪物实例
 * @param {string} key - 刚执行过的技能键名
 */
export function markActUsed(mob, key) {
    if (!mob || !key) return
    const acts = mob.act
    // 仅对象模式(加权+黑名单)维护; 数组模式为顺序循环, 无需禁用
    if (!acts || typeof acts !== 'object' || Array.isArray(acts)) return
    mob.blackList = mob.blackList || {}
    mob.blackList[key] = (mob.banTime !== undefined) ? mob.banTime : 3
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
