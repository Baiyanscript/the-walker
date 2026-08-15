// smoke08: 腐烂僵尸复活 + 哎？大狗爆发 + 快速充能解毒
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
const mob = createMob("史莱姆", { level: 1 })

console.log("== 腐烂僵尸(常驻死后变骷髅) ==")
const zombie = createMob("腐烂僵尸", { level: 1 })
check("字段: HP10 power2 rare3, 带 effect_revive", () => {
  assert.equal(zombie.HP, 10)
  assert.equal(zombie.power, 2)
  assert.equal(zombie.rare, 3)
  assert.equal(zombie.effect[0].key, "effect_revive")
})
const mobList = [zombie]
fireEffect({ trigger: "when_death", targets: zombie, mobList, playerInfo: {} })
check("死亡: 变骷髅(召唤愤怒的骷髅鱼)", () => {
  assert.equal(mobList.length, 2)
  assert.equal(mobList[1].name, "愤怒的骷髅鱼")
})

console.log("== 哎？大狗(怪物版请叫叫) ==")
const bigDog = createMob("哎？大狗", { level: 1 })
check("字段: HP50 power5 rare3, 唯一技能请叫叫", () => {
  assert.equal(bigDog.HP, 50)
  assert.equal(bigDog.power, 5)
  assert.equal(bigDog.rare, 3)
  assert.deepEqual(bigDog.act, ["skill_mob_dog"])
})
const origRandom = Math.random

// 层数0: 必走成长分支
Math.random = () => 0.99
runSkill("skill_mob_dog", buildSkillCtx({
  source: bigDog, actor: bigDog, target: mkPlayer(), targetIndex: null,
  playerInfo: mkPlayer(), mobList: [bigDog], handPool: [], drawPool: []
}))
check("层数0: 成长(层数1, 护盾 power*2=10)", () => {
  assert.equal(bigDog.exDate.layer, 1)
  assert.equal(bigDog.DP, 10)
})
// 层数1/2: 必成长(2026-08-15 出手速度削弱: 层1~2无爆发概率)
Math.random = () => 0.01
runSkill("skill_mob_dog", buildSkillCtx({
  source: bigDog, actor: bigDog, target: mkPlayer(), targetIndex: null,
  playerInfo: mkPlayer(), mobList: [bigDog], handPool: [], drawPool: []
}))
check("层数1(随机0.01): 仍成长(层数2)", () => {
  assert.equal(bigDog.exDate.layer, 2)
  assert.equal(bigDog.DP, 20)
})
Math.random = () => 0.01
runSkill("skill_mob_dog", buildSkillCtx({
  source: bigDog, actor: bigDog, target: mkPlayer(), targetIndex: null,
  playerInfo: mkPlayer(), mobList: [bigDog], handPool: [], drawPool: []
}))
check("层数2(随机0.01): 仍成长(层数3)", () => {
  assert.equal(bigDog.exDate.layer, 3)
  assert.equal(bigDog.DP, 30)
})
// 层数3: 25% 爆发——固定爆发
Math.random = () => 0.01
const p1 = mkPlayer()
runSkill("skill_mob_dog", buildSkillCtx({
  source: bigDog, actor: bigDog, target: p1, targetIndex: null,
  playerInfo: p1, mobList: [bigDog], handPool: [], drawPool: []
}))
check("层数3 爆发: power=5*3=15, 层数清零, nextTurn=通用伤害, 护盾+level=1", () => {
  assert.equal(bigDog.power, 15)
  assert.equal(bigDog.exDate.layer, 0)
  assert.equal(bigDog.nextSkill, "skill_shared_attack")
  assert.equal(bigDog.DP, 31) // 30 + level(1)
})
// 爆发后的通用伤害(用新的 power15, level1)
runSkill("skill_shared_attack", buildSkillCtx({
  source: bigDog, actor: bigDog, target: p1, targetIndex: null,
  playerInfo: p1, mobList: [bigDog], handPool: [], drawPool: []
}))
check("爆发后普攻: 15*1=15 伤害", () => assert.equal(p1.HP, 85))
Math.random = origRandom

console.log("== 快速充能解毒(when_detox) ==")
const p2 = mkPlayer()
p2.effect.push({ key: "effect_toxin", restTurn: 3, level: 1, isRemove: false })
p2.effect.push({ key: "effect_madness", restTurn: 2, level: 1, isRemove: false })
runSkill("skill_card_energize", buildSkillCtx({
  source: createCard("快速充能", { level: 2 }), actor: p2, target: mob, targetIndex: 0,
  playerInfo: p2, mobList: [mob], handPool: [], drawPool: []
}))
check("解毒: 中毒和狂乱都被清除", () => {
  assert.equal(p2.effect.length, 0)
})
check("AP 照常恢复(钳制到8)", () => assert.equal(p2.AP, 8))

console.log("\nALL PASSED: " + pass + " assertions")
