// smoke14: 是啊看什么(effect_learnSkills) —— 学习玩家出牌技能, 黑名单/重复拒绝并回血+power
import assert from "node:assert/strict"
import { createCard } from "./.cache/esm/data/cards.mjs"
import { createMob } from "./.cache/esm/data/mobs.mjs"
import { buildSkillCtx } from "./.cache/esm/core/skill.mjs"
import { fireEffect } from "./.cache/esm/core/effect.mjs"
import { MOB_UNUSABLE_SKILLS } from "./.cache/esm/skills/skills.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}

console.log("== 黑名单声明 ==")
check("包含玩家专属成长(衔尾蛇/大狗)", () => {
  assert.ok(MOB_UNUSABLE_SKILLS.includes("skill_card_ouroboros"))
  assert.ok(MOB_UNUSABLE_SKILLS.includes("skill_card_dog"))
})
check("包含反向收益漏洞(模仿者/贪婪之刃)", () => {
  assert.ok(MOB_UNUSABLE_SKILLS.includes("skill_card_mimic"))
  assert.ok(MOB_UNUSABLE_SKILLS.includes("skill_card_goldenAttack"))
})
check("不包含通用/可给怪用的技能", () => {
  assert.ok(!MOB_UNUSABLE_SKILLS.includes("skill_shared_attack"))
  assert.ok(!MOB_UNUSABLE_SKILLS.includes("skill_card_poison"))
  assert.ok(!MOB_UNUSABLE_SKILLS.includes("skill_card_madCocktail"))
})

// 模拟 fighting.ux 玩家出牌: when_player_act 扫怪物组
function playerPlay(card, mobList) {
  const player = { HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [], goldNum: 0 }
  const target = mobList[0]
  const ctx = buildSkillCtx({ source: card, actor: player, target, targetIndex: 0, playerInfo: player, mobList, handPool: [], drawPool: [] })
  fireEffect({ trigger: "when_player_act", targets: mobList, exDate: { ctx, buildSkillCtx }, mobList, playerInfo: player })
  return ctx
}

console.log("== 学到新技能 ==")
const bossA = createMob("MC好成", { level: 1 }) // HP100 power5, act 2 个
playerPlay(createCard("淬毒", { level: 1 }), [bossA])
check("淬毒(新技能): act +1, 不回血不加power", () => {
  assert.equal(bossA.act.length, 3)
  assert.ok(bossA.act.includes("skill_card_poison"))
  assert.equal(bossA.HP, 100)
  assert.equal(bossA.power, 5)
})

console.log("== 黑名单拒绝: 回血50*level + power+2 ==")
const bossB = createMob("MC好成", { level: 1 })
playerPlay(createCard("模仿者", { level: 1 }), [bossB])
check("模仿者(黑名单): act 不变, HP 100->150, power 5->7", () => {
  assert.equal(bossB.act.length, 2)
  assert.equal(bossB.HP, 150)
  assert.equal(bossB.power, 7)
})
const bossB2 = createMob("MC好成", { level: 1 })
playerPlay(createCard("火焰新星", { level: 1 }), [bossB2])
check("火焰新星(黑名单AOE): 同样回血+power", () => {
  assert.equal(bossB2.HP, 150)
  assert.equal(bossB2.power, 7)
})

console.log("== 重复拒绝: 回血25倍level + power+2(比黑名单轻, 防软锁) ==")
const bossC = createMob("MC好成", { level: 1 })
playerPlay(createCard("斩击", { level: 1 }), [bossC]) // doSkill=[skill_shared_attack], BOSS 已有
check("斩击(重复): act 不变, HP 100->125, power 7", () => {
  assert.equal(bossC.act.length, 2)
  assert.equal(bossC.HP, 125)
  assert.equal(bossC.power, 7)
})

console.log("== 多技能卡: 部分重复部分学会 ==")
const bossD = createMob("MC好成", { level: 1 })
playerPlay(createCard("攻防一体", { level: 1 }), [bossD]) // [attack(重复), defend(新)]
check("攻防一体: attack 重复回血25, defend 学会", () => {
  assert.ok(bossD.act.includes("skill_shared_defend"))
  assert.equal(bossD.HP, 125)
  assert.equal(bossD.power, 7)
})

console.log("\nALL PASSED: " + pass + " assertions")
