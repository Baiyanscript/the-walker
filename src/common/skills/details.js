// common/skills/details.js
/**
 * ============================================================
 * 描述库 detail_LIB + 描述获取函数
 * ============================================================
 * 职责: 为技能/效果生成"给人看的描述文本", 用于界面展示。
 * 技能的实际执行在 skills/skills.js, 此处只负责"说明它做了什么"。
 *
 * 注意: detail_LIB 的键必须与 skill_LIB / effect_LIB 的键一一对应,
 * 新增技能/效果时如忘记写描述, getSkillDetail 会输出警告。
 */

export const detail_LIB = {
    // -------- 通用基础技能 --------
    "skill_shared_attack": (source) => {
        const damage = Math.max((source.power || 0) * (source.level || 1), 0)
        return `造成${damage}点伤害`
    },
    "skill_shared_defend": (source) => {
        const shield = Math.ceil((source.power || 0) * (source.level || 1) * 1.2)
        return `获得${shield}点护盾`
    },
    "skill_shared_heal": (source) => {
        const heal = Math.ceil((source.power || 0) * (source.level || 1) * 0.6)
        return `恢复${heal}点生命`
    },
    "skill_shared_superDefend": (source) => {
        const shield = Math.ceil((source.power || 0) * (source.level || 1) * 3)
        return `获得盾 ${shield} 点`
    },
    "skill_shared_boom": (source) => {
        const damage = 5 + (source.power || 0) * (source.level || 1) * 3
        return `造成${damage}伤害后死亡`
    },

    // -------- 卡牌专属技能 --------
    "skill_card_sweep": (source) => {
        const sweepDamage = Math.ceil((source.power || 0) * (source.level || 1) * 0.5)
        return `造成${sweepDamage * 2}伤害,相邻${sweepDamage}伤害`
    },
    "skill_card_poison": (source) => {
        const level = source.level || 1
        const poisonLevel = Math.max(1, Math.floor(level / 2))
        const duration = 3 + level
        return `中毒${poisonLevel}级${duration}回合`
    },
    "skill_card_deepBreath": (source) => {
        const heal = Math.max(1, Math.ceil((source.power || 0) * (source.level || 1)))
        return `恢复 ${heal} 点行动力(可突破上限)`
    },
    "skill_card_feed": () => {
        return `让目标怪物下一回合不行动`
    },
    "skill_card_totemCurse": () => {
        return `打出后销毁牌库中的本卡(一次性)`
    },
    "skill_card_totemBless": () => {
        return `超越生死(一次性)`
    },
    "effect_blessing": () => {
        return `超越生死`
    },
    "skill_card_madCocktail": (source) => {
        const restTurn = Math.min(Math.max((source.level || 1) - 2, 1), 3)
        return `狂乱${restTurn}次:行动目标随机`
    },
    "effect_madness": (eff) => {
        return `狂乱: 剩余${eff.restTurn ?? 0}`
    },
    "skill_card_compensation": (s,sd) => {
        if (sd) return `获得代偿buff:拦截下一次出牌,并将其替换成power为(costAP,power,level)与1取中最大值后再相乘的斩击`
        return `拦截下一次出牌并造成巨额伤害`
    },
    "effect_compensation": (eff,o,s) => {
        if (s) return `拦截下一次出牌,并将其替换成power为(costAP,power,level)与1取中最大值后再相乘的斩击`
        return `代偿(lv.${eff.level || 1})`
    },
    "effect_return": (eff) => {
        return `给予卡牌`
    },
    "skill_card_dog": (source) => {
        const layer = (source.exDate && source.exDate.layer) || 0
        return `层数${layer}:请叫叫`
    },
    "skill_mob_dog": () => {
        return `请叫叫`
    },
    "skill_card_energize": (source,sd) => {
        const heal = Math.max(1, Math.ceil((source.power || 0) * (source.level || 1)))
        if (sd) return `恢复${heal}AP,并消除 中毒 狂乱 效果`
        return `恢复${heal}AP,解毒`
    },
    "skill_card_goldenAttack": (source) => {
        const dmg = Math.max((source.power || 0) * (source.level || 1), 0)
        return `${dmg}伤害,获得折半金币`
    },
    "skill_mob_goldAttack": (source) => {
        const dmg = Math.max((source.power || 0) * (source.level || 1), 0)
        return `${dmg}伤害与等量金币`
    },
    "skill_mob_steal": (source,sd) => {
        if (sd) `偷取10旧版;金币不足时本怪物power*3`
        return `偷取10金币;不足时伤害增加`
    },
    "skill_mob_summonScapegoat": (s,sd) => {
        if (sd) return `随机向牌组中输出一张 level较本体+2的怪物,同时拥有"替罪羊"buff \n 替罪羊buff:当玩家出牌时,攻击目标将优先锁定拥有本buff者`
        return `我不搬你们看什么？` // 需求: detail 只显示技能名
    },
    "skill_card_fireNova": (source) => {
        const damage = Math.ceil((source.power || 0) * (source.level || 1) * 1.5)
        return `全体${damage}伤害`
    },
    "skill_card_mimic": (source ,SD) => {
        if(SD) return `复制目标技能并产生一张0费卡 power,level分别取本卡牌或目标中较高者`
        return `复制目标技能`
    },
    "skill_card_ouroboros": (source , SD) => {
        if (SD) return `本存档内power参数永久+1,并在下回合回归可出牌组`
        return `倍率永久+1,下回合回归`
    },
    "skill_card_immortal": (source, SD) => {
        if (SD) return `当玩家死亡时,本卡牌回归`
        return `不灭`
    },
    "skill_card_divinity": (source, SD) => {
        if (SD) return `神格buff: \n 1.当你死亡时,销毁本buff并恢复到最大生命值的两倍 \n 2.任意出牌 其最终power和level都将提升`
        return `获得"神格"`
    },
    "skill_card_exhaust": (source, SD) => {
        if (SD) return `虚弱buff : \n 下回合AP不重置`
        return `力竭: AP归零并获得虚弱`
    },

    // -------- 效果 --------
    "effect_toxin": (eff) => {
        const lv = eff.level || 1
        const turn = eff.restTurn ?? 0
        return `毒lv.${lv}, 持续${turn}`
    },
    "effect_revive": (e,o,s) => {
        if (s) return `好笑吗？打死他你将获得一只愤怒的骷髅`
        return `死变骷髅`
    },
    "effect_goldDrop": (eff) => {
        const lv = eff.level || 1
        return `死掉${lv * 20}金币`
    },
    "effect_slimeSplit": () => {
        return `死亡时分裂成两只史莱姆`
    },
    "effect_weakness": (eff) => {
        const turn = eff.restTurn ?? 0
        return `虚弱: AP不重置, 持续${turn}`
    },
    "skill_mob_weakness": () => {
        return `AP不重置(1回合)`
    },
    "effect_learnSkills": (e,o,s) => {
        if (s) return `当玩家行动时,将会学习卡牌的技能组作为自己的可用技能,当打出已学会的技能时将会恢复血量`
        return `是啊，看什么？` // 需求: 显示 buff 名即可
    },
    "effect_deathReturn": () => {
        return `死亡返还`
    },
    "effect_divinity": (eff, owner, SD) => {
        if (SD) return `神格(对局常驻): \n 1.出牌 power+2 level+2 \n 2.当死亡时,销毁本buff并将生命回复至最大生命值的两倍 \n 此石永存,汝即为不朽`
        return `神格`
    },
    "effect_scapegoat":(eff,owner,s) =>{
        if (s) return `当玩家出牌时,将会篡改攻击目标至其本身`

        return `代替被攻击者`
    }
}

/**
 * 获取某个技能键的描述文本
 * @param {string} skillKey - skill_LIB 中的键名
 * @param {Object} source   - 数值来源(卡牌/怪物实例), 用于按当前数值计算
 * @param {boolean} [SD=false] - 超级详情模式(仅 detail.ux 传入 true):
 *   生成器签名 (source, SD); SD=true 时生成器可输出技术说明级文案
 *   (参数公式/触发机制/边界限制等, 弥补 velaJS 无法打印函数源码的缺口);
 *   未编写 SD 分支的生成器自然回退到普通文案(忽略 SD 参数)。
 * @returns {string|null} 描述文本, 未定义则返回 null
 */
export function getSkillDetail(skillKey, source, SD = false) {
    if (!detail_LIB.hasOwnProperty(skillKey)) {
        console.warn('[getSkillDetail]', skillKey, '没有设定detail值')
        return null
    }
    const generator = detail_LIB[skillKey]
    if (typeof generator !== 'function') {
        console.warn('[getSkillDetail]', generator, '似乎出问题了 使用的key:', skillKey)
        return null
    }
    try {
        return generator(source, SD)
    } catch (e) {
        console.warn(`[getSkillDetail] 技能"${skillKey}"执行失败:`, e)
        return null
    }
}

/**
 * 获取某个效果对象的描述文本
 * @param {Object} effect - 效果本身 {key, restTurn, level}
 * @param {Object} owner  - 效果持有者(复杂计算时用)
 * @param {boolean} [SD=false] - 超级详情模式(仅 detail.ux 传入 true), 语义同 getSkillDetail
 * @returns {string|null} 描述文本, 未定义则返回 null
 */
export function getEffectDetail(effect, owner, SD = false) {
    const effectKey = effect.key
    if (!detail_LIB.hasOwnProperty(effectKey)) {
        console.warn('[getEffectDetail]', effectKey, '没有设定detail输出')
        return null
    }
    const generator = detail_LIB[effectKey]
    if (typeof generator !== 'function') {
        console.warn('[getEffectDetail] 函数:', generator, '似乎出问题了 使用的key:', effectKey)
        return null
    }
    try {
        return generator(effect, owner, SD)
    } catch (e) {
        console.warn(`[getEffectDetail] 效果"${effectKey}"执行失败:`, e)
        return null
    }
}

/**
 * 得到一张卡片的全部详细信息, 用于界面展示
 * @param {Object} card - 卡牌实例
 * @returns {string} 格式化描述
 */
export function getCardDetail(card) {
    let detail = card.name + '\n|消耗:' + card.costAP + ' lv.' + card.level + '|\n'
    const list = card.doSkill || []

    let listTxt = ''
    for (let i = 0; i < list.length; i++) {
        const temp = getSkillDetail(list[i], card)
        if (temp) listTxt += '|' + temp + '|\n'
    }
    if (!listTxt) listTxt = '|无信息|'
    return detail + listTxt
}

/**
 * 获取怪物的详细信息, 用于界面展示
 * @param {Object} mob - 怪物实例
 * @returns {string} 格式化描述
 */
export function getMobDetail(mob) {
    let result = mob.name + 'lv.' + (mob.level || 1) + '\n'
    result += 'HP:' + (mob.HP || 0) + ' DP:' + (mob.DP || 0) + '\n'

    const nextKey = mob.nextTurn
    let txt = ''
    if (!nextKey) {
        txt = '|无行动|\n'
    } else {
        txt = `|${getSkillDetail(nextKey, mob)}|\n`
    }

    const effL = mob.effect
    for (let i = 0; i < effL.length; i++) {
        const temp = getEffectDetail(effL[i], mob)
        if (temp) txt += '[' + temp + ']\n'
    }

    return result + txt
}
