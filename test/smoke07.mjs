// smoke07: 狂乱/王牌/when_act(效果直接改 ctx) + when_damaged 集成(显式 fireEffect 传递)
import assert from "node:assert/strict"
import { createMob, createMobByRare } from "./.cache/esm/common/data/mobs.mjs"
import { createCard } from "./.cache/esm/common/data/cards.mjs"
import { buildSkillCtx, runSkill } from "./.cache/esm/common/core/core_skill.mjs"
import { fireEffect } from "./.cache/esm/common/core/core_effect.mjs"
import { dealDamage } from "./.cache/esm/common/core/core_basics.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}
const mkPlayer = () => ({ HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [], goldNum: 0 })

console.log("== 王牌 ==")
const ace = createMob("王牌", { level: 1 })
check("字段: HP15 power1 rare3, 技能含鸡尾酒(对象模式)", () => {
  assert.equal(ace.HP, 15)
  assert.equal(ace.power, 1)
  assert.equal(ace.rare, 3)
  assert.ok(ace.act.skill_card_madCocktail) // act 已改为对象模式(加权+黑名单)
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

console.log("== when_act 重定向(效果直接改 ctx.target, 无需标记) ==")
const ctx0 = buildSkillCtx({
  source: ace, actor: ace, target: player, targetIndex: null,
  playerInfo: player, mobList: [ace], handPool: [], drawPool: []
})
fireEffect({ trigger: "when_act", targets: player, exDate: { ctx: ctx0 }, mobList: [ace], playerInfo: player })
check("狂乱效果把 ctx.target 改为随机单位(玩家/王牌之一)", () => {
  assert.ok([player, ace].includes(ctx0.target))
})
check("狂乱次数耗尽自愈", () => {
  assert.equal(player.effect.length, 0)
})

console.log("== useCard 模式模拟: 构建ctx -> when_act(传ctx) -> 按 ctx.target 执行 ==")
const p2 = mkPlayer()
const mobs2 = [createMob("史莱姆", { level: 1 })]
p2.effect.push({ key: "effect_madness", restTurn: 1, level: 1, isRemove: false })
const ctx2 = buildSkillCtx({
  source: createCard("斩击", { level: 1 }), actor: p2, target: mobs2[0], targetIndex: 0,
  playerInfo: p2, mobList: mobs2, handPool: [], drawPool: []
})
fireEffect({ trigger: "when_act", targets: p2, exDate: { ctx: ctx2 }, mobList: mobs2, playerInfo: p2 })
const target = ctx2.target // 效果可能已改为玩家自己
runSkill("skill_shared_attack", ctx2)
if (target === p2) {
  check("狂乱打自己: 玩家 -8(无差别)", () => assert.equal(p2.HP, 92))
} else {
  check("狂乱打史莱姆: 史莱姆 -8", () => assert.equal(mobs2[0].HP, 2))
}

console.log("== when_damaged 集成(显式 fireEffect 传递, 无全局钩子) ==")
const calls = []
const p3 = mkPlayer()
const goblin = createMob("哥布林", { level: 1 })
dealDamage(p3, goblin, 7, {
  fireEffect: (cfg) => calls.push({ d: cfg.exDate.damage, a: cfg.exDate.actor }),
  mobList: [goblin], playerInfo: p3
})
dealDamage(p3, goblin, 7, {
  isFireEffect: false,
  fireEffect: () => calls.push("should not"),
  mobList: [goblin], playerInfo: p3
})
check("isFireEffect 控制: true触发1次, false不触发", () => {
  assert.equal(calls.length, 1)
  assert.equal(calls[0].d, 7)
  assert.equal(calls[0].a, p3)
})
check("dealDamage.onDamage 已不存在(无全局钩子)", () => {
  assert.equal(dealDamage.onDamage, undefined)
})

console.log("\nALL PASSED: " + pass + " assertions")
