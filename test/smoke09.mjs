// smoke09: 代偿新机制——when_act 时效果直接替换 skillCtx.source 并重建, 页面无效果分支
import assert from "node:assert/strict"
import { createMob } from "./.cache/esm/common/data/mobs.mjs"
import { createCard } from "./.cache/esm/common/data/cards.mjs"
import { buildSkillCtx, runSkill } from "./.cache/esm/common/core/core_skill.mjs"
import { fireEffect } from "./.cache/esm/common/core/core_effect.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}
const mkPlayer = () => ({ HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [], goldNum: 0 })

console.log("== 代偿: when_act 替换 skillCtx.source 并重建 ==")
const player = mkPlayer()
player.effect.push({ key: "effect_compensation", restTurn: "inf", level: 2, isRemove: false })
const mob = createMob("史莱姆", { level: 1 }) // HP 10
const card = createCard("斩击", { level: 2 }) // power 8, costAP 1

const skillCtx = buildSkillCtx({
  source: card, actor: player, target: mob, targetIndex: 0,
  playerInfo: player, mobList: [mob], handPool: [card], drawPool: []
})
// useCard 触发 when_act, 把 skillCtx 和 buildSkillCtx 传给效果
fireEffect({ trigger: "when_act", targets: player, exDate: { skillCtx, buildSkillCtx }, mobList: [mob], playerInfo: player })

check("skillCtx.source 被替换为特制斩击卡", () => {
  assert.equal(skillCtx.source.name, "斩击")
  assert.equal(skillCtx.source.level, 2) // level = 原卡 level
  // power = max(1,8)×max(1,cost1)×max(1,层2) = 16
  assert.equal(skillCtx.source.power, 16)
})
check("skillCtx 快照重算: skillCtx.level/power 与 source 一致", () => {
  assert.equal(skillCtx.level, 2)
  assert.equal(skillCtx.power, 16)
})
check("代偿 buff 一次性移除", () => {
  assert.equal(player.effect.length, 0)
})

console.log("== 执行: 伤害 = power×level = 16×2 = 32 = 原power×原level×原cost×层 ==")
runSkill("skill_shared_attack", skillCtx)
check("史莱姆 10-32 -> 0", () => assert.equal(mob.HP, 0))

console.log("== 无代偿时 when_act 不改 skillCtx(对照组) ==")
const p2 = mkPlayer()
const m2 = createMob("史莱姆", { level: 1 })
const c2 = createCard("斩击", { level: 1 }) // power 8
const skillCtx2 = buildSkillCtx({
  source: c2, actor: p2, target: m2, targetIndex: 0,
  playerInfo: p2, mobList: [m2], handPool: [c2], drawPool: []
})
fireEffect({ trigger: "when_act", targets: p2, exDate: { skillCtx: skillCtx2, buildSkillCtx }, mobList: [m2], playerInfo: p2 })
runSkill("skill_shared_attack", skillCtx2)
check("正常出牌: 伤害 8, source 未被替换", () => {
  assert.equal(skillCtx2.source.uid, c2.uid)
  assert.equal(m2.HP, 2)
})

console.log("\nALL PASSED: " + pass + " assertions")
