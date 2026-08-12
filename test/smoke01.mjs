// smoke01: 框架基础(工厂/ctx三角色/basics钳制/weightedPick)
import assert from "node:assert/strict"
import { createCard, createCardByRare } from "./.cache/esm/data/cards.mjs"
import { createMob, createMobByRare } from "./.cache/esm/data/mobs.mjs"
import { buildSkillCtx } from "./.cache/esm/core/skill.mjs"
import { changeHP, changeAP, changeDP, dealDamage, fixDamage, isDead } from "./.cache/esm/core/basics.mjs"
import { weightedPick } from "./.cache/esm/core/utils.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}

console.log("== 工厂 ==")
check("createCard 字段/等级缩放", () => {
  const c = createCard("斩击", { level: 2 })
  assert.equal(c.power, 8) // power 固定模板值, 不随等级缩放(2026-08-12 数值平衡)
  assert.equal(c.rare, 1)
  assert.ok(c.uid)
})
check("createCard 未知模板返回 null", () => assert.equal(createCard("不存在"), null))
check("createCardByRare 带 rare", () => assert.equal(createCardByRare(2, { level: 1 }).rare, 2))
check("createMob 字段/等级血量", () => {
  const m = createMob("史莱姆", { level: 2 })
  assert.equal(m.HP, 20)
  assert.equal(m.power, 5)
})
check("createMob 模板级 DP", () => {
  const t = createMob("超级龟龟", { level: 1 })
  assert.equal(t.DP, 300)
})
check("createMobByRare 空池返回 null", () => assert.equal(createMobByRare(9), null))

console.log("== ctx 三角色 ==")
const card = createCard("斩击", { level: 1 })
const player = { HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [] }
const mob = createMob("史莱姆", { level: 1 })
const ctx = buildSkillCtx({ source: card, actor: player, target: mob, targetIndex: 0, playerInfo: player, mobList: [mob], handPool: [] })
check("ctx 便捷数值来自 source", () => {
  assert.equal(ctx.power, 8)
  assert.equal(ctx.level, 1)
  assert.equal(ctx.actor, player)
  assert.equal(ctx.target, mob)
})

console.log("== basics 钳制 ==")
check("changeHP 下限 0", () => { const e = { HP: 3 }; changeHP(e, -100); assert.equal(e.HP, 0) })
check("changeAP 上限 maxAP", () => { const p = { AP: 8, maxAP: 8 }; changeAP(p, 10); assert.equal(p.AP, 8) })
check("changeHP 治疗封顶", () => { const p = { HP: 97, maxHP: 100 }; changeHP(p, 100, { cap: 100 }); assert.equal(p.HP, 100) })
check("changeDP 缺失字段按 0 初始化", () => { const e = {}; changeDP(e, 5); assert.equal(e.DP, 5) })
check("dealDamage 护盾吸收", () => {
  const t = { HP: 10, DP: 5 }
  assert.equal(dealDamage(null, t, 8), 3)
  assert.equal(t.HP, 7)
  assert.equal(t.DP, 0)
})
check("fixDamage 纯计算", () => { const t = { DP: 5 }; assert.equal(fixDamage(3, t), 0); assert.equal(t.DP, 2) })
check("isDead", () => assert.ok(isDead({ HP: 0 })))

console.log("== weightedPick ==")
const list = [{ n: "a", w: 1 }, { n: "b", w: 9 }]
let a = 0
for (let i = 0; i < 1000; i++) if (weightedPick(list, x => x.w).n === "a") a++
check("权重分布: a 约 10%", () => assert.ok(a > 30 && a < 200, `a=${a}`))
check("weightedPick 空列表", () => assert.equal(weightedPick([], x => x.w), undefined))

console.log("\nALL PASSED: " + pass + " assertions")
