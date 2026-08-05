// smoke07: 狂乱/王牌/when_act + when_damaged 集成
import assert from "node:assert/strict"
import { createMob, createMobByRare } from "./.cache/esm/data/mobs.mjs"
import { createCard } from "./.cache/esm/data/cards.mjs"
import { buildSkillCtx, runSkill } from "./.cache/esm/core/skill.mjs"
import { fireEffect } from "./.cache/esm/core/effect.mjs"
import { dealDamage } from "./.cache/esm/core/basics.mjs"
// import effect.js 触发 when_damaged 钩子注入(副作用)
import "./.cache/esm/core/effect.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}
const mkPlayer = () => ({ HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [], goldNum: 0 })

console.log("== 王牌 ==")
const ace = createMob("王牌", { level: 1 })
check("字段: HP15 power1 rare3, 技能含鸡尾酒", () => {
  assert.equal(ace.HP, 15)
  assert.equal(ace.power, 1)
  assert.equal(ace.rare, 3)
  assert.ok(ace.act.includes("skill_card_madCocktail"))
})
check("rare3 池可抽到", () => assert.ok(createMobByRare(3, { level: 1 })))

console.log("== 王牌给玩家上狂乱 ==")
const player = mkPlayer()
runSkill("skill_card_madCocktail", buildSkillCtx({
  source: ace, actor: ace, target: player, targetIndex: null,
  playerInfo: player, mobList: [ace], handPool: [], drawPool: []
}))
check("玩家挂狂乱(1次)", () => {
  const eff = player.effect.find(e => e.key === "effect_madness")
  assert.ok(eff)
  assert.equal(eff.restTurn, 1)
})

console.log("== when_act 重定向 ==")
fireEffect({ trigger: "when_act", targets: player, mobList: [ace], playerInfo: player })
check("madTarget 随机(玩家/王牌之一)", () => {
  assert.ok([player, ace].includes(player.madTarget))
})

console.log("== useCard 目标解析(模拟) ==")
function resolveTarget(p, pool, mobIndex) {
  const mad = p.madTarget
  p.madTarget = undefined
  return mad || pool[mobIndex]
}
player.madTarget = player
check("狂乱打自己", () => assert.equal(resolveTarget(player, [ace], 0), player))
player.madTarget = undefined
check("正常选怪", () => assert.equal(resolveTarget(player, [ace], 0), ace))

console.log("== 狂乱自伤结算 ==")
const p2 = mkPlayer()
const mobs2 = [createMob("史莱姆", { level: 1 })]
p2.madTarget = p2
const target = p2.madTarget
p2.madTarget = undefined
runSkill("skill_shared_attack", buildSkillCtx({
  source: createCard("斩击", { level: 1 }), actor: p2, target, targetIndex: -1,
  playerInfo: p2, mobList: mobs2, handPool: [], drawPool: []
}))
check("自伤: 玩家 -8", () => assert.equal(p2.HP, 92))

console.log("== when_damaged 集成(钩子已注入) ==")
import("./.cache/esm/core/basics.mjs").then((m) => {
  const calls = []
  const realHook = m.dealDamage.onDamage
  m.dealDamage.onDamage = (t, d, actor, ctx2) => calls.push({ d, actor })
  const p3 = mkPlayer()
  const goblin = createMob("哥布林", { level: 1 })
  m.dealDamage(p3, goblin, 7, { mobList: [goblin], playerInfo: p3 })
  m.dealDamage(p3, goblin, 7, { isFireEffect: false, mobList: [goblin], playerInfo: p3 })
  m.dealDamage.onDamage = realHook
  check("isFireEffect 控制: true触发1次, false不触发", () => {
    assert.equal(calls.length, 1)
    assert.equal(calls[0].d, 7)
    assert.equal(calls[0].actor, p3)
  })
  finish()
})

function finish() {
  console.log("\nALL PASSED: " + pass + " assertions")
}
