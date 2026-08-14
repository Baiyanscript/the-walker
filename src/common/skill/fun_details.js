// common/fun_details.js
/**
 * ============================================================
 * 描述库 detail_LIB + 描述获取函数
 * ============================================================
 * 职责: 为技能/效果生成"给人看的描述文本", 用于界面展示。
 * 技能的实际执行在 fun_skill.js, 此处只负责"说明它做了什么"。
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
    "skill_card_sweep": (source, SD) => {
        const sweepDamage = Math.ceil((source.power || 0) * (source.level || 1) * 0.5)
        if (SD) return `对目标造成${sweepDamage * 4}伤害(小伤害×4), 相邻怪物各受${sweepDamage}伤害(小伤害×1)`
        return `主目标${sweepDamage * 4}伤,相邻${sweepDamage}伤`
    },
    "skill_card_poison": (source, SD) => {
        const level = source.level || 1
        const poisonLevel = Math.max(1, Math.floor(level / 2))
        const duration = 3 + level
        if (SD) return `中毒${poisonLevel}级${duration}回合: 每回合开始扣除 等级×2 点真实伤害(无视护盾); 打出"快速充能"可解毒`
        return `中毒${poisonLevel}级${duration}回合`
    },
    "skill_card_deepBreath": (source, SD) => {
        const heal = Math.max((source.power || 0) * (source.level || 1), 1)
        if (SD) return `恢复${heal}点行动力且不受上限钳制(cap:Infinity), 超出部分保留至下一关`
        return `恢复${heal}AP,可突破上限`
    },
    "skill_card_feed": (source, SD) => {
        if (SD) return `将目标怪物下一回合行动置空(nextTurn=null), 跳过行动后重新掷; 仅对怪物有效`
        return `让目标怪物下一回合不行动`
    },
    "skill_card_totemCurse": () => {
        return `打出后销毁牌库中的本卡(一次性)`
    },
    "skill_card_totemBless": () => {
        return `超越生死(一次性)`
    },
    "effect_blessing": (eff, o, SD) => {
        if (SD) return `超越生死: 死亡时恢复到 maxHP×1.25(向下取整, 允许溢血), 触发即销毁; 重复挂载不叠层`
        return `超越生死`
    },
    "skill_card_madCocktail": (source, SD) => {
        const restTurn = Math.min(Math.max((source.level || 1) - 2, 1), 3)
        if (SD) return `狂乱${restTurn}次: 目标每次行动时攻击随机单位(含友军与玩家), 次数用尽移除; 可被"快速充能"清除`
        return `狂乱${restTurn}次:行动目标随机`
    },
    "effect_madness": (eff, o, SD) => {
        if (SD) return `狂乱: 行动目标重定向为随机单位(含友军与玩家); 剩余${eff.restTurn ?? 0}次, 用尽移除; 可被解毒清除`
        return `狂乱: 剩余${eff.restTurn ?? 0}`
    },
    "skill_card_compensation": (s,SD) => {
        if (SD) return `获得代偿buff: 拦截下一次出牌, 并将其替换成 power=(costAP与power与level三者各自与1取最大值后相乘) 的斩击`
        return `拦截下一次出牌并造成巨额伤害`
    },
    "effect_compensation": (eff,o,s) => {
        if (s) return `拦截下一次出牌, 并将其替换成 power=(costAP与power与level三者各自与1取最大值后相乘) 的斩击`
        return `代偿(lv.${eff.level || 1})`
    },
    "effect_return": (eff, o, SD) => {
        if (SD) return `下回合开始时, 把借走的卡从弃牌堆移回手牌(一次性; 战斗结束未触发则失效)`
        return `下回合回归手牌`
    },
    "skill_card_dog": (source, SD) => {
        const layer = (source.exDate && source.exDate.layer) || 0
        if (SD) return `层数${layer}: 打出层数+1; 层数1/2/3分别50%/75%/100%变身"叫!!"横扫卡(仅进手牌, 本局临时); 未变身则返还, 下回合回归手牌继续叠层`
        return `层数${layer}:请叫叫`
    },
    "skill_mob_dog": (source, SD) => {
        const layer = (source.exDate && source.exDate.layer) || 0
        if (SD) return `层数${layer}: 层数1-4分别25%/50%/75%/100%爆发——power×层数、叠层清零、下回合强攻并获得level护盾; 否则成长: 层数+1并获得power×2护盾`
        return `层数${layer}·请叫叫`
    },
    "skill_card_energize": (source,SD) => {
        const heal = Math.max((source.power || 0) * (source.level || 1), 1)
        if (SD) return `恢复${heal}AP,并消除 中毒 狂乱 效果`
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
    "skill_mob_steal": (source,SD) => {
        if (SD) return `偷取10金币并攻击; 金币不足时狂暴(power×3, 改名"愤怒的强盗")`
        return `偷10金币并攻击;不足时狂暴`
    },
    "skill_mob_summonScapegoat": (s,SD) => {
        if (SD) return `向场上召唤一只 level+2 的怪物(本回合不行动), 并携带"替罪羊"buff \n 替罪羊buff: 当玩家出牌时, 攻击目标将优先锁定拥有本buff者`
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
    "skill_card_bash": (source, SD) => {
        const damage = Math.max((source.power || 0) * (source.level || 1), 0)
        if (SD) return `造成${damage}点伤害, 并给予目标 2 层易伤(受击伤害翻倍, 持续2回合) \n 易伤: 受到伤害时追加 floor(伤害×0.5×层数)`
        return `${damage}伤害+2层易伤`
    },
    "skill_card_pommel": (source, SD) => {
        const damage = Math.max((source.power || 0) * (source.level || 1), 0)
        if (SD) return `造成${damage}点伤害, 抽 1 张牌(从战斗内抽牌堆, 空则洗弃牌堆; 手牌满则不抽)`
        return `${damage}伤害+抽1张`
    },
    "skill_card_bodySlam": (source, SD) => {
        if (SD) return `造成当前护盾值 × level 的伤害(护盾每回合清空, 需当回合先叠盾)`
        return `伤害=当前护盾×等级`
    },
    "skill_card_slime": (source, SD) => {
        if (SD) return `粘液(状态卡): 打出即销毁存档中同UID的卡——本场不再出现(exhaust), 跨场永久摆脱`
        return `打出后销毁(粘液)`
    },
    "skill_card_goldSlime": (source, SD) => {
        if (SD) return `粘在一起的金币(状态卡): 打出获得3金币, 并销毁存档中同UID的卡(跨场永久摆脱)`
        return `得3金币, 打出后销毁`
    },
    "skill_mob_slimeAttack": (source, SD) => {
        const dmg = Math.max((source.power || 0) * (source.level || 1), 0)
        if (SD) return `造成${dmg}点伤害, 并向玩家牌组推送1张"粘液"(0费, 打出才能摆脱)`
        return `攻击并推送粘液`
    },
    "skill_mob_goldSlimeAttack": (source, SD) => {
        const dmg = Math.max((source.power || 0) * (source.level || 1), 0)
        if (SD) return `造成${dmg}点伤害, 并向玩家牌组推送1张"粘在一起的金币"(3费, 打出得3金币)`
        return `攻击并推送金币粘液`
    },
    "skill_card_exhaust": (source, SD) => {
        if (SD) return `AP归零(含maxAP提升部分), 并获得1回合虚弱buff(下回合AP不重置)`
        return `力竭: AP归零并获得虚弱`
    },
    "skill_card_fishingRod": (source, SD) => {
        if (SD) return `判定替代伤害: 按目标稀有度概率吊起(rare1/2/3=100%/75%/50%, BOSS不可钓), 成功将怪物封印为"扔出"卡进牌组, 失败造成15点伤害`
        return `钓鱼佬的鱼竿: 吊起或15伤`
    },
    "skill_card_thrownMob": (source, SD) => {
        const hp = source && source.exDate && source.exDate.mobData ? source.exDate.mobData.HP : 0
        if (SD) return `扔出: 对目标造成怪物当前血量/3(${Math.floor(hp / 3)})伤害, 数据内怪物受20伤, 存活则回归战场; 打出后销毁`
        return `扔出·${hp > 0 ? "怪物" : ""}`
    },
    "skill_card_warcry": (source, SD) => {
        const draw = Math.max(source.level || 1, 1)
        if (SD) return `战吼: 抽 ${draw} 张牌(从战斗内抽牌堆, 空则洗弃牌堆; 手牌上限内); 本卡打出后消耗`
        return `抽${draw}张(消耗)`
    },
    "skill_card_inflame": (source, SD) => {
        const str = source.level || 1
        if (SD) return `燃烧: 本场战斗获得 ${str} 点力量(power+${str}, 不跨战斗保留)`
        return `本场力量+${str}`
    },
    "skill_card_heavyBlade": (source, SD) => {
        const base = source.power || 0
        const mult = Math.max(source.level || 1, 1)
        if (SD) return `重刃: 造成 ${base} 点基础伤害 + 当前力量×${mult}(升级提高倍率)`
        return `${base}伤+力量×${mult}`
    },

    // -------- 效果 --------
    "effect_toxin": (eff, o, SD) => {
        const lv = eff.level || 1
        const turn = eff.restTurn ?? 0
        if (SD) return `毒lv.${lv}, 持续${turn}: 每回合开始扣 lv×2 真实伤害(无视护盾); 可被"快速充能"解毒清除`
        return `毒lv.${lv}, 持续${turn}`
    },
    "effect_revive": (e,o,s) => {
        if (s) return `死亡时释放一只愤怒的骷髅鱼(HP1, 攻击/无行动循环)`
        return `死变骷髅`
    },
    "effect_embedCard": (eff, owner, SD) => {
        if (SD) return `蕴含卡牌: 死亡时以本体为使用者对目标打出${eff.exDate && eff.exDate.card ? eff.exDate.card.name : "基础斩击"}`
        return `死亡时打出蕴含卡牌`
    },
    "effect_fishermanSpirit": (eff, owner, SD) => {
        if (SD) return `不屈的钓鱼佬: 玩家出牌目标为自己时, 创建空靶子替换为使用对象(免疫玩家直接攻击)`
        return `不屈的钓鱼佬`
    },
    "skill_mob_fishCast": (source, SD) => {
        if (SD) return `钓鱼: 向怪物组添加 2~4 只腐烂的鱼(携带蕴含卡牌, 死亡时打出基础斩击)`
        return `钓鱼`
    },
    "skill_mob_fishHand": (source, SD) => {
        if (SD) return `钓牌: 随机钓走玩家手牌 1~3 张(至少保留1张), 制造空靶子携带, 死亡时打出被钓的卡`
        return `钓牌`
    },
    "skill_shared_idle": () => {
        return `无行动`
    },
    "effect_goldDrop": (eff, o, SD) => {
        const lv = eff.level || 1
        if (SD) return `死亡时给予玩家 ${lv * 20} 金币(level×20)`
        return `死掉${lv * 20}金币`
    },
    "effect_slimeSplit": (eff, o, SD) => {
        if (SD) return `死亡时分裂成两只史莱姆(等级 = max(1, 本体等级-1))`
        return `死亡时分裂成两只史莱姆`
    },
    "effect_weakness": (eff, o, SD) => {
        const turn = eff.restTurn ?? 0
        if (SD) return `虚弱: 回合结算时把AP覆盖回结算前值, 等效"本次AP回满未发生"; 持续${turn}`
        return `虚弱: AP不重置, 持续${turn}`
    },
    "skill_mob_weakness": () => {
        return `AP不重置(1回合)`
    },
    "skill_mob_anger": (source, SD) => {
        if (SD) return `生气: 本战斗内 power 永久+2, 可叠加`
        return `生气: power永久+2`
    },
    "skill_mob_charge": (source, SD) => {
        const dmg = Math.ceil((source.power || 0) * (source.level || 1) * 1.5)
        if (SD) return `蛮牛冲撞: 造成 ${dmg} 点伤害(power×level×1.5)`
        return `冲撞: ${dmg}伤`
    },
    "skill_mob_bigBoom": (source, SD) => {
        const dmg = 20 * (source.level || 1)
        if (SD) return `终极大爆炸: 造成固定 ${dmg} 点伤害(不乘 power, 蓄力后的大招)`
        return `大爆炸: ${dmg}伤`
    },
    "skill_mob_harden": (source, SD) => {
        const dmg = Math.max((source.power || 0) * (source.level || 1), 0)
        const shield = (source.level || 1) * 10
        if (SD) return `硬化打击: 造成 ${dmg} 点伤害, 并给自己加 ${shield} 点护盾`
        return `硬化: ${dmg}伤+${shield}盾`
    },
    "skill_mob_doubleHit": (source, SD) => {
        const per = Math.ceil((source.power || 0) * (source.level || 1) * 0.75)
        if (SD) return `双击: 造成两段伤害, 每段 ${per} 点(共 ${per * 2})`
        return `双击: ${per}×2伤`
    },
    "skill_mob_boost": (source, SD) => {
        const shield = (source.level || 1) * 10
        if (SD) return `强化: power+2 且获得 ${shield} 点护盾(力量累积, 越打越疼)`
        return `强化: power+2, 盾${shield}`
    },
    "skill_mob_hyperBeam": (source, SD) => {
        const dmg = Math.ceil((source.power || 0) * (source.level || 1) * 2.5)
        if (SD) return `超能光束: 单发大伤害 ${dmg} 点(power×level×2.5)`
        return `光束: ${dmg}伤`
    },
    "skill_mob_protectBeam": (source, SD) => {
        const shield = (source.level || 1) * 10
        if (SD) return `保护光束: 给铜制机械人偶加 ${shield} 点护盾(无主人则加自己)`
        return `保护: 给BOSS盾${shield}`
    },
    "skill_mob_summonOrb": (source, SD) => {
        if (SD) return `召唤 2 只铜球(等级=本体+2, 本回合不行动)`
        return `召唤2铜球`
    },
    "skill_orb_lightning": (source, SD) => {
        const dmg = (source.power || 0) * (source.level || 1)
        if (SD) return `闪电球: 手牌中球数>2时打出, 连携所有球——本球对目标造成 ${dmg} 点伤害`
        return `闪电球: 三消触发${dmg}伤`
    },
    "skill_orb_frost": (source, SD) => {
        const shield = Math.ceil((source.power || 0) * (source.level || 1))
        if (SD) return `冰霜球: 手牌中球数>2时打出, 连携所有球——本球获得 ${shield} 点护盾`
        return `冰霜球: 三消触发${shield}盾`
    },
    "effect_orbGenerator": (eff, o, SD) => {
        if (SD) return `失落引擎: 出牌时按费用产球(0费→0球, 1~4费→1球, >4费→2球, 随机球种)直接进手牌, 本回合可打出; 球不进存档, 未打出的球回合末进弃牌堆`
        return `出牌产球入手`
    },
    "effect_relic_copperCore": (eff, o, SD) => {
        if (SD) return `遗物·铜制核心(铜制机械人偶的残片): 每场战斗开始时召唤 1 只铜球, 永久生效`
        return `遗物·铜制核心`
    },
    "effect_gremlinNob": (eff, owner, SD) => {
        if (SD) return `激怒: 玩家任意出牌时, 本怪 power+1(本场战斗可叠加)`
        return `激怒`
    },
    "effect_learnSkills": (e,o,s) => {
        if (s) return `当玩家行动时, 将会学习卡牌的技能组作为自己的可用技能 \n 打出已学会的技能时: 恢复25×level血量 \n 黑名单技能(无法学习的): 恢复50×level血量, 均额外power+2`
        return `是啊，看什么？` // 需求: 显示 buff 名即可
    },
    "effect_deathReturn": (eff, o, SD) => {
        if (SD) return `死亡返还: 玩家死亡时本卡从弃牌堆移除并回归手牌(一次性); 战斗结束未触发则自动失效`
        return `死亡返还`
    },
    "effect_divinity": (eff, owner, SD) => {
        if (SD) return `神格(对局常驻): \n 1.出牌 power+2 level+2 \n 2.当死亡时,销毁本buff并将生命回复至最大生命值的两倍 \n 此石永存,汝即为不朽`
        return `神格`
    },
    "effect_scapegoat":(eff,owner,s) =>{
        if (s) return `当玩家出牌时,将会篡改攻击目标至其本身`

        return `代替被攻击者`
    },

    // -------- 遗物效果(杀戮尖塔化) --------
    "effect_relic_burningBlood": (eff, o, SD) => {
        const heal = 6 * (eff.level || 1)
        if (SD) return `遗物·燃烧之血: 战斗结束时恢复 ${heal} 点生命(封顶最大生命), 永久生效`
        return `遗物·燃烧之血`
    },
    "effect_relic_vajra": (eff, o, SD) => {
        if (SD) return `遗物·金刚杵: 出牌时本次出牌 power+1(伤害随之增加), 永久生效`
        return `遗物·金刚杵`
    },
    "effect_relic_lantern": (eff, o, SD) => {
        if (SD) return `遗物·灯笼: 每场战斗首回合行动点 +1, 永久生效`
        return `遗物·灯笼`
    },
    "effect_relic_anchor": (eff, o, SD) => {
        if (SD) return `遗物·船锚: 每场战斗首回合获得 10 点护盾, 永久生效`
        return `遗物·船锚`
    },
    "effect_relic_happyFlower": (eff, o, SD) => {
        if (SD) return `遗物·开心花: 每 3 个回合行动点 +1, 永久生效`
        return `遗物·开心花`
    },
    "effect_relic_poisonBottle": (eff, o, SD) => {
        if (SD) return `遗物·毒瓶: 每场战斗开始时随机一名敌人中毒(3回合), 永久生效`
        return `遗物·毒瓶`
    },
    "effect_relic_sundial": (eff, o, SD) => {
        if (SD) return `遗物·日晷: 每洗牌 3 次, 行动点 +2(可突破上限), 永久生效`
        return `遗物·日晷`
    },
    "effect_relic_paperKrane": (eff, o, SD) => {
        if (SD) return `遗物·纸鹤: 攻击带有易伤的敌人时, 伤害数值 ×1.5, 永久生效`
        return `遗物·纸鹤`
    },
    "effect_relic_bagOfPrep": (eff, o, SD) => {
        if (SD) return `遗物·准备背包: 每场战斗开始时额外抽 2 张牌(手牌上限内), 永久生效`
        return `遗物·准备背包`
    },
    "effect_relic_gremlinHorn": (eff, o, SD) => {
        if (SD) return `遗物·地精之角: 每当有敌人死亡, 行动点+1(可突破上限)并抽 1 张牌, 永久生效`
        return `遗物·地精之角`
    },
    "effect_relic_shuriken": (eff, o, SD) => {
        if (SD) return `遗物·手里剑: 每回合打出第 3 张攻击牌时, 本场战斗 power+1(计数每回合清零), 永久生效`
        return `遗物·手里剑`
    },
    "effect_relic_mercuryHourglass": (eff, o, SD) => {
        if (SD) return `遗物·水银沙漏: 回合开始时对所有敌人造成 3×level 点伤害(固定值), 永久生效`
        return `遗物·水银沙漏`
    },
    "effect_relic_golemHeart": (eff, o, SD) => {
        if (SD) return `遗物·魔像之心(戒指槽): 回合开始时, 无护盾则获得20点护盾, 已有护盾则仅获得4点`
        return `遗物·魔像之心`
    },
    "effect_relic_leafOfRevival": (eff, o, SD) => {
        if (SD) return `遗物·复苏之叶(戒指槽): 每次出牌恢复2点生命(封顶上限); 每回合额外1点行动力(可突破上限)`
        return `遗物·复苏之叶`
    },

    // -------- 尖塔移植效果 --------
    "effect_vulnerable": (eff, o, SD) => {
        const lv = eff.level || 1
        const turn = eff.restTurn ?? 0
        if (SD) return `易伤: 受击追加 floor(伤害×0.5×层数) 真实伤害(吃护盾前结算); 每回合-1层归零移除; 追加伤害不再触发易伤(防递归)`
        return `易伤: 受击+${lv * 50}%, 持续${turn}回合`
    },
    "effect_ritual": (eff, o, SD) => {
        if (SD) return `仪式: 每回合开始时 power 永久+${eff.level || 1}, 本战斗内叠加`
        return `仪式: 每回合威力+${eff.level || 1}`
    },
    "effect_eliteSplit": (eff, o, SD) => {
        if (SD) return `残血分裂: 受到伤害后生命低于一半时, 分裂为 2 只史莱姆, 本体退场(仅一次)`
        return `残血分裂`
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
