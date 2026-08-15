// smoke23: 老渔夫 BOSS 全家桶(需求.md 2026-08-13 新BOSS)——蕴含卡牌/钓鱼/钓牌/不屈的钓鱼佬/死变骷髅修正
import assert from "node:assert/strict"
import { createCard, cardByRare } from "./.cache/esm/common/data/cards.mjs"
import { createMob, mobByRare, rollNextTurn } from "./.cache/esm/common/data/mobs.mjs"
import { buildSkillCtx, runSkill } from "./.cache/esm/common/core/core_skill.mjs"
import { fireEffect, addEffect } from "./.cache/esm/common/core/core_effect.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}
const mkPlayer = () => ({ HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [], relics: [], goldNum: 50 })
// 空靶子主题名(钓牌/不屈的钓鱼佬共用, 2026-08-13 命名)
const DUMMY_NAME = "只有大鱼才能让钓鱼佬心服口服"
const mkCtx = (over = {}) => buildSkillCtx({
  source: over.source, actor: over.actor, target: over.target || mkPlayer(),
  playerInfo: over.playerInfo || mkPlayer(), mobList: over.mobList || [],
  handPool: over.handPool || [], drawPool: over.drawPool || [],
  battlePool: over.battlePool || [], discardPool: over.discardPool || []
})

console.log("== 老渔夫模板 ==")
check("老渔夫: HP300 power5 BOSS, 4技能循环", () => {
  const m = createMob("老渔夫", { level: 1 })
  assert.equal(m.HP, 300)
  assert.equal(m.power, 5)
  assert.equal(m.rare, "BOSS")
  assert.deepEqual(m.act, ["skill_mob_fishCast", "skill_shared_heal", "skill_mob_fishHand", "skill_shared_superDefend"])
  assert.ok(m.effect.some(e => e.key === "effect_fishermanSpirit"))
})
check("腐烂的鱼: rare3 进普通池, 自带蕴含卡牌", () => {
  const m = createMob("腐烂的鱼", { level: 1 })
  assert.equal(m.rare, 3)
  assert.equal(m.power, 1)
  assert.deepEqual(m.act, ["skill_shared_attack", "skill_shared_heal"])
  assert.ok(m.effect.some(e => e.key === "effect_embedCard"))
  assert.ok(mobByRare[3].some(e => e.key === "腐烂的鱼"), "腐烂的鱼应在 rare3 随机池")
})
check("空靶子/愤怒的骷髅鱼不设模板(硬编码魔改)", () => {
  assert.equal(createMob("空靶子"), null)
  assert.equal(createMob("愤怒的骷髅鱼"), null)
  // 硬编码魔改产物: 基于史莱姆/哥布林
})

console.log("== 蕴含卡牌: 死亡时以本体为使用者对 T 打出 C ==")
check("鱼死 -> 对老渔夫打出基础斩击(8伤), 斩击销毁不进弃牌堆", () => {
  const player = mkPlayer()
  const boss = createMob("老渔夫", { level: 1 }) // HP 300
  const fish = createMob("腐烂的鱼", { level: 1 })
  const mobList = [boss, fish]
  const discardPool = []
  // 模拟钓鱼召唤: 鱼模板自带蕴含卡牌, 技能硬编码覆盖 exDate T=老渔夫, C=基础斩击(exhaust)
  const embedCard = createCard("斩击", { level: Math.max((boss.level || 1) - 2, 1) })
  embedCard.exhaust = true
  const embed = fish.effect.find(e => e.key === "effect_embedCard")
  assert.ok(embed, "腐烂的鱼应自带蕴含卡牌")
  embed.exDate = { card: embedCard, target: boss }
  // 打死鱼
  fish.HP = 0
  fireEffect({
    trigger: "when_death", targets: fish, mobList, playerInfo: player,
    handPool: [], discardPool, battlePool: [], drawPool: []
  })
  // 斩击 level1 power8 -> 老渔夫 300-8=292
  assert.equal(boss.HP, 292)
  // exhaust 卡销毁: 不进弃牌堆
  assert.equal(discardPool.length, 0)
})
check("蕴含卡牌缺省: T=玩家, C=基础斩击(模板默认)", () => {
  const player = mkPlayer()
  const fish = createMob("腐烂的鱼", { level: 3 })
  const mobList = [fish]
  fish.HP = 0
  fireEffect({ trigger: "when_death", targets: fish, mobList, playerInfo: player, handPool: [], discardPool: [], battlePool: [], drawPool: [] })
  // 默认斩击 level=max(3-2,1)=1, 打玩家 8 伤
  assert.equal(player.HP, 92)
})
check("蕴含卡牌: 普通卡释放后进弃牌堆(可洗回)", () => {
  const player = mkPlayer()
  const boss = createMob("老渔夫", { level: 1 })
  const dummy = createMob("史莱姆", { name: DUMMY_NAME, HP: 1, level: 1, setAct: [] })
  const mobList = [boss, dummy]
  const discardPool = []
  // 钓牌: 空靶子携带被钓的玩家卡副本(普通斩击, 无 exhaust)
  const stolen = createCard("斩击", { level: 1 })
  addEffect(dummy, { key: "effect_embedCard", restTurn: "inf", level: 1, isRemove: false, exDate: { card: stolen, target: boss } })
  dummy.HP = 0
  fireEffect({
    trigger: "when_death", targets: dummy, mobList, playerInfo: player,
    handPool: [], discardPool, battlePool: [], drawPool: []
  })
  assert.equal(boss.HP, 292) // 斩击 8 伤打老渔夫
  assert.equal(discardPool.length, 1) // 普通卡进弃牌堆
  assert.equal(discardPool[0], stolen) // 同引用(打出语义)
})

console.log("== 钓鱼 skill_mob_fishCast ==")
check("钓鱼: 召唤 2~4 只等级继承的腐烂的鱼, 均携带蕴含卡牌 T=老渔夫", () => {
  const boss = createMob("老渔夫", { level: 2 })
  const mobList = [boss]
  const skillCtx = mkCtx({ source: boss, actor: boss, mobList, playerInfo: mkPlayer() })
  runSkill("skill_mob_fishCast", skillCtx)
  const fishes = mobList.filter(m => m.name === "腐烂的鱼")
  assert.ok(fishes.length >= 2 && fishes.length <= 4, `鱼数 ${fishes.length} 应在 2~4`)
  assert.ok(fishes.every(f => f.level === 2), "鱼等级继承本体")
  for (const f of fishes) {
    const embed = f.effect.find(e => e.key === "effect_embedCard")
    assert.ok(embed, "鱼应携带蕴含卡牌")
    assert.equal(embed.exDate.target, boss, "蕴含卡牌 T 应指向老渔夫")
    assert.equal(embed.exDate.card.exhaust, true, "钓鱼斩击应 exhaust(不进弃牌堆)")
    assert.equal(embed.exDate.card.level, Math.max(2 - 2, 1))
  }
})

console.log("== 钓牌 skill_mob_fishHand ==")
check("钓牌: 钓走手牌 1~3 张(保底留1), 空靶子携带, 原卡从手牌切除", () => {
  const boss = createMob("老渔夫", { level: 1 })
  const player = mkPlayer()
  const hand = [createCard("斩击", { level: 1 }), createCard("痛击", { level: 1 }), createCard("持盾", { level: 1 }), createCard("治愈之光", { level: 1 }), createCard("横扫", { level: 1 })]
  const mobList = [boss]
  const skillCtx = mkCtx({ source: boss, actor: boss, mobList, playerInfo: player, handPool: hand })
  runSkill("skill_mob_fishHand", skillCtx)
  const dummies = mobList.filter(m => m.name === DUMMY_NAME)
  assert.ok(dummies.length >= 1 && dummies.length <= 3, `钓数 ${dummies.length} 应在 1~3`)
  assert.ok(hand.length >= 1, "保底 1 张不钓")
  assert.equal(hand.length, 5 - dummies.length, "被钓的卡已从手牌切除")
  for (const d of dummies) {
    assert.equal(d.HP, 1)
    assert.equal(d.level, 1)
    const embed = d.effect.find(e => e.key === "effect_embedCard")
    assert.ok(embed, "空靶子应携带蕴含卡牌")
    assert.equal(embed.exDate.target, boss, "T 指向老渔夫")
    // 被钓卡副本保留原 uid(释放=打出语义)
    assert.ok(embed.exDate.card.uid, "副本应保留 uid")
  }
})
check("钓牌: 手牌只剩1张时不钓", () => {
  const boss = createMob("老渔夫", { level: 1 })
  const hand = [createCard("斩击", { level: 1 })]
  const mobList = [boss]
  const skillCtx = mkCtx({ source: boss, actor: boss, mobList, playerInfo: mkPlayer(), handPool: hand })
  runSkill("skill_mob_fishHand", skillCtx)
  assert.equal(mobList.filter(m => m.name === DUMMY_NAME).length, 0)
  assert.equal(hand.length, 1)
})
check("钓牌: 鱼死释放被钓的粘液 -> 按打出语义销毁(不进弃牌堆)", () => {
  const player = mkPlayer()
  const boss = createMob("老渔夫", { level: 1 })
  const stolen = createCard("粘液", { level: 1 }) // exhaust:true, 销毁类
  const dummy = createMob("史莱姆", { name: DUMMY_NAME, HP: 1, level: 1, setAct: [] })
  const mobList = [boss, dummy]
  const discardPool = []
  addEffect(dummy, { key: "effect_embedCard", restTurn: "inf", level: 1, isRemove: false, exDate: { card: stolen, target: boss } })
  dummy.HP = 0
  fireEffect({
    trigger: "when_death", targets: dummy, mobList, playerInfo: player,
    handPool: [], discardPool, battlePool: [], drawPool: []
  })
  assert.equal(discardPool.length, 0, "exhaust 卡不进弃牌堆")
  assert.equal(boss.HP, 300) // 粘液无伤害
})

console.log("== 不屈的钓鱼佬 effect_fishermanSpirit ==")
check("buff 挂在老渔夫身上", () => {
  const boss = createMob("老渔夫", { level: 1 })
  assert.ok(boss.effect.some(e => e.key === "effect_fishermanSpirit"))
})
check("玩家打老渔夫 -> 目标被替换为空靶子", () => {
  const player = mkPlayer()
  const boss = createMob("老渔夫", { level: 1 })
  const mobList = [boss]
  const card = createCard("斩击", { level: 1 })
  const skillCtx = buildSkillCtx({ source: card, actor: player, target: boss, targetIndex: 0, playerInfo: player, mobList, handPool: [] })
  fireEffect({ trigger: "when_player_act", targets: mobList, exDate: { skillCtx }, mobList, playerInfo: player })
  assert.notEqual(skillCtx.target, boss, "目标不应再是老渔夫")
  assert.equal(skillCtx.target.name, DUMMY_NAME)
  assert.ok(mobList.includes(skillCtx.target), "空靶子应进怪物组")
})
check("玩家打其他怪 -> 不受影响", () => {
  const player = mkPlayer()
  const boss = createMob("老渔夫", { level: 1 })
  const other = createMob("史莱姆", { level: 1 })
  const mobList = [boss, other]
  const card = createCard("斩击", { level: 1 })
  const skillCtx = buildSkillCtx({ source: card, actor: player, target: other, targetIndex: 1, playerInfo: player, mobList, handPool: [] })
  fireEffect({ trigger: "when_player_act", targets: mobList, exDate: { skillCtx }, mobList, playerInfo: player })
  assert.equal(skillCtx.target, other, "打其他怪目标不变")
  assert.equal(mobList.length, 2, "不应新增空靶子")
})
check("连续打老渔夫 -> 复用已有空靶子, 不无限累积", () => {
  const player = mkPlayer()
  const boss = createMob("老渔夫", { level: 1 })
  const mobList = [boss]
  const fire = (i) => {
    const skillCtx = buildSkillCtx({ source: createCard("斩击", { level: 1 }), actor: player, target: boss, targetIndex: 0, playerInfo: player, mobList, handPool: [] })
    fireEffect({ trigger: "when_player_act", targets: mobList, exDate: { skillCtx }, mobList, playerInfo: player })
    return skillCtx
  }
  fire(1); fire(2); fire(3)
  const dummies = mobList.filter(m => m.name === DUMMY_NAME)
  assert.equal(dummies.length, 1, "多次打老渔夫只应有一个空靶子")
})

console.log("== 死变骷髅修正: effect_revive 释放愤怒的骷髅鱼 ==")
check("腐烂僵尸死亡 -> 释放愤怒的骷髅鱼(攻击/无行动循环)", () => {
  const z = createMob("腐烂僵尸", { level: 1 })
  const mobList = [z]
  z.HP = 0
  fireEffect({ trigger: "when_death", targets: z, mobList, playerInfo: mkPlayer(), handPool: [], discardPool: [], battlePool: [], drawPool: [] })
  const skeleton = mobList[mobList.length - 1]
  assert.equal(skeleton.name, "愤怒的骷髅鱼")
  assert.equal(skeleton.HP, 1)
  assert.equal(skeleton.power, 5)
  assert.deepEqual(skeleton.act, ["skill_shared_attack", "skill_shared_idle"])
  // 循环可用: 攻击/无行动 交替(createMob 已消耗一次掷骰, 起点不定, 断言交替性)
  const a = rollNextTurn(skeleton)
  const b = rollNextTurn(skeleton)
  const c = rollNextTurn(skeleton)
  assert.ok([a, b, c].every(k => k === "skill_shared_attack" || k === "skill_shared_idle"), `act 循环应只含攻击/idle: ${a},${b},${c}`)
  assert.notEqual(a, b, "攻击与无行动应交替")
  assert.equal(c, a, "三连循环应回到起点")
})

console.log("\nALL PASSED: " + pass + " assertions")
