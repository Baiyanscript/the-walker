// smoke10: buff 去重合并(addEffect: 默认去重态 / dedupe:false 独立挂载 / trigger 栏位分发)
import assert from "node:assert/strict"
import { createCard } from "./.cache/esm/data/cards.mjs"
import { createMob } from "./.cache/esm/data/mobs.mjs"
import { buildSkillCtx, runSkill } from "./.cache/esm/core_skill.mjs"
import { addEffect, fireEffect } from "./.cache/esm/core_effect.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}

console.log("== 默认去重: level 一致取大 restTurn ==")
const mob = createMob("史莱姆", { level: 1 })
addEffect(mob, { key: "effect_toxin", restTurn: 4, level: 1, isRemove: false })
addEffect(mob, { key: "effect_toxin", restTurn: 6, level: 1, isRemove: false })
check("同 level 合并: 单实例, restTurn 取大(6)", () => {
  assert.equal(mob.effect.length, 1)
  assert.equal(mob.effect[0].restTurn, 6)
  assert.equal(mob.effect[0].level, 1)
})

console.log("== 默认去重: level 不一致取大 level 及大者的 restTurn ==")
const mob2 = createMob("史莱姆", { level: 1 })
addEffect(mob2, { key: "effect_toxin", restTurn: 9, level: 2, isRemove: false })   // 旧: level2 restTurn9
addEffect(mob2, { key: "effect_toxin", restTurn: 100, level: 1, isRemove: false }) // 新: level1 restTurn100
check("旧 level 大: 取大 level(2) 及其 restTurn(9), 不管新 restTurn 更大", () => {
  assert.equal(mob2.effect.length, 1)
  assert.equal(mob2.effect[0].level, 2)
  assert.equal(mob2.effect[0].restTurn, 9)
})
const mob3 = createMob("史莱姆", { level: 1 })
addEffect(mob3, { key: "effect_toxin", restTurn: 5, level: 1, isRemove: false })
addEffect(mob3, { key: "effect_toxin", restTurn: 7, level: 3, isRemove: false })
check("新 level 大: 取新 level(3) 及其 restTurn(7)", () => {
  assert.equal(mob3.effect.length, 1)
  assert.equal(mob3.effect[0].level, 3)
  assert.equal(mob3.effect[0].restTurn, 7)
})

console.log("== restTurn 'inf' 视为无限大 ==")
const mob4 = createMob("史莱姆", { level: 1 })
addEffect(mob4, { key: "effect_toxin", restTurn: "inf", level: 1, isRemove: false })
addEffect(mob4, { key: "effect_toxin", restTurn: 2, level: 1, isRemove: false })
check("inf + 数字 -> inf", () => {
  assert.equal(mob4.effect.length, 1)
  assert.equal(mob4.effect[0].restTurn, "inf")
})

console.log("== 恩赐(不死图腾)自动去重 ==")
const p = { HP: 50, maxHP: 100, effect: [] }
const mobT = createMob("史莱姆", { level: 1 })
runSkill("skill_card_totemBless", buildSkillCtx({ source: createCard("不死图腾"), actor: p, target: mobT, playerInfo: p, mobList: [mobT], handPool: [] }))
runSkill("skill_card_totemBless", buildSkillCtx({ source: createCard("不死图腾"), actor: p, target: mobT, playerInfo: p, mobList: [mobT], handPool: [] }))
check("重复挂恩赐: 仍单实例(inf/1)", () => {
  assert.equal(p.effect.length, 1)
  assert.equal(p.effect[0].key, "effect_blessing")
  assert.equal(p.effect[0].restTurn, "inf")
})

console.log("== 返还不去重(dedupe:false): 独立实例, card 不丢失 ==")
const mob5 = createMob("史莱姆", { level: 1 })
const p5 = { HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [], goldNum: 0 }
const ouro = createCard("衔尾蛇", { level: 1 })
const dog = createCard("哎，大狗？", { level: 1 })
runSkill("skill_card_ouroboros", buildSkillCtx({ source: ouro, actor: p5, target: mob5, targetIndex: 0, playerInfo: p5, mobList: [mob5], handPool: [], drawPool: [ouro] }))
const origRandom = Math.random
Math.random = () => 0.99 // 大狗不变身 -> 挂返还
runSkill("skill_card_dog", buildSkillCtx({ source: dog, actor: p5, target: mob5, targetIndex: 0, playerInfo: p5, mobList: [mob5], handPool: [], drawPool: [] }))
Math.random = origRandom
check("两个返还实例独立, 两张卡都保留", () => {
  const returns = p5.effect.filter(e => e.key === "effect_return")
  assert.equal(returns.length, 2)
  assert.deepEqual(returns.map(e => e.card.name).sort(), ["大狗", "衔尾蛇"])
})
const hand5 = []
fireEffect({ trigger: "when_nextTurn", targets: p5, mobList: [mob5], playerInfo: p5, handPool: hand5 })
check("when_nextTurn: 两张卡都还回手牌, 返还一次性移除", () => {
  assert.equal(hand5.length, 2)
  assert.equal(p5.effect.filter(e => e.key === "effect_return").length, 0)
})

console.log("== isRemove 旧效果被替换, 不与'尸体'合并 ==")
const mob6 = createMob("史莱姆", { level: 1 })
addEffect(mob6, { key: "effect_toxin", restTurn: 3, level: 1, isRemove: true })
addEffect(mob6, { key: "effect_toxin", restTurn: 5, level: 2, isRemove: false })
check("直接替换为新的", () => {
  assert.equal(mob6.effect.length, 1)
  assert.equal(mob6.effect[0].level, 2)
  assert.equal(mob6.effect[0].restTurn, 5)
  assert.equal(mob6.effect[0].isRemove, false)
})

console.log("== trigger 栏位分发(未声明时机不执行) ==")
const goldMob = createMob("黄金史莱姆", { level: 1 }) // 模板自带 effect_goldDrop
const p7 = { HP: 100, maxHP: 100, goldNum: 0 }
fireEffect({ trigger: "when_nextTurn", targets: goldMob, mobList: [goldMob], playerInfo: p7 })
check("when_nextTurn 不触发 goldDrop(trigger 过滤)", () => assert.equal(p7.goldNum, 0))
fireEffect({ trigger: "when_death", targets: goldMob, mobList: [goldMob], playerInfo: p7 })
check("when_death 触发 goldDrop: 金币 +20", () => assert.equal(p7.goldNum, 20))

console.log("\nALL PASSED: " + pass + " assertions")
