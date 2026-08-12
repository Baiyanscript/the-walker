// smoke06: 成长链(衔尾蛇/大狗变身)
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

console.log("== 衔尾蛇(永久成长 + 返还) ==")
const drawPool = [createCard("衔尾蛇", { level: 1 })]
const player = mkPlayer()
let hand = [JSON.parse(JSON.stringify(drawPool[0]))]
const play = (h) => runSkill("skill_card_ouroboros", buildSkillCtx({
  source: h[0], actor: player, target: mob, targetIndex: 0,
  playerInfo: player, mobList: [mob], handPool: h, drawPool
}))
play(hand)
hand.splice(0, 1)
check("第一轮: 牌库+1", () => assert.equal(drawPool[0].power, 2))
const hand2 = []
fireEffect({ trigger: "when_nextTurn", targets: player, mobList: [mob], playerInfo: player, handPool: hand2 })
check("返还回手(power2)", () => assert.equal(hand2[0].power, 2))
play(hand2)
check("第二轮: 牌库累积到3", () => assert.equal(drawPool[0].power, 3))
const saved = JSON.parse(JSON.stringify(drawPool[0]))
check("存档: power3 永久保留", () => assert.equal(saved.power, 3))

console.log("== 大狗成长 ==")
const dog = createCard("哎，大狗？", { level: 1 })
const p2 = mkPlayer()
const origRandom = Math.random
Math.random = () => 0.99 // 不变身
runSkill("skill_card_dog", buildSkillCtx({
  source: dog, actor: p2, target: mob, targetIndex: 0,
  playerInfo: p2, mobList: [mob], handPool: [], drawPool: []
}))
check("第一次: 层数1, 名字'大狗', 存入返还", () => {
  assert.equal(dog.exDate.layer, 1)
  assert.equal(dog.name, "大狗")
  assert.ok(p2.effect.find(e => e.key === "effect_return"))
})
runSkill("skill_card_dog", buildSkillCtx({
  source: dog, actor: p2, target: mob, targetIndex: 0,
  playerInfo: p2, mobList: [mob], handPool: [], drawPool: []
}))
check("第二次: 层数2, 名字'大狗大狗'", () => {
  assert.equal(dog.exDate.layer, 2)
  assert.equal(dog.name, "大狗大狗")
})

console.log("== 大狗变身(层数3必变, 只进手牌不进存档牌库) ==")
const dog3 = createCard("哎，大狗？", { level: 2 }) // power=5(模板固定, 不随等级缩放)
dog3.exDate.layer = 2
const p3 = mkPlayer()
const draw3 = []
const hand3 = []
Math.random = () => 0.01 // 必变
runSkill("skill_card_dog", buildSkillCtx({
  source: dog3, actor: p3, target: mob, targetIndex: 0,
  playerInfo: p3, mobList: [mob], handPool: hand3, drawPool: draw3
}))
const evolved = hand3[0]
check("变身: '叫!!!', power=5*3=15, level继承2, 横扫技能", () => {
  assert.equal(evolved.name, "叫!!!")
  assert.equal(evolved.power, 15)
  assert.equal(evolved.level, 2)
  assert.deepEqual(evolved.doSkill, ["skill_card_sweep"])
})
check("变身只进手牌: 存档牌库(drawPool)保持为空", () => assert.equal(draw3.length, 0))
check("变身不创建返还", () => assert.equal(p3.effect.length, 0))
Math.random = origRandom

console.log("\nALL PASSED: " + pass + " assertions")
