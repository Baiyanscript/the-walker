// smoke26: 需求.md 2026-08-13 第三轮——遗物slot系列(术石) + 球卡体系(失落引擎) + 75层BOSS(铜制机械人偶)
import assert from "node:assert/strict"
import { createCard, cardByRare } from "./.cache/esm/data/cards.mjs"
import { createMob, mobByRare } from "./.cache/esm/data/mobs.mjs"
import { buildSkillCtx, runSkill } from "./.cache/esm/core/skill.mjs"
import { fireEffect, addEffect } from "./.cache/esm/core/effect.mjs"
import { gainRelic, relic_LIB } from "./.cache/esm/data/relics.mjs"
import { getLevelScript, preset_LIB } from "./.cache/esm/data/presets.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}
const mkPlayer = () => ({ HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, power: 0, effect: [], relics: [], goldNum: 50 })
const mkPlayCtx = (over = {}) => {
  const p = over.playerInfo || mkPlayer()
  return buildSkillCtx({
    source: over.source, actor: p, target: over.target,
    playerInfo: p, mobList: over.mobList || [],
    handPool: over.handPool || [], drawPool: over.drawPool || [],
    battlePool: over.battlePool || [], discardPool: over.discardPool || []
  })
}

console.log("== 遗物 slot 机制(术石) ==")
check("魔像之心/复苏之叶: slot=ring", () => {
  assert.equal(relic_LIB.relic_golemHeart.slot, "ring")
  assert.equal(relic_LIB.relic_leafOfRevival.slot, "ring")
})
check("同slot替换: 先魔像之心后复苏之叶, 旧的被移除", () => {
  const p = mkPlayer()
  assert.ok(gainRelic(p, "relic_golemHeart"))
  assert.equal(p.relics.length, 1)
  assert.equal(p.relics[0].key, "relic_golemHeart")
  assert.ok(p.effect.some(e => e.key === "effect_relic_golemHeart"))
  // 获得同 slot 的复苏之叶 -> 替换
  assert.ok(gainRelic(p, "relic_leafOfRevival"))
  assert.equal(p.relics.length, 1, "同槽仅1个")
  assert.equal(p.relics[0].key, "relic_leafOfRevival")
  assert.ok(!p.effect.some(e => e.key === "effect_relic_golemHeart"), "旧遗物效果应移除")
  assert.ok(p.effect.some(e => e.key === "effect_relic_leafOfRevival"), "新遗物效果挂上")
})
check("不同slot共存: 戒指+普通遗物不冲突", () => {
  const p = mkPlayer()
  gainRelic(p, "relic_golemHeart")
  gainRelic(p, "relic_vajra") // 无 slot
  assert.equal(p.relics.length, 2)
  assert.ok(p.relics.some(x => x.key === "relic_golemHeart"))
  assert.ok(p.relics.some(x => x.key === "relic_vajra"))
})

console.log("== 魔像之心 ==")
check("DP为0 -> 20盾", () => {
  const p = mkPlayer()
  gainRelic(p, "relic_golemHeart")
  p.DP = 0
  fireEffect({ trigger: "when_nextTurn", targets: p, mobList: [], playerInfo: p })
  assert.equal(p.DP, 20)
})
check("DP不为0 -> 仅4盾", () => {
  const p = mkPlayer()
  gainRelic(p, "relic_golemHeart")
  p.DP = 10
  fireEffect({ trigger: "when_nextTurn", targets: p, mobList: [], playerInfo: p })
  assert.equal(p.DP, 14)
})

console.log("== 复苏之叶 ==")
check("出牌回2血(封顶)", () => {
  const p = mkPlayer()
  gainRelic(p, "relic_leafOfRevival")
  p.HP = 50
  const ctx = mkPlayCtx({ source: createCard("斩击", { level: 1 }), playerInfo: p, target: createMob("史莱姆", { level: 1 }), mobList: [] })
  fireEffect({ trigger: "when_act", targets: p, exDate: { ctx }, mobList: [], playerInfo: p })
  assert.equal(p.HP, 52)
})
check("每回合AP+1(可超上限)", () => {
  const p = mkPlayer()
  gainRelic(p, "relic_leafOfRevival")
  p.AP = 8
  fireEffect({ trigger: "when_nextTurn", targets: p, mobList: [], playerInfo: p })
  assert.equal(p.AP, 9)
  fireEffect({ trigger: "when_nextTurn", targets: p, mobList: [], playerInfo: p })
  assert.equal(p.AP, 10) // 突破 maxAP 8
})

console.log("== 球卡体系(失落引擎) ==")
check("球卡: 0费 exhaust rare=orb 不进抽取池", () => {
  for (const key of ["闪电球", "冰霜球"]) {
    const c = createCard(key, { level: 1 })
    assert.equal(c.costAP, 0)
    assert.equal(c.exhaust, true)
    assert.equal(c.rare, "orb")
    for (const rare of [1, 2, 3, "boss"]) {
      assert.ok(!cardByRare[rare].includes(key), `${key} 不应在 rare${rare} 池`)
    }
  }
})
check("产球: 按costAP产球进战斗抽牌堆", () => {
  const p = mkPlayer()
  p.effect = [{ key: "effect_orbGenerator", restTurn: "inf", level: 1, isRemove: false }]
  const battlePool = []
  const mob = createMob("史莱姆", { level: 1 })
  const gen = (cost) => {
    const ctx = mkPlayCtx({ source: { name: "t", costAP: cost, doSkill: ["skill_shared_attack"], power: 1, level: 1 }, playerInfo: p, target: mob, mobList: [mob], battlePool })
    fireEffect({ trigger: "when_act", targets: p, exDate: { ctx }, mobList: [mob], playerInfo: p, handPool: [], battlePool })
  }
  gen(0) // 0费 -> 0球
  assert.equal(battlePool.length, 0)
  gen(2) // 1~4费 -> 1球
  assert.equal(battlePool.length, 1)
  assert.equal(battlePool[0].rare, "orb")
  gen(6) // >4费 -> 2球
  assert.equal(battlePool.length, 3)
})
check("三消: 总球数<=2打出无效果", () => {
  const p = mkPlayer()
  const mob = createMob("史莱姆", { level: 1 }) // HP10
  const orb = createCard("闪电球", { level: 1 })
  const hand = [orb]
  const battlePool = [createCard("冰霜球", { level: 1 })] // 共2球
  const ctx = mkPlayCtx({ source: orb, playerInfo: p, target: mob, mobList: [mob], handPool: hand, battlePool })
  runSkill("skill_orb_lightning", ctx)
  assert.equal(mob.HP, 10, "不足3球不触发")
  assert.equal(battlePool.length, 1, "球未被销毁")
})
check("三消: 总球数>=3打出连携所有球", () => {
  const p = mkPlayer()
  const mob = createMob("史莱姆之王", { level: 1 }) // HP25
  const orb = createCard("闪电球", { level: 1 }) // power6
  const hand = [orb]
  const battlePool = [createCard("闪电球", { level: 1 }), createCard("冰霜球", { level: 1 })] // 共3球
  const discardPool = []
  const ctx = mkPlayCtx({ source: orb, playerInfo: p, target: mob, mobList: [mob], handPool: hand, battlePool, discardPool })
  runSkill("skill_orb_lightning", ctx)
  // 3球全部连携: 2闪电(6伤×2=12) + 1冰霜(8盾)
  assert.equal(mob.HP, 25 - 12, "两个闪电球各6伤")
  assert.equal(p.DP, 8, "冰霜球给8盾")
  assert.equal(battlePool.length, 0, "连携后球全部销毁")
  assert.equal(discardPool.length, 0, "球不进弃牌堆")
})

console.log("== 失落引擎预设 ==")
check("预设: 高AP 90血, 常驻产球效果, 开局3球", () => {
  const preset = preset_LIB["失落引擎"]
  assert.ok(preset, "失落引擎预设存在")
  assert.equal(preset.maxHP, 90)
  assert.equal(preset.maxAP, 10)
  assert.ok(preset.effect.some(e => e.key === "effect_orbGenerator"))
  const orbs = preset.initialCard.filter(c => c.rare === "orb")
  assert.equal(orbs.length, 3)
})

console.log("== 铜制机械人偶(75层BOSS) ==")
check("铜制机械人偶: HP400 BOSS, 召唤+双击+强化+光束循环", () => {
  const m = createMob("铜制机械人偶", { level: 1 })
  assert.equal(m.HP, 400)
  assert.equal(m.power, 6)
  assert.equal(m.rare, "BOSS")
  assert.deepEqual(m.act, ["skill_mob_summonOrb", "skill_mob_doubleHit", "skill_mob_boost",
    "skill_mob_doubleHit", "skill_mob_boost", "skill_mob_hyperBeam", "skill_shared_idle"])
})
check("铜球: hidden 不进随机池, 攻击/保护循环", () => {
  const m = createMob("铜球", { level: 1 })
  assert.equal(m.HP, 30)
  assert.equal(m.rare, 1)
  assert.ok(!mobByRare[1].some(e => e.key === "铜球"), "铜球不应进 rare1 池")
  assert.deepEqual(m.act, ["skill_shared_attack", "skill_shared_attack", "skill_mob_protectBeam", "skill_shared_attack"])
})
check("召唤铜球: 2只, 等级+2, 本回合不行动", () => {
  const boss = createMob("铜制机械人偶", { level: 1 })
  const mobList = [boss]
  const p = mkPlayer()
  const ctx = mkPlayCtx({ source: boss, playerInfo: p, target: p, mobList })
  runSkill("skill_mob_summonOrb", ctx)
  const orbs = mobList.filter(m => m.name === "铜球")
  assert.equal(orbs.length, 2)
  assert.equal(orbs[0].level, 3)
  assert.equal(orbs[0].nextTurn, null)
})
check("强化: power+2 且加盾; 光束: 2.5倍伤害", () => {
  const boss = createMob("铜制机械人偶", { level: 1 }) // power6
  const p = mkPlayer()
  // 怪物行动 ctx: source=actor=boss, target=玩家
  const mkMobCtx = () => buildSkillCtx({
    source: boss, actor: boss, target: p,
    playerInfo: p, mobList: [boss],
    handPool: [], drawPool: [], battlePool: [], discardPool: []
  })
  runSkill("skill_mob_boost", mkMobCtx())
  assert.equal(boss.power, 8)
  assert.equal(boss.DP, 10)
  runSkill("skill_mob_hyperBeam", mkMobCtx())
  assert.equal(p.HP, 100 - 20) // 8*1*2.5 = 20
})
check("75层固定BOSS: 铜制机械人偶", () => {
  const s75 = getLevelScript(75, "战士")
  assert.ok(s75)
  assert.equal(s75.nodes[0].mobSet[0].addMob[0].key, "铜制机械人偶")
  assert.equal(s75.nodes[0].exDate.isBoss, true)
})
check("铜制核心遗物: 战斗开始召唤1铜球", () => {
  const p = mkPlayer()
  gainRelic(p, "relic_copperCore")
  const mobList = []
  fireEffect({ trigger: "when_fightstart", targets: p, mobList, playerInfo: p })
  assert.equal(mobList.length, 1)
  assert.equal(mobList[0].name, "铜球")
})

console.log("\nALL PASSED: " + pass + " assertions")
