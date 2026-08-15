// smoke20: 尖塔移植内容——新卡(痛击/剑柄打击/全身撞击) + 新怪(大颚虫/邪教徒/史莱姆老大) + 新遗物(日晷/纸鹤/芒果)
import assert from "node:assert/strict"
import { createCard, upgradeCard } from "./.cache/esm/common/data/cards.mjs"
import { createMob } from "./.cache/esm/common/data/mobs.mjs"
import { buildSkillCtx, runSkill } from "./.cache/esm/common/core/core_skill.mjs"
import { fireEffect, addEffect } from "./.cache/esm/common/core/core_effect.mjs"
import { dealDamage } from "./.cache/esm/common/core/core_basics.mjs"
import { gainRelic, relic_LIB } from "./.cache/esm/common/data/relics.mjs"
import { refillDrawPool } from "./.cache/esm/common/core/core_draw.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}
const mkPlayer = () => ({ HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [], relics: [] })

console.log("== 新卡: 字段与强化 ==")
check("痛击: 2费 power8 技能 bash", () => {
  const c = createCard("痛击", { level: 1 })
  assert.equal(c.costAP, 2)
  assert.equal(c.power, 8)
  assert.deepEqual(c.doSkill, ["skill_card_bash"])
  upgradeCard(c)
  assert.equal(c.power, 10)
  assert.equal(c.name, "痛击+")
})
check("剑柄打击: 1费 power7, 升级 power9", () => {
  const c = createCard("剑柄打击", { level: 1 })
  assert.equal(c.costAP, 1)
  upgradeCard(c)
  assert.equal(c.power, 9)
})
check("全身撞击: 1费, 升级 0费", () => {
  const c = createCard("全身撞击", { level: 1 })
  assert.equal(c.costAP, 1)
  upgradeCard(c)
  assert.equal(c.costAP, 0)
})

console.log("== 痛击 + 易伤 ==")
check("痛击: 伤害 + 挂2层易伤(持续2回合)", () => {
  const p = mkPlayer()
  const mob = createMob("史莱姆", { level: 1 }) // HP 10
  const card = createCard("痛击", { level: 1 })
  const skillCtx = buildSkillCtx({ source: card, actor: p, target: mob, targetIndex: 0, playerInfo: p, mobList: [mob], handPool: [] })
  runSkill("skill_card_bash", skillCtx)
  assert.equal(mob.HP, 2) // 10 - 8
  const vuln = mob.effect.find(e => e.key === "effect_vulnerable")
  assert.ok(vuln)
  assert.equal(vuln.level, 2)
  assert.equal(vuln.restTurn, 2)
})
check("易伤: 受击追加 100%(2层), 追加不再递归", () => {
  const mob = createMob("史莱姆", { level: 3 }) // HP 20(2026-08-15: 10×2.0), power 5
  addEffect(mob, { key: "effect_vulnerable", restTurn: 2, level: 2, isRemove: false })
  // 真实伤害管线: 主伤害 10 触发 when_damaged → 易伤追加 floor(10*0.5*2)=10
  // (dealDamage 的 when_damaged 触发能力需显式传 fireEffect, 见 core_basics.js)
  dealDamage({ name: "玩家" }, mob, 10, { fireEffect, isFireEffect: true, mobList: [mob], playerInfo: {} })
  // 20 - 10(主) - 10(追加) = 0
  assert.equal(mob.HP, 0)
  // 无递归: effect 只挂了一次, 追加伤害(isFireEffect:false)不会再触发
  assert.equal(mob.effect.filter(e => e.key === "effect_vulnerable").length, 1)
})
check("易伤: 回合开始递减, 归零移除", () => {
  const mob = createMob("史莱姆", { level: 1 })
  addEffect(mob, { key: "effect_vulnerable", restTurn: 2, level: 2, isRemove: false })
  fireEffect({ trigger: "when_nextTurn", targets: mob, mobList: [mob], playerInfo: {} })
  const vuln = mob.effect.find(e => e.key === "effect_vulnerable")
  assert.equal(vuln.restTurn, 1)
  fireEffect({ trigger: "when_nextTurn", targets: mob, mobList: [mob], playerInfo: {} })
  assert.equal(mob.effect.find(e => e.key === "effect_vulnerable"), undefined)
})

console.log("== 剑柄打击: 攻击 + 抽牌 ==")
check("剑柄打击: 打8伤(level1 power8*?) 抽1张", () => {
  const p = mkPlayer()
  const mob = createMob("史莱姆", { level: 1 })
  const card = createCard("剑柄打击", { level: 1 }) // power 7
  const battlePool = [createCard("斩击", { level: 1 }), createCard("持盾", { level: 1 })]
  const discard = []
  const hand = []
  const skillCtx = buildSkillCtx({ source: card, actor: p, target: mob, targetIndex: 0, playerInfo: p, mobList: [mob], handPool: hand, battlePool, discard })
  runSkill("skill_card_pommel", skillCtx)
  assert.equal(mob.HP, 3) // 10 - 7
  assert.equal(hand.length, 1)
  assert.equal(battlePool.length, 1)
})
check("剑柄打击: 抽牌堆空时洗弃牌堆再抽", () => {
  const p = mkPlayer()
  const mob = createMob("史莱姆", { level: 1 })
  const card = createCard("剑柄打击", { level: 1 })
  const battlePool = []
  const discard = [createCard("斩击", { level: 1 }), createCard("持盾", { level: 1 })]
  const hand = []
  const skillCtx = buildSkillCtx({ source: card, actor: p, target: mob, targetIndex: 0, playerInfo: p, mobList: [mob], handPool: hand, battlePool, discardPool: discard })
  runSkill("skill_card_pommel", skillCtx)
  assert.equal(hand.length, 1)
  assert.equal(battlePool.length, 1) // 洗回2张, 抽走1张
  assert.equal(discard.length, 0) // 弃牌堆全部洗回
})
check("剑柄打击: 手牌满不抽", () => {
  const p = mkPlayer()
  p.maxHoldCard = 2
  const mob = createMob("史莱姆", { level: 1 })
  const card = createCard("剑柄打击", { level: 1 })
  const battlePool = [createCard("斩击", { level: 1 })]
  const hand = [{ uid: "x", name: "占位" }, { uid: "y", name: "占位" }]
  const skillCtx = buildSkillCtx({ source: card, actor: p, target: mob, targetIndex: 0, playerInfo: p, mobList: [mob], handPool: hand, battlePool })
  runSkill("skill_card_pommel", skillCtx)
  assert.equal(hand.length, 2)
  assert.equal(battlePool.length, 1)
})
check("剑柄打击: 洗牌触发 when_shuffle(与抽卡流程口径一致, 日晷计数)", () => {
  const p = mkPlayer()
  gainRelic(p, "relic_sundial")
  const mob = createMob("史莱姆", { level: 1 })
  // 每次出剑柄打击: 抽牌堆空 + 弃牌堆有牌 -> 洗牌 -> 触发 when_shuffle(日晷 +1 计数)
  const pommelWithShuffle = () => {
    const card = createCard("剑柄打击", { level: 1 })
    const battlePool = []
    const discard = [createCard("斩击", { level: 1 }), createCard("持盾", { level: 1 })]
    const hand = []
    const skillCtx = buildSkillCtx({ source: card, actor: p, target: mob, targetIndex: 0, playerInfo: p, mobList: [mob], handPool: hand, battlePool, discardPool: discard })
    runSkill("skill_card_pommel", skillCtx)
  }
  pommelWithShuffle()
  pommelWithShuffle()
  assert.equal(p.AP, 8) // 洗牌 2 次: 未满 3, 不加 AP
  pommelWithShuffle()
  assert.equal(p.AP, 10) // 洗牌 3 次: 日晷 AP+2
})

console.log("== 全身撞击: 伤害=护盾×本体数值 ==")
check("全身撞击: DP 12 × 数值1 = 12 伤", () => {
  const p = mkPlayer()
  p.DP = 12
  const mob = createMob("史莱姆", { level: 3 }) // HP 20(2026-08-15: 10×2.0)
  const card = createCard("全身撞击", { level: 1 })
  const skillCtx = buildSkillCtx({ source: card, actor: p, target: mob, targetIndex: 0, playerInfo: p, mobList: [mob], handPool: [] })
  runSkill("skill_card_bodySlam", skillCtx)
  assert.equal(mob.HP, 8)
})
check("全身撞击: 无盾打 0, level 翻倍", () => {
  const p = mkPlayer()
  const mob = createMob("史莱姆", { level: 1 })
  const skillCtx = buildSkillCtx({ source: createCard("全身撞击", { level: 2 }), actor: p, target: mob, targetIndex: 0, playerInfo: p, mobList: [mob], handPool: [] })
  runSkill("skill_card_bodySlam", skillCtx) // DP=0 → 0 伤
  assert.equal(mob.HP, 10)
})

console.log("== 新怪 ==")
check("大颚虫: HP18 power5 rare1, 4技能循环", () => {
  const m = createMob("大颚虫", { level: 1 })
  assert.equal(m.HP, 18)
  assert.equal(m.power, 5)
  assert.equal(m.rare, 1)
  assert.deepEqual(m.act, ["skill_shared_attack", "skill_mob_anger", "skill_shared_attack", "skill_shared_defend"])
})
check("邪教徒: 仪式每回合 power+2", () => {
  const m = createMob("邪教徒", { level: 1 })
  assert.equal(m.power, 4)
  fireEffect({ trigger: "when_nextTurn", targets: m, mobList: [m], playerInfo: {} })
  assert.equal(m.power, 6)
  fireEffect({ trigger: "when_nextTurn", targets: m, mobList: [m], playerInfo: {} })
  assert.equal(m.power, 8)
})
check("史莱姆老大: BOSS 字段 + 残血分裂", () => {
  const m = createMob("史莱姆老大", { level: 1 })
  assert.equal(m.HP, 100)
  assert.equal(m.maxHP, 100)
  assert.equal(m.rare, "BOSS")
  assert.equal(m.power, 8)
  assert.deepEqual(m.act, ["skill_shared_defend", "skill_shared_attack", "skill_card_poison"])
})
check("史莱姆老大: 半血以下分裂成2只史莱姆, 本体退场, 仅一次", () => {
  const m = createMob("史莱姆老大", { level: 1 })
  const mobList = [m]
  const p = mkPlayer()
  // 打 60 伤: 100 → 40 (< 50), 触发分裂(when_damaged 触发能力需显式传 fireEffect)
  dealDamage({ name: "玩家" }, m, 60, { fireEffect, isFireEffect: true, mobList, playerInfo: p })
  assert.equal(mobList.length, 3) // 本体 + 2 史莱姆
  const slimes = mobList.filter(x => x !== m)
  assert.equal(slimes.length, 2)
  assert.equal(slimes[0].name, "史莱姆")
  assert.equal(m.HP, 0) // 本体退场
  // 仅分裂一次: 分裂后再受击不再召唤
  const m2 = createMob("史莱姆老大", { level: 1 })
  const list2 = [m2]
  dealDamage({ name: "玩家" }, m2, 60, { fireEffect, isFireEffect: true, mobList: list2, playerInfo: p }) // 触发分裂
  assert.equal(list2.filter(x => x !== m2).length, 2)
  dealDamage({ name: "玩家" }, m2, 10, { fireEffect, isFireEffect: true, mobList: list2, playerInfo: p }) // 再次受击
  assert.equal(list2.filter(x => x !== m2).length, 2) // 不新增(共2只, 不是4只)
})

console.log("== 新遗物 ==")
check("日晷: 每洗牌3次 AP+2", () => {
  const p = mkPlayer()
  gainRelic(p, "relic_sundial")
  fireEffect({ trigger: "when_shuffle", targets: p, mobList: [], playerInfo: p })
  fireEffect({ trigger: "when_shuffle", targets: p, mobList: [], playerInfo: p })
  assert.equal(p.AP, 8)
  fireEffect({ trigger: "when_shuffle", targets: p, mobList: [], playerInfo: p })
  assert.equal(p.AP, 10) // +2 突破上限
  fireEffect({ trigger: "when_shuffle", targets: p, mobList: [], playerInfo: p })
  assert.equal(p.AP, 10) // 重新计数
})
check("纸鹤: 攻击易伤目标 ×1.5", () => {
  const p = mkPlayer()
  gainRelic(p, "relic_paperKrane")
  const vulnMob = createMob("史莱姆", { level: 1 })
  addEffect(vulnMob, { key: "effect_vulnerable", restTurn: 2, level: 2, isRemove: false }) // 挂易伤
  const card = createCard("斩击", { level: 1 }) // power 8
  const skillCtx = buildSkillCtx({ source: card, actor: p, target: vulnMob, targetIndex: 0, playerInfo: p, mobList: [vulnMob], handPool: [] })
  fireEffect({ trigger: "when_act", targets: p, exDate: { skillCtx }, mobList: [vulnMob], playerInfo: p })
  assert.equal(skillCtx.power, 12) // ceil(8*1.5)=12
})
check("纸鹤: 无易伤目标不增伤", () => {
  const p = mkPlayer()
  gainRelic(p, "relic_paperKrane")
  const mob = createMob("史莱姆", { level: 1 })
  const card = createCard("斩击", { level: 1 })
  const skillCtx = buildSkillCtx({ source: card, actor: p, target: mob, targetIndex: 0, playerInfo: p, mobList: [mob], handPool: [] })
  fireEffect({ trigger: "when_act", targets: p, exDate: { skillCtx }, mobList: [mob], playerInfo: p })
  assert.equal(skillCtx.power, 8)
})
check("芒果: 最大生命+10 并回 10 血", () => {
  const p = mkPlayer()
  p.HP = 50
  assert.ok(gainRelic(p, "relic_mango"))
  assert.equal(p.maxHP, 110)
  assert.equal(p.HP, 60)
  assert.equal(p.effect.length, 0) // 即时生效, 无效果
})
check("遗物表完整性: 新增3个遗物可获取", () => {
  for (const key of ["relic_sundial", "relic_paperKrane", "relic_mango"]) {
    assert.ok(relic_LIB[key], key)
  }
})

console.log("\nALL PASSED: " + pass + " assertions")
