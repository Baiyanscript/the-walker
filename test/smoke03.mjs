// smoke03: 技能核心(攻击/防御/治疗/横扫/毒/呼吸/自爆)
import assert from "node:assert/strict"
import { createCard } from "./.cache/esm/data/cards.mjs"
import { createMob } from "./.cache/esm/data/mobs.mjs"
import { buildSkillCtx, runSkill } from "./.cache/esm/core/skill.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}
const mkPlayer = () => ({ HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [] })
const ctxOf = (source, actor, target, mobList, handPool = []) => buildSkillCtx({
  source, actor, target, targetIndex: mobList.indexOf(target),
  playerInfo: actor, mobList, handPool, drawPool: []
})

console.log("== 玩家出牌(三角色: source=卡, actor=玩家, target=怪) ==")
const player = mkPlayer()
const slime = createMob("史莱姆", { level: 1 }) // HP10
runSkill("skill_shared_attack", ctxOf(createCard("斩击", { level: 1 }), player, slime, [slime]))
check("斩击: 怪 -8", () => assert.equal(slime.HP, 2))

const p2 = mkPlayer()
runSkill("skill_shared_defend", ctxOf(createCard("持盾", { level: 2 }), p2, slime, [slime]))
check("持盾: 玩家 +ceil(5*2*1.2)=12 盾(power 不随等级缩放)", () => assert.equal(p2.DP, 12))

const p3 = mkPlayer()
p3.HP = 50
runSkill("skill_shared_heal", ctxOf(createCard("治愈之光", { level: 1 }), p3, slime, [slime]))
check("治疗: +ceil(2*1*0.6)=2", () => assert.equal(p3.HP, 52))

const p4 = mkPlayer()
runSkill("skill_card_energize", ctxOf(createCard("快速充能", { level: 3 }), p4, slime, [slime]))
check("快速充能: 钳制到 maxAP=8", () => assert.equal(p4.AP, 8))

const p5 = mkPlayer()
p5.AP = 3
runSkill("skill_card_deepBreath", ctxOf(createCard("强效呼吸", { level: 2 }), p5, slime, [slime]))
check("强效呼吸: AP 突破上限 (3+4=7, 回量=level*power=2*2)", () => assert.equal(p5.AP, 7))

console.log("== 横扫(相邻) ==")
const p6 = mkPlayer()
const m1 = createMob("史莱姆", { level: 1 })
const m2 = createMob("史莱姆", { level: 1 })
const m3 = createMob("史莱姆", { level: 1 })
const mobs = [m1, m2, m3]
runSkill("skill_card_sweep", buildSkillCtx({
  source: createCard("横扫", { level: 2 }), actor: p6, target: m2, targetIndex: 1,
  playerInfo: p6, mobList: mobs, handPool: [], drawPool: []
}))
// 横扫lv2: power=3(固定), sweepDamage=ceil(3*2*0.5)=3, 主目标-6, 两侧-3
check("横扫: 主目标-6(HP4), 两侧各-3(HP7)", () => {
  assert.equal(m2.HP, 4)
  assert.equal(m1.HP, 7)
  assert.equal(m3.HP, 7)
})

console.log("== 毒(淬毒) ==")
const p7 = mkPlayer()
const m4 = createMob("哥布林", { level: 1 })
runSkill("skill_card_poison", ctxOf(createCard("淬毒", { level: 1 }), p7, m4, [m4]))
check("淬毒: 挂 effect_toxin", () => {
  assert.equal(m4.effect.length, 1)
  assert.equal(m4.effect[0].key, "effect_toxin")
})

console.log("== 自爆 ==")
const p8 = mkPlayer()
const creeper = createMob("苦力怕", { level: 1 })
runSkill("skill_shared_boom", ctxOf(creeper, creeper, p8, [creeper]))
check("自爆: 玩家 -26, 自己死亡", () => {
  assert.equal(p8.HP, 74)
  assert.ok(creeper.HP <= 0)
})

console.log("\nALL PASSED: " + pass + " assertions")
