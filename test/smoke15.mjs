// smoke15: boss 专属卡(不洁之血/非欧立方/启示录) + 不灭(死亡返还) + 神格(出牌增强/复活) + 力竭
import assert from "node:assert/strict"
import { createCard, createCardByRare } from "./.cache/esm/data/cards.mjs"
import { createMob } from "./.cache/esm/data/mobs.mjs"
import { buildSkillCtx, runSkill } from "./.cache/esm/core/skill.mjs"
import { fireEffect } from "./.cache/esm/core/effect.mjs"
import { MOB_UNUSABLE_SKILLS } from "./.cache/esm/skills/skills.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}

console.log("== boss 卡模板 ==")
const blood = createCard("不洁之血(融材)", { level: 1 })
check("不洁之血: rare boss, power 999, costAP 5, 空技能", () => {
  assert.equal(blood.rare, "boss")
  assert.equal(blood.power, 999)
  assert.equal(blood.costAP, 5)
  assert.deepEqual(blood.doSkill, [])
})
const cube = createCard("非欧立方", { level: 1 })
check("非欧立方: rare boss, costAP 10, 不灭+神格", () => {
  assert.equal(cube.rare, "boss")
  assert.equal(cube.costAP, 10)
  assert.deepEqual(cube.doSkill, ["skill_card_immortal", "skill_card_divinity"])
})
const apoc = createCard("启示录", { level: 1 })
check("启示录: rare boss, power 999, costAP 8, 力竭+火焰新星", () => {
  assert.equal(apoc.rare, "boss")
  assert.equal(apoc.power, 999)
  assert.equal(apoc.costAP, 8)
  assert.deepEqual(apoc.doSkill, ["skill_card_exhaust", "skill_card_fireNova"])
})
check("boss 池可抽到(createCardByRare)", () => {
  const c = createCardByRare("boss", { level: 1 })
  assert.ok(c && ["不洁之血(融材)", "非欧立方", "启示录"].includes(c.name))
})
check("新技能全部在怪物黑名单", () => {
  assert.ok(MOB_UNUSABLE_SKILLS.includes("skill_card_immortal"))
  assert.ok(MOB_UNUSABLE_SKILLS.includes("skill_card_divinity"))
  assert.ok(MOB_UNUSABLE_SKILLS.includes("skill_card_exhaust"))
})

const mkPlayer = () => ({ HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [], goldNum: 0 })
const mob = createMob("史莱姆", { level: 1 })

console.log("== 不灭: 挂死亡返还, 死亡时回归手牌 ==")
const p1 = mkPlayer()
const cube1 = createCard("非欧立方", { level: 1 })
runSkill("skill_card_immortal", buildSkillCtx({ source: cube1, actor: p1, target: mob, targetIndex: 0, playerInfo: p1, mobList: [mob], handPool: [], drawPool: [] }))
check("挂上死亡返还(带card引用)", () => {
  const eff = p1.effect.find(e => e.key === "effect_deathReturn")
  assert.ok(eff)
  assert.equal(eff.card, cube1)
})
const hand1 = []
p1.HP = 0 // 玩家死亡
fireEffect({ trigger: "when_death", targets: p1, mobList: [mob], playerInfo: p1, handPool: hand1 })
check("死亡时卡回归手牌, buff 一次性移除", () => {
  assert.deepEqual(hand1, [cube1])
  assert.equal(p1.effect.filter(e => e.key === "effect_deathReturn").length, 0)
})

console.log("== 神格: 出牌增强 + 死亡复活 ==")
const p2 = mkPlayer()
const cube2 = createCard("非欧立方", { level: 1 })
runSkill("skill_card_divinity", buildSkillCtx({ source: cube2, actor: p2, target: mob, targetIndex: 0, playerInfo: p2, mobList: [mob], handPool: [], drawPool: [] }))
const atk = createCard("斩击", { level: 1 }) // power 8
const ctx2 = buildSkillCtx({ source: atk, actor: p2, target: mob, targetIndex: 0, playerInfo: p2, mobList: [mob], handPool: [], drawPool: [] })
check("when_act 增强: ctx.power 8->10, level 1->3", () => {
  fireEffect({ trigger: "when_act", targets: p2, exDate: { ctx: ctx2 }, mobList: [mob], playerInfo: p2 })
  assert.equal(ctx2.power, 10)
  assert.equal(ctx2.level, 3)
})
p2.HP = 0
fireEffect({ trigger: "when_death", targets: p2, mobList: [mob], playerInfo: p2 })
check("死亡复活至 maxHP*2 = 200, buff 销毁", () => {
  assert.equal(p2.HP, 200)
  assert.equal(p2.effect.filter(e => e.key === "effect_divinity").length, 0)
})

console.log("== 神格: when_stageend 战斗结束清理 ==")
const p5 = mkPlayer()
runSkill("skill_card_divinity", buildSkillCtx({ source: createCard("非欧立方", { level: 1 }), actor: p5, target: mob, targetIndex: 0, playerInfo: p5, mobList: [mob], handPool: [], drawPool: [] }))
check("挂上神格后战斗结束(when_stageend) -> 移除", () => {
  assert.equal(p5.effect.filter(e => e.key === "effect_divinity").length, 1)
  fireEffect({ trigger: "when_stageend", targets: p5, mobList: [mob], playerInfo: p5 })
  assert.equal(p5.effect.filter(e => e.key === "effect_divinity").length, 0)
})

console.log("== 力竭: AP 归零 + 虚弱 ==")
const p3 = mkPlayer()
p3.AP = 5
runSkill("skill_card_exhaust", buildSkillCtx({ source: createCard("启示录", { level: 1 }), actor: p3, target: mob, targetIndex: 0, playerInfo: p3, mobList: [mob], handPool: [], drawPool: [] }))
check("AP 5 -> 0, 挂上虚弱", () => {
  assert.equal(p3.AP, 0)
  assert.ok(p3.effect.find(e => e.key === "effect_weakness"))
})

console.log("== 启示录全流程: 力竭+火焰新星秒全场 ==")
const p4 = mkPlayer()
const mobs = [createMob("史莱姆", { level: 1 }), createMob("哥布林", { level: 1 })]
const ctx4 = buildSkillCtx({ source: createCard("启示录", { level: 1 }), actor: p4, target: mobs[0], targetIndex: 0, playerInfo: p4, mobList: mobs, handPool: [], drawPool: [] })
for (const s of ctx4.source.doSkill) runSkill(s, ctx4)
check("全场怪被 999*1.5 秒杀, 玩家 AP 归零", () => {
  assert.ok(mobs[0].HP <= 0)
  assert.ok(mobs[1].HP <= 0)
  assert.equal(p4.AP, 0)
})

console.log("\nALL PASSED: " + pass + " assertions")
