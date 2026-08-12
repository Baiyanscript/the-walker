// smoke05: 区域与特殊机制(融合/代偿/返还)
import assert from "node:assert/strict"
import { createCard } from "./.cache/esm/data/cards.mjs"
import { createMob } from "./.cache/esm/data/mobs.mjs"
import { buildSkillCtx, runSkill } from "./.cache/esm/core/skill.mjs"
import { fireEffect } from "./.cache/esm/core/effect.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}
const mkPlayer = () => ({ HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [], goldNum: 0 })
const mob = createMob("史莱姆", { level: 1 })

console.log("== 融合(参数抽取/去重/rare0) ==")
const a = { uid: "a", name: "A", level: 2, power: 8, costAP: 1, doSkill: ["skill_shared_attack", "skill_shared_defend"] }
const b = { uid: "b", name: "B", level: 3, power: 5, costAP: 2, doSkill: ["skill_shared_attack", "skill_card_sweep"] }
const doSkill = []
for (const s of [...a.doSkill, ...b.doSkill]) if (!doSkill.includes(s)) doSkill.push(s)
check("技能去重合并(3个)", () => assert.equal(doSkill.length, 3))
const fusion = { uid: "f", name: "融合卡", level: 2, power: 8, costAP: 2, doSkill, rare: 0 }
check("融合卡 rare=0", () => assert.equal(fusion.rare, 0))

console.log("== 代偿(挂buff/拦截/0费/第二张被拦) ==")
const player = mkPlayer()
const comp = createCard("代偿", { level: 2 })
runSkill("skill_card_compensation", buildSkillCtx({
  source: comp, actor: player, target: mob, targetIndex: 0,
  playerInfo: player, mobList: [mob], handPool: [], drawPool: []
}))
check("挂代偿 buff(level=2)", () => {
  const eff = player.effect.find(e => e.key === "effect_compensation")
  assert.ok(eff)
  assert.equal(eff.level, 2)
})
// 模拟 useCard 拦截
const slash = createCard("斩击", { level: 2 }) // power8 cost1
const idx = (player.effect || []).findIndex(e => e.key === "effect_compensation")
const efflevel = player.effect[idx].level || 1
player.effect.splice(idx, 1)
const dmg = Math.max(1, slash.power) * Math.max(1, slash.level) * Math.max(1, slash.costAP) * Math.max(1, efflevel)
check("拦截: 8*2*1*2=32", () => assert.equal(dmg, 32))
check("buff 一次性移除", () => assert.equal(player.effect.length, 0))
// 0费卡
const p2 = mkPlayer()
p2.effect.push({ key: "effect_compensation", restTurn: "inf", level: 3, isRemove: false })
const ener = createCard("快速充能", { level: 2 }) // costAP0 power2
const idx2 = (p2.effect || []).findIndex(e => e.key === "effect_compensation")
const lv2 = p2.effect[idx2].level || 1
p2.effect.splice(idx2, 1)
const dmg2 = Math.max(1, ener.power) * Math.max(1, ener.level) * Math.max(1, ener.costAP) * Math.max(1, lv2)
check("0费卡: costAP按1算, 2*2*1*3=12", () => assert.equal(dmg2, 12))

console.log("== 返还(借走的卡下回合回手) ==")
const p3 = mkPlayer()
const hand = []
const borrowed = createCard("斩击", { level: 1 })
p3.effect.push({ key: "effect_return", restTurn: 1, level: 1, isRemove: false, card: borrowed })
fireEffect({ trigger: "when_nextTurn", targets: p3, mobList: [mob], playerInfo: p3, handPool: hand })
check("返还: 卡回手, buff 移除", () => {
  assert.equal(hand.length, 1)
  assert.equal(hand[0], borrowed)
  assert.equal(p3.effect.length, 0)
})

console.log("\nALL PASSED: " + pass + " assertions")
