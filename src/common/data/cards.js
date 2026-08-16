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
 *   uid       - 唯一标识(生成时自动)
 *   name      - 展示名
 *   level     - 卡牌等级(数值缩放依据)
 *   power     - 基础威力(与 level 相乘得到最终数值)
 *   costAP    - 行动点消耗
 *   doSkill   - 技能键名数组, 按顺序执行(键名定义于 fun_skill.js)
 *   tplKey    - 模板键(强化时查 upgrade 配置用; 融合卡等无模板的卡为 undefined)
 *   upgraded  - 是否已强化(杀戮尖塔化: 每张卡仅可强化一次)
 *   limit     - 来源白名单(可选, 需求.md 2026-08-16): 声明本卡仅哪些来源可刷出
 *               (如 ["BOSS"]=仅BOSS战奖励 / ["老渔夫"]=仅25层老渔夫奖励 /
 *               ["七咒"]=仅七咒预设 / ["富二代"]=仅富二代预设);
 *               未声明 = 全来源通用卡(进池与否由抽取方 allowCommon 决定)
 *   isStrict  - 卡牌严格模式(可选, 默认 false): true 时要求卡牌 limit(CL)
 *               被抽取方来源(RL)完全包含(CL ⊆ RL)才可用, 否则交集即可
 *
 * 模板 upgrade 字段(杀戮尖塔化, 2026-08-12):
 *   - 升级(level 无限成长)已废弃, 改为"一次性强化": 每张卡最多强化一次
 *   - upgrade = { power?: 威力增量, costAP?: 费用减量(正数=减少), level?: 等级增量 }
 *   - 未声明 upgrade 的模板默认按 { level: 1 } 强化(温和兜底)
 */

import { generateUid } from "../core/core_utils.js"

/** 卡牌模板表: 键名 = 模板键(创建时传入) */
export const card_LIB = {
    "斩击": {
        name: "斩击", power: 8, rare: 1, costAP: 1,
        upgrade: { power: 4 }, // 8 -> 12 (1.5倍, 类比尖塔打击 6->9)
        doSkill: ["skill_shared_attack"]
    },
    "持盾": {
        name: "持盾", power: 5, rare: 1, costAP: 1,
        upgrade: { power: 3 }, // 5 -> 8
        doSkill: ["skill_shared_defend"]
    },
    "攻防一体": {
        name: "攻防一体", power: 5, rare: 1, costAP: 2,
        upgrade: { power: 2 }, // 5 -> 7
        doSkill: ["skill_shared_attack", "skill_shared_defend"]
    },
    // ---------- 尖塔移植卡(2026-08-12) ----------
    "痛击": { // 尖塔 Bash: 2费 8伤+2易伤, 升级 10伤+3易伤
        name: "痛击", power: 8, rare: 1, costAP: 2,
        upgrade: { power: 2 }, // 8 -> 10
        doSkill: ["skill_card_bash"]
    },
    "剑柄打击": { // 尖塔 Pommel Strike: 1费 9伤+抽1, 升级 10伤+抽2(本项目升级只加伤害)
        name: "剑柄打击", power: 7, rare: 1, costAP: 1,
        upgrade: { power: 2 }, // 7 -> 9
        doSkill: ["skill_card_pommel"]
    },
    "全身撞击": { // 尖塔 Body Slam: 1费 伤害=当前格挡, 升级 0费
        name: "全身撞击", power: 0, rare: 1, costAP: 1,
        upgrade: { costAP: 1 }, // 1费 -> 0费
        doSkill: ["skill_card_bodySlam"]
    },
    // ---------- 状态卡(史莱姆推送, 2026-08-13) ----------
    // rare: "status" —— 不进 1/2/3 奖励池, 只能被怪物塞进牌组(回收/融合可提前消除)
    "粘液": { // 污染卡: 0费, 打出即销毁存档同UID(本场不进弃牌堆, 跨场永久摆脱)
        name: "粘液", power: 0, rare: "status", costAP: 0,
        exhaust: true,
        doSkill: ["skill_card_slime"]
    },
    "粘在一起的金币": { // 黄金史莱姆版: 3费, 打出得3金币并销毁存档同UID
        name: "粘在一起的金币", power: 0, rare: "status", costAP: 3,
        exhaust: true,
        doSkill: ["skill_card_goldSlime"]
    },
    "横扫": {
        name: "横扫", power: 3, rare: 2, costAP: 4,
        upgrade: { costAP: 1 }, // 4费 -> 3费
        doSkill: ["skill_card_sweep"]
    },
    "淬毒": {
        name: "淬毒", power: 1, rare: 1, costAP: 1,
        upgrade: { level: 1 }, // 毒等级/持续更长
        doSkill: ["skill_card_poison"]
    },
    "治愈之光": {
        name: "治愈之光", power: 3, rare: 1, costAP: 1,
        upgrade: { power: 1 }, // 3 -> 4 (原 2: level1 只回 1 血过弱, 弃牌循环下治疗卡价值上升)
        doSkill: ["skill_shared_heal"]
    },
    "快速充能": {
        name: "快速充能", power: 2, rare: 1, costAP: 0,
        upgrade: { power: 1 }, // 2 -> 3 (0费不能再减)
        doSkill: ["skill_card_energize"]
    },
    "强效呼吸": {
        name: "强效呼吸", power: 2, rare: 1, costAP: 1,
        upgrade: { power: 1 }, // 2 -> 3
        doSkill: ["skill_card_deepBreath"]
    },
    "小蛋糕": {
        name: "小蛋糕", power: 0, rare: 1, costAP: 1,
        upgrade: { level: 1 }, // 无数值技能, 仅占一次强化位
        doSkill: ["skill_card_feed"]
    },
    "不死图腾": {
        name: "不死图腾", power: 0, rare: 3, costAP: 5,
        exhaust: true, // 消耗(杀戮尖塔化): 打出后不进弃牌堆, 配合 totemCurse 销毁语义——本场战斗不再循环回归
        upgrade: { costAP: 1 }, // 5费 -> 4费
        doSkill: ["skill_card_totemCurse", "skill_card_totemBless"]
    },
    "狂乱的鸡尾酒": {
        name: "狂乱的鸡尾酒", power: 0, rare: 2, costAP: 2,
        upgrade: { level: 1 }, // 狂乱次数更多
        doSkill: ["skill_card_madCocktail"]
    },
    "代偿": {
        name: "代偿", power: 2, rare: 3, costAP: 3,
        upgrade: { level: 1 }, // 拦截伤害更高 (原 power1: 低等级拦截伤害过低, 机制卡基础值翻倍)
        doSkill: ["skill_card_compensation"]
    },
    "哎，大狗？": {
        name: "哎，大狗？", power: 5, rare: 2, costAP: 2,
        upgrade: { power: 2 }, // 5 -> 7
        exDate: { layer: 0 },
        doSkill: ["skill_card_dog"]
    },
    "贪婪之刃": {
        name: "贪婪之刃", power: 3, rare: 2, costAP: 2,
        upgrade: { power: 2 }, // 3 -> 5
        doSkill: ["skill_card_goldenAttack"]
    },
    "火焰新星": {
        name: "火焰新星", power: 4, rare: 3, costAP: 4,
        upgrade: { power: 2 }, // 4 -> 6
        doSkill: ["skill_card_fireNova"]
    },
    "模仿者": {
        name: "模仿者", power: 2, rare: 3, costAP: 3,
        upgrade: { costAP: 1 }, // 3费 -> 2费
        doSkill: ["skill_card_mimic"]
    },
    "衔尾蛇": {
        name: "衔尾蛇", power: 1, rare: 2, costAP: 3,
        upgrade: { costAP: 1 }, // 3费 -> 2费
        doSkill: ["skill_card_ouroboros", "skill_shared_attack"]
    },
    // ---------- BOSS 专属卡(rare3 + limit:"BOSS" —— 仅 BOSS 战奖励可刷, 需求.md 2026-08-16) ----------
    "不洁之血(融材)": {
        name: "不洁之血(融材)", power: 999, rare: 3, costAP: 5,
        limit: ["BOSS"],
        upgrade: { level: 1 }, // 纯融材, 数值不动
        doSkill: [] // 纯融材: 打出无事发生, 用于融合事件提供超高数值
    },
    "非欧立方": {
        name: "非欧立方", power: 10, rare: 3, costAP: 10,
        limit: ["BOSS"],
        upgrade: { costAP: 2 }, // 10费 -> 8费
        doSkill: ["skill_card_immortal", "skill_card_divinity"]
    },
    "启示录": {
        name: "启示录", power: 999, rare: 3, costAP: 8,
        limit: ["BOSS"],
        upgrade: { costAP: 1 }, // 8费 -> 7费
        doSkill: ["skill_card_exhaust", "skill_card_fireNova"]
    },
    // ---------- 老渔夫专属卡(rare3 + limit:"老渔夫" —— 仅 25 层老渔夫奖励可刷, 需求.md 2026-08-16) ----------
    "钓鱼佬的鱼竿": {
        name: "钓鱼佬的鱼竿", power: 5, rare: 3, costAP: 2,
        limit: ["老渔夫"],
        upgrade: { level: 1 }, // 数值不动(判定替代伤害, 强化无意义, 占位满足模板完整性)
        // 判定替代伤害: 按目标 rare 概率吊起(封怪成"扔出"卡), 失败造成15伤害(见 skill_card_fishingRod)
        doSkill: ["skill_card_fishingRod"]
    },
    // ---------- 尖塔移植卡(2026-08-13, 需求.md 素材) ----------
    "战吼": { // 尖塔 Warcry: 0费抽牌, 打出后消耗(简化版: 砍掉置顶, 纯化抽牌)
        name: "战吼", power: 2, rare: 1, costAP: 0,
        upgrade: { level: 1 }, // 抽1 -> 抽2(由技能按 level 判定)
        exhaust: true, // 消耗: 打出后不进弃牌堆, 本场不再循环
        doSkill: ["skill_card_warcry"]
    },
    "燃烧": { // 尖塔 Inflame: 本场战斗获得力量(注意: 尖塔"自燃"才是回合末灼烧, 勿混淆)
        name: "燃烧", power: 2, rare: 2, costAP: 1,
        upgrade: { power: 1 }, // 2 -> 3
        doSkill: ["skill_card_inflame"]
    },
    "重刃": { // 尖塔 Heavy Blade: 基础伤害 + 力量倍率
        name: "重刃", power: 14, rare: 2, costAP: 2,
        upgrade: { level: 1 }, // 力量倍率 2 -> 3(由技能按 level 判定)
        doSkill: ["skill_card_heavyBlade"]
    },
    // ---------- 球卡(失落引擎, rare:"orb" 不进任何抽取池, 由产球效果生成) ----------
    "闪电球": {
        name: "闪电球", power: 6, rare: "orb", costAP: 0,
        upgrade: { level: 1 }, // 数值占位(球由产球效果生成, 无强化途径)
        exhaust: true, // 打出即销毁(不进弃牌堆; 回合末未打出则被回收进弃牌堆)
        doSkill: ["skill_orb_lightning"]
    },
    "冰霜球": {
        name: "冰霜球", power: 8, rare: "orb", costAP: 0,
        upgrade: { level: 1 },
        exhaust: true,
        doSkill: ["skill_orb_frost"]
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
 * @param {boolean} [detail.upgraded]   - 创建即强化版(应用模板 upgrade, 名字带 +)
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
    let {
        name,
        level = 1,
        power,
        costAP,
        upgraded = false,
        exhaust,
        setDoSkill,
        doSkillAs,
        addDoSkill = []
    } = detail

    // 4. 确定最终名称
    let finalName = name || base.name

    // 5. 确定最终 power(显式传入则覆盖, 否则按等级缩放)
    let finalPower = (power !== undefined) ? power : base.power

    // 6. 确定最终 costAP(传入则覆盖, 否则沿用模板)
    let finalCost = (costAP !== undefined) ? costAP : base.costAP

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

    // 7.5 创建即强化版: 应用模板 upgrade 数值(名字加 "+")
    if (upgraded) {
        const up = base.upgrade || { level: 1 }
        finalPower += up.power || 0
        finalCost = Math.max(0, finalCost - (up.costAP || 0))
        level += up.level || 0
        finalName += "+"
    }

    // 7.6 确定最终 exhaust(detail 显式传入则覆盖模板——边界卡"无符合条件卡"用)
    const finalExhaust = (exhaust !== undefined) ? exhaust : base.exhaust

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
        rare: base.rare,
        limit: base.limit, // 来源白名单(专属卡限定的刷出来源; 融合卡等无模板实例缺省)
        exDate: base.exDate,
        exhaust: finalExhaust, // 消耗标记: 打出后不进弃牌堆(不死图腾等一次性卡)
        tplKey: nameKey, // 模板键: 强化查 upgrade 用(融合卡等无模板来源的实例缺省)
        upgraded
    }
}

/**
 * 强化一张卡牌(杀戮尖塔化: 每张卡仅可强化一次)
 * 规则:
 *   - 已强化(upgraded=true) -> 拒绝, 返回 false
 *   - 按 tplKey 查模板 upgrade 配置(旧存档无 tplKey 时回退按 name 查; 仍查不到则温和兜底 level+1)
 *   - 应用 power+/costAP-/level+ 数值, 标记 upgraded, 名字加 "+"
 * @param {Object} card - 卡牌实例(会被原地修改)
 * @returns {boolean} 是否强化成功
 */
export function upgradeCard(card) {
    if (!card || card.upgraded === true) return false

    // 查模板 upgrade 配置: 优先 tplKey(新卡), 回退 name(兼容旧存档), 都没有则兜底
    const tpl = card_LIB[card.tplKey] || card_LIB[card.name]
    const up = (tpl && tpl.upgrade) || { level: 1 }

    card.power = (card.power || 0) + (up.power || 0)
    card.costAP = Math.max(0, (card.costAP || 0) - (up.costAP || 0))
    card.level = (card.level || 1) + (up.level || 0)
    card.upgraded = true
    card.name = (card.name || "") + "+"
    return true
}

/**
 * 通用来源匹配判定(与具体表无关, 卡牌/遗物共用, 需求.md 2026-08-16)
 * 可用性规则(CL = 条目 limit, RL = 抽取方来源列表):
 *   - 看门人(池 require)  : 候选 CL 必须包含全部 required 项(无 limit 条目视为不含任何来源,
 *                           同样被拒)——如 require:["BOSS"] 让"七咒BOSS奖励"只出 BOSS 级内容
 *   - 无 limit(无限制)     : 由 allowCommon 决定(默认 true 可用)
 *   - 有 limit 且 RL 为空  : 不可用(无来源上下文时专属内容一律拒绝)
 *   - 双非严格(默认)       : CL 与 RL 交集非空即可用
 *   - 卡牌严格(条目 isStrict): 需 CL ⊆ RL(声明"只属于这些来源", 池必须全部接纳)
 *   - 卡池严格(池 isStrict): 需 RL ⊆ CL(池声明"只要这些来源", 候选必须完全覆盖)
 *   - 双严格                : 两个包含关系都满足(等价于 CL 与 RL 相等)
 * 注: require 是叠加在 RL 判定之上的附加约束(AND), 不能替代来源交集/严格检查
 * @param {Object} tpl - 条目模板(需含可选 limit / isStrict 字段)
 * @param {Array} RL - 抽取方来源列表(如 ["BOSS"] / ["七咒"] / ["老渔夫","BOSS"])
 * @param {Object} [opts]
 * @param {boolean} [opts.allowCommon=true] - 是否允许无限制条目进入
 * @param {boolean} [opts.poolStrict=false] - 卡池严格模式
 * @param {Array}  [opts.required=[]]       - 看门人: 候选 limit 必须包含的来源列表
 * @returns {boolean}
 */
export function isTplEligible(tpl, RL, {allowCommon = true, poolStrict = false, required = []} = {}) {
    if (!tpl) return false
    const CL = tpl.limit || []
    // 看门人: CL 必须包含全部 required 项(无 limit 条目 CL 为空, 同样被拒)
    if (required.length > 0 && !required.every(r => CL.includes(r))) return false
    if (CL.length === 0) return allowCommon // 无限制: 由 allowCommon 决定
    if (!RL || RL.length === 0) return false // 池无来源: 专属内容一律拒绝
    if (poolStrict && !RL.every(r => CL.includes(r))) return false // 池严格: RL ⊆ CL
    if (tpl.isStrict && !CL.every(c => RL.includes(c))) return false // 条目严格: CL ⊆ RL
    if (!poolStrict && !tpl.isStrict && !CL.some(c => RL.includes(c))) return false // 交集
    return true
}

/**
 * 判断一张卡模板在给定来源池(RL)下是否可用(需求.md 2026-08-16 匹配模式)
 * 规则详见 isTplEligible(卡牌/遗物共用同一套来源匹配机制)
 * @param {string} keyName - 卡牌模板键
 * @param {Array} RL - 抽取方来源列表(如 ["BOSS"] / ["七咒"] / ["老渔夫","BOSS"])
 * @param {Object} [opts] - 同 isTplEligible(allowCommon / poolStrict / required)
 * @returns {boolean}
 */
export function isCardEligible(keyName, RL, opts = {}) {
    return isTplEligible(card_LIB[keyName], RL, opts)
}

/** 边界卡名: 无符合条件者时生成的占位卡(带销毁诅咒=exhaust, 需求.md 2026-08-16) */
export const NO_MATCH_CARD_NAME = "无符合条件卡"

/**
 * 根据稀有度随机创建一张卡牌(需求.md 2026-08-16: 第一参数对象化)
 * @param {number|Object} rareOrCfg - 稀有度(数字兼容旧调用)或配置对象:
 * @param {number} rareOrCfg.rare          - 稀有度(必填)
 * @param {Array}  [rareOrCfg.limit=[]]    - 额外通行证: 当前环境的来源列表(RL)
 * @param {boolean}[rareOrCfg.allowCommon=true] - 是否允许无限制卡进入
 * @param {boolean}[rareOrCfg.isStrict=false]   - 卡池严格模式(RL ⊆ CL)
 * @param {Array}  [rareOrCfg.require=[]]  - 看门人: 候选卡 limit 必须包含的来源列表
 *                                           (如 require:["BOSS"] = 只出 BOSS 级卡, 普通专属卡被拒)
 * @param {*}      [rareOrCfg.usedWeight]  - 预留: 稀有度权重选择(普通/困难×预设四场景, 未定义用现有默认)
 * @param {Object} [detail={}] - 自定义配置参数, 透传给 createCard
 * @returns {Object} 卡牌实例; 无符合条件者时返回带销毁诅咒的"无符合条件卡"斩击
 */
export function createCardByRare(rareOrCfg, detail = {}) {
    const cfg = (typeof rareOrCfg === "object" && rareOrCfg !== null) ? rareOrCfg : {rare: rareOrCfg}
    const {
        rare,
        limit = [],
        allowCommon = true,
        isStrict = false,
        require = [],
        usedWeight // 预留接口(本次未消费, 数值维持各调用方默认; 四场景权重表见需求.md)
    } = cfg

    const pool = cardByRare[rare]
    if (!pool || pool.length === 0) {
        console.warn(`[createCardByRare] 稀有度 ${rare} 没有卡牌`)
        return createCard("斩击", {level: 1, name: NO_MATCH_CARD_NAME, exhaust: true})
    }

    // 过滤: 来源(RL)判定 + 看门人(require)双重约束
    const candidates = pool.filter(key => isCardEligible(key, limit, {allowCommon, poolStrict: isStrict, required: require}))
    if (candidates.length === 0) {
        console.warn(`[createCardByRare] 稀有度 ${rare} 在当前来源 [${limit.join(",")}] 下无符合条件卡`)
        return createCard("斩击", {level: 1, name: NO_MATCH_CARD_NAME, exhaust: true})
    }

    const keyName = candidates[Math.floor(Math.random() * candidates.length)]
    return createCard(keyName, detail)
}
