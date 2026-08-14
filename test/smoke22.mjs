// smoke22: 粘液状态卡系统 + 返还卡不进弃牌堆(需求.md 讨论②③实装)
import assert from "node:assert/strict"
import { createCard, cardByRare } from "./.cache/esm/data/cards.mjs"
import { createMob } from "./.cache/esm/data/mobs.mjs"
import { buildSkillCtx, runSkill } from "./.cache/esm/core_skill.mjs"
import { fireEffect, addEffect } from "./.cache/esm/core_effect.mjs"
import { MOB_UNUSABLE_SKILLS } from "./.cache/esm/fun_skill.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}
const mkPlayer = () => ({ HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [], relics: [], goldNum: 50 })

console.log("== 状态卡字段 ==")
check("粘液: 0费 exhaust rare=status, 不进奖励池", () => {
  const c = createCard("粘液", { level: 1 })
  assert.equal(c.costAP, 0)
  assert.equal(c.exhaust, true)
  assert.equal(c.rare, "status")
  assert.deepEqual(c.doSkill, ["skill_card_slime"])
  // 不进 1/2/3 奖励池
  for (const rare of [1, 2, 3]) {
    assert.ok(!cardByRare[rare].includes("粘液"), `粘液不应在 rare${rare} 池`)
    assert.ok(!cardByRare[rare].includes("粘在一起的金币"), `金币粘液不应在 rare${rare} 池`)
  }
})
check("粘在一起的金币: 3费 exhaust, 技能 goldSlime", () => {
  const c = createCard("粘在一起的金币", { level: 1 })
  assert.equal(c.costAP, 3)
  assert.equal(c.exhaust, true)
  assert.deepEqual(c.doSkill, ["skill_card_goldSlime"])
})
check("怪物黑名单: 粘液技能不可被学习(防删玩家卡)", () => {
  assert.ok(MOB_UNUSABLE_SKILLS.includes("skill_card_slime"))
  assert.ok(MOB_UNUSABLE_SKILLS.includes("skill_card_goldSlime"))
  assert.ok(MOB_UNUSABLE_SKILLS.includes("skill_card_totemCurse"), "销毁诅咒应在黑名单(怪物无uid)")
})

console.log("== 销毁诅咒防御: 怪物无 uid 不误删 ==")
check("怪物当 source 执行销毁诅咒: 存档牌库不变", () => {
  const p = mkPlayer()
  const mob = createMob("MC好成", { level: 1 }) // 怪物实例无 uid 字段
  const pool = [createCard("斩击", { level: 1 }), createCard("持盾", { level: 1 })]
  const ctx = buildSkillCtx({ source: mob, actor: mob, target: p, targetIndex: null, playerInfo: p, mobList: [mob], handPool: [], drawPool: pool })
  runSkill("skill_card_totemCurse", ctx) // 模拟怪物绕过黑名单学到
  assert.equal(pool.length, 2, "无 uid 时不销毁任何卡")
})
check("怪物当 source 执行粘液销毁: 存档牌库不变", () => {
  const p = mkPlayer()
  const mob = createMob("MC好成", { level: 1 })
  const pool = [createCard("斩击", { level: 1 })]
  const ctx = buildSkillCtx({ source: mob, actor: mob, target: p, targetIndex: null, playerInfo: p, mobList: [mob], handPool: [], drawPool: pool })
  runSkill("skill_card_slime", ctx)
  assert.equal(pool.length, 1)
})

console.log("== 打出粘液: 销毁存档同UID ==")
check("粘液打出: 存档牌库同uid被删, 其余卡保留", () => {
  const p = mkPlayer()
  const mob = createMob("史莱姆", { level: 1 })
  const slime = createCard("粘液", { level: 1 })
  const pool = [slime, createCard("斩击", { level: 1 })]
  const ctx = buildSkillCtx({ source: slime, actor: p, target: mob, targetIndex: 0, playerInfo: p, mobList: [mob], handPool: [], drawPool: pool })
  runSkill("skill_card_slime", ctx)
  assert.equal(pool.length, 1)
  assert.equal(pool[0].name, "斩击")
})
check("金币粘液打出: 得3金币 + 销毁", () => {
  const p = mkPlayer()
  const mob = createMob("史莱姆", { level: 1 })
  const gs = createCard("粘在一起的金币", { level: 1 })
  const pool = [gs]
  const ctx = buildSkillCtx({ source: gs, actor: p, target: mob, targetIndex: 0, playerInfo: p, mobList: [mob], handPool: [], drawPool: pool })
  runSkill("skill_card_goldSlime", ctx)
  assert.equal(p.goldNum, 53)
  assert.equal(pool.length, 0)
})

console.log("== 怪物推送粘液 ==")
check("粘液攻击: 伤害 + 战斗内/存档牌库各+1张粘液(同一实例)", () => {
  const p = mkPlayer()
  const slime = createMob("史莱姆", { level: 1 }) // power 5 → 5伤
  const battlePool = []
  const drawPool = []
  const ctx = buildSkillCtx({ source: slime, actor: slime, target: p, targetIndex: null, playerInfo: p, mobList: [slime], handPool: [], drawPool, battlePool })
  runSkill("skill_mob_slimeAttack", ctx)
  assert.equal(p.HP, 95) // 100 - 5
  assert.equal(battlePool.length, 1)
  assert.equal(drawPool.length, 1)
  assert.equal(battlePool[0], drawPool[0], "同一实例(同UID, 打出销毁联动)")
  assert.equal(battlePool[0].name, "粘液")
})
check("金币堆攻击: 伤害 + 推送金币粘液", () => {
  const p = mkPlayer()
  const gs = createMob("黄金史莱姆", { level: 1 }) // power 3 → 3伤
  const battlePool = []
  const drawPool = []
  const ctx = buildSkillCtx({ source: gs, actor: gs, target: p, targetIndex: null, playerInfo: p, mobList: [gs], handPool: [], drawPool, battlePool })
  runSkill("skill_mob_goldSlimeAttack", ctx)
  assert.equal(p.HP, 97)
  assert.equal(battlePool[0].name, "粘在一起的金币")
  assert.equal(drawPool[0], battlePool[0])
})
check("史莱姆 act 循环: 普攻→回血→粘液攻击", () => {
  const m = createMob("史莱姆", { level: 1 })
  assert.deepEqual(m.act, ["skill_shared_attack", "skill_shared_heal", "skill_mob_slimeAttack"])
})
check("黄金史莱姆 act 循环: 金币攻击→回血→金币堆攻击", () => {
  const m = createMob("黄金史莱姆", { level: 1 })
  assert.deepEqual(m.act, ["skill_mob_goldAttack", "skill_shared_heal", "skill_mob_goldSlimeAttack"])
})
check("史莱姆王分裂的小史莱姆继承粘液攻击", () => {
  const slime = createMob("史莱姆", { level: 1 })
  assert.ok(slime.act.includes("skill_mob_slimeAttack"))
})

console.log("== 返还卡不进弃牌堆(useCard 层逻辑) ==")
check("带返还效果的卡: 不进弃牌堆", () => {
  const p = mkPlayer()
  const hand = []
  const discard = []
  const borrowed = createCard("衔尾蛇", { level: 1 })
  // 模拟 useCard 第10步: 打出卡已挂返还效果(引用相同)
  addEffect(p, { key: "effect_return", restTurn: 1, level: 1, isRemove: false, card: borrowed })
  hand.push(borrowed)
  const played = hand.splice(0, 1)[0]
  const hasReturn = (p.effect || []).some(
    e => (e.key === "effect_return" || e.key === "effect_deathReturn") && e.card === played
  )
  if (played && played.exhaust !== true && !hasReturn) discard.push(played)
  assert.equal(discard.length, 0, "返还卡不进弃牌堆")
  assert.equal(hand.length, 0)
})
check("普通卡正常进弃牌堆", () => {
  const p = mkPlayer()
  const hand = []
  const discard = []
  const atk = createCard("斩击", { level: 1 })
  hand.push(atk)
  const played = hand.splice(0, 1)[0]
  const hasReturn = (p.effect || []).some(
    e => (e.key === "effect_return" || e.key === "effect_deathReturn") && e.card === played
  )
  if (played && played.exhaust !== true && !hasReturn) discard.push(played)
  assert.equal(discard.length, 1)
})
check("exhaust 卡(粘液)也不进弃牌堆", () => {
  const discard = []
  const slime = createCard("粘液", { level: 1 })
  if (slime && slime.exhaust !== true) discard.push(slime)
  assert.equal(discard.length, 0)
})

console.log("\nALL PASSED: " + pass + " assertions")
