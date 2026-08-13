// smoke25: 尖塔移植素材(需求.md 2026-08-13)——4遗物(准备背包/地精之角/手里剑/水银沙漏) + 4怪(地精大块头/地精法师/圆球守护者/真菌兽) + 4卡(铁斩波/战吼/燃烧/重刃)
import assert from "node:assert/strict"
import { createCard, upgradeCard, cardByRare } from "./.cache/esm/data/cards.mjs"
import { createMob, mobByRare } from "./.cache/esm/data/mobs.mjs"
import { buildSkillCtx, runSkill } from "./.cache/esm/core/skill.mjs"
import { fireEffect, addEffect } from "./.cache/esm/core/effect.mjs"
import { gainRelic, relic_LIB } from "./.cache/esm/data/relics.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}
const mkPlayer = () => ({ HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, power: 0, effect: [], relics: [], goldNum: 50 })
const mkCtx = (over = {}) => buildSkillCtx({
  source: over.source, actor: over.actor, target: over.target,
  playerInfo: over.playerInfo || mkPlayer(), mobList: over.mobList || [],
  handPool: over.handPool || [], drawPool: over.drawPool || [],
  battlePool: over.battlePool || [], discardPool: over.discardPool || []
})
// 玩家出牌场景的 ctx: actor 与 playerInfo 同引用(战斗内一致, 防力量/AP 读错对象)
const mkPlayCtx = (over = {}) => {
  const p = over.playerInfo || mkPlayer()
  return buildSkillCtx({
    source: over.source, actor: p, target: over.target,
    playerInfo: p, mobList: over.mobList || [],
    handPool: over.handPool || [], drawPool: over.drawPool || [],
    battlePool: over.battlePool || [], discardPool: over.discardPool || []
  })
}

console.log("== 新卡字段与强化 ==")
check("铁斩波: 1费 power5 攻+防, 升级power7", () => {
  const c = createCard("铁斩波", { level: 1 })
  assert.equal(c.costAP, 1)
  assert.equal(c.power, 5)
  assert.equal(c.rare, 1)
  assert.deepEqual(c.doSkill, ["skill_shared_attack", "skill_shared_defend"])
  upgradeCard(c)
  assert.equal(c.power, 7)
})
check("战吼: 0费 exhaust, 升级抽牌2", () => {
  const c = createCard("战吼", { level: 1 })
  assert.equal(c.costAP, 0)
  assert.equal(c.exhaust, true)
  assert.deepEqual(c.doSkill, ["skill_card_warcry"])
  const c2 = createCard("战吼", { level: 1 })
  upgradeCard(c2)
  // level 提升后抽牌数+1(由技能按 level 判定)
  assert.equal(c2.level, 2)
})
check("燃烧: 1费 rare2, 升级 power3", () => {
  const c = createCard("燃烧", { level: 1 })
  assert.equal(c.costAP, 1)
  assert.equal(c.rare, 2)
  upgradeCard(c)
  assert.equal(c.power, 3)
})
check("重刃: 2费 power14 rare2, 升级提高倍率", () => {
  const c = createCard("重刃", { level: 1 })
  assert.equal(c.costAP, 2)
  assert.equal(c.power, 14)
  assert.equal(c.rare, 2)
  upgradeCard(c)
  assert.equal(c.level, 2) // 倍率 2->3 由 level 体现
})
check("新卡均进对应稀有度池", () => {
  assert.ok(cardByRare[1].includes("铁斩波"))
  assert.ok(cardByRare[1].includes("战吼"))
  assert.ok(cardByRare[2].includes("燃烧"))
  assert.ok(cardByRare[2].includes("重刃"))
})

console.log("== 新卡技能 ==")
check("战吼: 抽1张(手牌上限内)", () => {
  const p = mkPlayer()
  const mob = createMob("史莱姆", { level: 1 })
  const battlePool = [createCard("斩击", { level: 1 }), createCard("持盾", { level: 1 })]
  const hand = []
  const ctx = mkPlayCtx({ source: createCard("战吼", { level: 1 }), playerInfo: p, target: mob, mobList: [mob], battlePool, handPool: hand })
  runSkill("skill_card_warcry", ctx)
  assert.equal(hand.length, 1)
  assert.equal(battlePool.length, 1)
})
check("燃烧: 本场战斗力量+1", () => {
  const p = mkPlayer()
  p.power = 3
  const ctx = mkPlayCtx({ source: createCard("燃烧", { level: 1 }), playerInfo: p, target: createMob("史莱姆", { level: 1 }), mobList: [] })
  runSkill("skill_card_inflame", ctx)
  assert.equal(p.power, 4)
})
check("重刃: 基础14 + 力量×1(level1)", () => {
  const p = mkPlayer()
  p.power = 4
  const mob = createMob("史莱姆", { level: 1 }) // HP10
  const ctx = mkPlayCtx({ source: createCard("重刃", { level: 1 }), playerInfo: p, target: mob, mobList: [mob] })
  runSkill("skill_card_heavyBlade", ctx)
  assert.equal(mob.HP, 0) // 14 + 4*1 = 18 > 10
})
check("重刃: 升级后倍率2(level2), 力量翻倍输出", () => {
  const p = mkPlayer()
  p.power = 4
  const mob = createMob("史莱姆之王", { level: 1 }) // HP25
  const ctx = mkPlayCtx({ source: createCard("重刃", { level: 2 }), playerInfo: p, target: mob, mobList: [mob] })
  runSkill("skill_card_heavyBlade", ctx)
  assert.equal(mob.HP, 3) // 14 + 4*2 = 22, 25-22=3
})

console.log("== 新怪物 ==")
check("地精大块头: HP70 rare3, 循环 咆哮/痛击/冲撞", () => {
  const m = createMob("地精大块头", { level: 1 })
  assert.equal(m.HP, 70)
  assert.equal(m.power, 10)
  assert.equal(m.rare, 3)
  assert.deepEqual(m.act, ["skill_mob_anger", "skill_card_bash", "skill_mob_charge"])
  assert.ok(m.effect.some(e => e.key === "effect_gremlinNob"))
})
check("地精大块头: 激怒——玩家任意出牌时 power+1", () => {
  const m = createMob("地精大块头", { level: 1 })
  const p = mkPlayer()
  const ctx = mkPlayCtx({ source: createCard("持盾", { level: 1 }), playerInfo: p, target: m, mobList: [m] })
  fireEffect({ trigger: "when_player_act", targets: [m], exDate: { ctx }, mobList: [m], playerInfo: p })
  assert.equal(m.power, 11)
})
check("地精法师: 蓄力×2→大爆炸20伤→蓄力×3→大爆炸 循环", () => {
  const m = createMob("地精法师", { level: 1 })
  assert.equal(m.HP, 25)
  assert.equal(m.rare, 1)
  const act = m.act
  assert.equal(act[0], "skill_shared_idle")
  assert.equal(act[2], "skill_mob_bigBoom")
  // 大爆炸固定 20 伤(不乘 power)
  const p = mkPlayer()
  const target = createMob("史莱姆之王", { level: 1 }) // HP25
  const ctx = mkCtx({ source: m, actor: m, target, mobList: [target] })
  runSkill("skill_mob_bigBoom", ctx)
  assert.equal(target.HP, 5)
})
check("圆球守护者: HP22 初始盾25, 硬化/双击", () => {
  const m = createMob("圆球守护者", { level: 1 })
  assert.equal(m.HP, 22)
  assert.equal(m.DP, 25)
  assert.deepEqual(m.act, ["skill_shared_defend", "skill_card_bash", "skill_mob_harden", "skill_mob_doubleHit"])
  // 硬化: 伤害+盾
  const p = mkPlayer()
  const target = createMob("史莱姆", { level: 1 }) // HP10
  const ctx = mkCtx({ source: m, actor: m, target, mobList: [target] })
  runSkill("skill_mob_harden", ctx)
  assert.equal(target.HP, 2) // 10 - 8
  assert.equal(m.DP, 35) // 25 + 10
})
check("真菌兽: HP24 生长→攻击→攻击 循环", () => {
  const m = createMob("真菌兽", { level: 1 })
  assert.equal(m.HP, 24)
  assert.equal(m.power, 6)
  assert.deepEqual(m.act, ["skill_mob_anger", "skill_shared_attack", "skill_shared_attack"])
})
check("新怪进对应稀有度池", () => {
  assert.ok(mobByRare[3].some(e => e.key === "地精大块头"))
  assert.ok(mobByRare[1].some(e => e.key === "地精法师"))
  assert.ok(mobByRare[2].some(e => e.key === "圆球守护者"))
  assert.ok(mobByRare[1].some(e => e.key === "真菌兽"))
})

console.log("== 新遗物 ==")
check("准备背包: 战斗开始额外抽2张", () => {
  const p = mkPlayer()
  gainRelic(p, "relic_bagOfPrep")
  const battlePool = [createCard("斩击", { level: 1 }), createCard("持盾", { level: 1 }), createCard("痛击", { level: 1 })]
  const hand = []
  fireEffect({ trigger: "when_fightstart", targets: p, mobList: [], playerInfo: p, handPool: hand, battlePool })
  assert.equal(hand.length, 2)
  assert.equal(battlePool.length, 1)
})
check("地精之角: 敌人死亡时 AP+1 抽1张", () => {
  const p = mkPlayer()
  gainRelic(p, "relic_gremlinHorn")
  const battlePool = [createCard("斩击", { level: 1 })]
  const hand = []
  fireEffect({ trigger: "when_death", targets: p, mobList: [], playerInfo: p, handPool: hand, battlePool })
  assert.equal(p.AP, 9)
  assert.equal(hand.length, 1)
  assert.equal(battlePool.length, 0)
})
check("手里剑: 每回合第3张攻击牌 power+1, 下回合清零", () => {
  const p = mkPlayer()
  gainRelic(p, "relic_shuriken")
  const mob = createMob("史莱姆", { level: 1 })
  const playAttack = () => {
    const ctx = mkPlayCtx({ source: createCard("斩击", { level: 1 }), playerInfo: p, target: mob, mobList: [mob] })
    fireEffect({ trigger: "when_act", targets: p, exDate: { ctx }, mobList: [mob], playerInfo: p })
  }
  const playDefend = () => {
    const ctx = mkPlayCtx({ source: createCard("持盾", { level: 1 }), playerInfo: p, target: mob, mobList: [mob] })
    fireEffect({ trigger: "when_act", targets: p, exDate: { ctx }, mobList: [mob], playerInfo: p })
  }
  playAttack() // 1
  playDefend() // 非攻击不计数
  playAttack() // 2
  assert.equal(p.power, 0)
  playAttack() // 3 -> +1
  assert.equal(p.power, 1)
  // 下回合清零
  fireEffect({ trigger: "when_nextTurn", targets: p, mobList: [], playerInfo: p })
  playAttack()
  playAttack()
  assert.equal(p.power, 1, "清零后重新计数, 未到3不加")
  playAttack()
  assert.equal(p.power, 2, "再次凑满3张 +1")
})
check("水银沙漏: 回合开始对全体敌人造成3伤", () => {
  const p = mkPlayer()
  gainRelic(p, "relic_mercuryHourglass")
  const m1 = createMob("史莱姆", { level: 1 }) // HP10
  const m2 = createMob("史莱姆", { level: 1 })
  fireEffect({ trigger: "when_nextTurn", targets: p, mobList: [m1, m2], playerInfo: p })
  assert.equal(m1.HP, 7)
  assert.equal(m2.HP, 7)
})
check("4遗物均在遗物表", () => {
  for (const k of ["relic_bagOfPrep", "relic_gremlinHorn", "relic_shuriken", "relic_mercuryHourglass"]) {
    assert.ok(relic_LIB[k], k)
  }
})

console.log("\nALL PASSED: " + pass + " assertions")
