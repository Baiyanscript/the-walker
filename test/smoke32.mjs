// smoke32: 需求.md 2026-08-16 B/C 组——斩·夺+高频村雨 / 北斗长弓 / 千鹤·村正 / 折断的阎魔刀 /
// 电吉他 / 空城计 / dio的飞刀 / 美国小伙 / 中东小伙
import assert from "node:assert/strict"
import { createCard } from "./.cache/esm/common/data/cards.mjs"
import { gainRelic } from "./.cache/esm/common/data/relics.mjs"
import { createMob } from "./.cache/esm/common/data/mobs.mjs"
import { buildSkillCtx, runSkill } from "./.cache/esm/common/core/core_skill.mjs"
import { fireEffect } from "./.cache/esm/common/core/core_effect.mjs"
import { changeHP } from "./.cache/esm/common/core/core_basics.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}
const mkPlayer = (over = {}) => ({ HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, goldNum: 0, maxHoldCard: 10, getCardNum: 5, effect: [], relics: [], ...over })
const mkMob = (hp = 500) => ({ name: "靶子", HP: hp, maxHP: hp, power: 5, level: 1, DP: 0, effect: [], nextTurn: undefined })
const mkCtx = (over = {}) => buildSkillCtx({
  source: over.source, actor: over.actor, target: over.target,
  playerInfo: over.playerInfo || mkPlayer(), mobList: over.mobList || [],
  handPool: over.handPool || [], drawPool: over.drawPool || [],
  battlePool: over.battlePool || [], discardPool: over.discardPool || []
})

console.log("== 斩·夺 + 高频村雨 ==")
check("无村雨: 攻击10伤 + 标记挂上且不叠层", () => {
  const p = mkPlayer()
  const mob = mkMob()
  const ctx = mkCtx({ source: createCard("斩·夺", { level: 1 }), actor: p, target: mob, mobList: [mob], playerInfo: p })
  runSkill("skill_card_zhaduo", ctx)
  assert.equal(mob.HP, 490, "10伤")
  let mark = mob.effect.find(e => e.key === "effect_zhaduoMark")
  assert.ok(mark, "标记挂上")
  assert.equal(mark.level, 1)
  // 再斩一次: 无村雨 -> 不叠层(重置为 1)
  runSkill("skill_card_zhaduo", ctx)
  mark = mob.effect.find(e => e.key === "effect_zhaduoMark")
  assert.equal(mark.level, 1, "无村雨不叠层")
})
check("有村雨: 叠层, 层数>6 立即受玩家生命上限伤害", () => {
  const p = mkPlayer({ maxHP: 100 })
  gainRelic(p, "relic_gaopinCunyu")
  const mob = mkMob(120) // 6次攻击(60伤)后剩余60, 第7次攻击(10)+斩杀(100) -> 必死
  const ctx = mkCtx({ source: createCard("斩·夺", { level: 1 }), actor: p, target: mob, mobList: [mob], playerInfo: p })
  for (let i = 0; i < 6; i++) runSkill("skill_card_zhaduo", ctx) // 6次: 攻击60 + 层数6
  assert.equal(mob.effect.find(e => e.key === "effect_zhaduoMark").level, 6)
  assert.ok(mob.HP > 0, "层数6未斩杀")
  runSkill("skill_card_zhaduo", ctx) // 第7次: 层数7>6 -> 斩杀(maxHP=100 真实伤害)
  assert.equal(mob.effect.find(e => e.key === "effect_zhaduoMark").level, 7)
  assert.ok(mob.HP <= 0, "层数>6 斩杀生效")
})
check("标记: 怪物死亡 -> 玩家AP回满+恢复10%最大生命", () => {
  const p = mkPlayer({ AP: 0, HP: 50 })
  const mob = mkMob(20)
  const ctx = mkCtx({ source: createCard("斩·夺", { level: 1 }), actor: p, target: mob, mobList: [mob], playerInfo: p })
  runSkill("skill_card_zhaduo", ctx) // 攻击10 -> HP 10, 标记挂上
  changeHP(mob, -10) // 打死
  fireEffect({ trigger: "when_death", targets: mob, mobList: [mob], playerInfo: p })
  assert.equal(p.AP, 8, "AP 回满")
  assert.equal(p.HP, 60, "恢复 10% 最大生命(100×10%)")
})
check("标记: 无村雨时玩家行动后移除; 有村雨保留; 怪物行动移除", () => {
  const mob = mkMob()
  // 无村雨
  let p = mkPlayer()
  mob.effect = [{ key: "effect_zhaduoMark", restTurn: "inf", level: 1, isRemove: false }]
  fireEffect({ trigger: "when_player_act", targets: [mob], exDate: { skillCtx: {} }, mobList: [mob], playerInfo: p })
  assert.equal(mob.effect.length, 0, "无村雨: 玩家行动后标记移除")
  // 有村雨
  p = mkPlayer()
  gainRelic(p, "relic_gaopinCunyu")
  mob.effect = [{ key: "effect_zhaduoMark", restTurn: "inf", level: 1, isRemove: false }]
  fireEffect({ trigger: "when_player_act", targets: [mob], exDate: { skillCtx: {} }, mobList: [mob], playerInfo: p })
  assert.equal(mob.effect.length, 1, "有村雨: 标记保留(持续到怪物行动)")
  // 怪物行动
  fireEffect({ trigger: "when_act", targets: mob, mobList: [mob], playerInfo: p })
  assert.equal(mob.effect.length, 0, "怪物行动后标记移除")
})
check("高频村雨: 怪物行动等效power+1", () => {
  const p = mkPlayer()
  gainRelic(p, "relic_gaopinCunyu")
  const mob = mkMob()
  const skillCtx = mkCtx({ source: mob, actor: mob, target: p, mobList: [mob], playerInfo: p })
  fireEffect({ trigger: "when_mob_act", targets: p, exDate: { skillCtx }, mobList: [mob], playerInfo: p })
  assert.equal(skillCtx.power, 6, "power 5->6")
})

console.log("== 北斗长弓 ==")
check("攻击1伤 + 挂3层3回合北斗易伤", () => {
  const p = mkPlayer()
  const mob = mkMob()
  const ctx = mkCtx({ source: createCard("北斗长弓", { level: 1 }), actor: p, target: mob, mobList: [mob], playerInfo: p })
  runSkill("skill_card_beidouBow", ctx)
  assert.equal(mob.HP, 499, "1伤")
  const vuln = mob.effect.find(e => e.key === "effect_beidouVuln")
  assert.ok(vuln)
  assert.equal(vuln.level, 3)
  assert.equal(vuln.restTurn, 3)
})
check("受击追加 floor(伤害×0.5×层数)", () => {
  const p = mkPlayer()
  const mob = mkMob()
  const atk = createCard("斩击", { level: 1 }) // 8伤
  const ctx = mkCtx({ source: atk, actor: p, target: mob, mobList: [mob], playerInfo: p })
  mob.effect = [{ key: "effect_beidouVuln", restTurn: 3, level: 3, isRemove: false }]
  runSkill("skill_shared_attack", ctx)
  assert.equal(mob.HP, 500 - 8 - 12, "8伤 + 追加 floor(8×0.5×3)=12")
})
check("死亡传播: index±1 各挂层数-1; 层数1死亡不传播", () => {
  const p = mkPlayer()
  const a = mkMob(), b = mkMob(), c = mkMob()
  const mobList = [a, b, c]
  b.effect = [{ key: "effect_beidouVuln", restTurn: 3, level: 3, isRemove: false }]
  fireEffect({ trigger: "when_death", targets: b, mobList, playerInfo: p })
  const vulnA = a.effect.find(e => e.key === "effect_beidouVuln")
  const vulnC = c.effect.find(e => e.key === "effect_beidouVuln")
  assert.equal(vulnA.level, 2, "A 收到层数-1=2")
  assert.equal(vulnC.level, 2, "C 收到层数-1=2")
  assert.equal(vulnA.restTurn, 3, "传播后重新3回合")
  // 层数1死亡 -> 不传播
  a.effect = [{ key: "effect_beidouVuln", restTurn: 3, level: 1, isRemove: false }]
  fireEffect({ trigger: "when_death", targets: a, mobList: [a, b], playerInfo: p })
  assert.equal(b.effect.filter(e => e.key === "effect_beidouVuln").length, 1, "层数1不传播")
})
check("持续回合: 每回合-1, 归零移除", () => {
  const p = mkPlayer()
  const mob = mkMob()
  mob.effect = [{ key: "effect_beidouVuln", restTurn: 3, level: 3, isRemove: false }]
  fireEffect({ trigger: "when_nextTurn", targets: mob, mobList: [mob], playerInfo: p })
  assert.equal(mob.effect.find(e => e.key === "effect_beidouVuln").restTurn, 2)
  fireEffect({ trigger: "when_nextTurn", targets: mob, mobList: [mob], playerInfo: p })
  fireEffect({ trigger: "when_nextTurn", targets: mob, mobList: [mob], playerInfo: p })
  assert.equal(mob.effect.filter(e => e.key === "effect_beidouVuln").length, 0, "3回合后移除")
})

console.log("== 千鹤·村正 / 折断的阎魔刀(出牌钩子) ==")
check("千鹤·村正: 出牌目标附加5伤 + 自己1层易伤", () => {
  const p = mkPlayer()
  gainRelic(p, "relic_qianheMunemasa")
  const mob = mkMob()
  const skillCtx = mkCtx({ source: createCard("斩击", { level: 1 }), actor: p, target: mob, mobList: [mob], playerInfo: p })
  fireEffect({ trigger: "when_act", targets: p, exDate: { skillCtx }, mobList: [mob], playerInfo: p })
  assert.equal(mob.HP, 495, "附加5伤")
  const vuln = p.effect.find(e => e.key === "effect_vulnerable")
  assert.ok(vuln, "自己获得易伤")
  assert.equal(vuln.level, 1)
  assert.equal(vuln.restTurn, 1)
})
check("阎魔刀: 出牌 power 随机 +[-1,3] 等概率(mock 验证两端)", () => {
  const orig = Math.random
  try {
    const p = mkPlayer()
    gainRelic(p, "relic_brokenYamato")
    const mob = mkMob()
    // mock 0.9 -> floor(0.9*5)-1 = 3
    Math.random = () => 0.9
    let skillCtx = mkCtx({ source: createCard("斩击", { level: 1 }), actor: p, target: mob, mobList: [mob], playerInfo: p })
    fireEffect({ trigger: "when_act", targets: p, exDate: { skillCtx }, mobList: [mob], playerInfo: p })
    assert.equal(skillCtx.power, 11, "8 + 3")
    // mock 0.49 -> floor(0.49*5)-1 = 1
    Math.random = () => 0.49
    skillCtx = mkCtx({ source: createCard("斩击", { level: 1 }), actor: p, target: mob, mobList: [mob], playerInfo: p })
    fireEffect({ trigger: "when_act", targets: p, exDate: { skillCtx }, mobList: [mob], playerInfo: p })
    assert.equal(skillCtx.power, 9, "8 + 1")
  } finally { Math.random = orig }
})

console.log("== 电吉他 ==")
check("战斗开始: 25% 挂跳过首次行动(mock)", () => {
  const orig = Math.random
  try {
    const p = mkPlayer()
    gainRelic(p, "relic_electricGuitar")
    const m1 = mkMob(), m2 = mkMob()
    // mock 0.1 -> 命中; 0.9 -> 未命中
    const seq = [0.1, 0.9]
    Math.random = () => seq.shift()
    fireEffect({ trigger: "when_fightstart", targets: p, mobList: [m1, m2], playerInfo: p })
    assert.ok(m1.effect.some(e => e.key === "effect_skipFirstAct"), "25%命中: 挂跳过")
    assert.ok(!m2.effect.some(e => e.key === "effect_skipFirstAct"), "未命中: 不挂")
    // 触发: 下回合发呆一次后移除
    fireEffect({ trigger: "when_nextTurn", targets: m1, mobList: [m1, m2], playerInfo: p })
    assert.equal(m1.nextTurn, null, "本回合发呆")
    assert.ok(!m1.effect.some(e => e.key === "effect_skipFirstAct"), "一次性移除")
  } finally { Math.random = orig }
})

console.log("== 空城计 / dio的飞刀 ==")
check("空城计: 全体怪物本回合无行动", () => {
  const p = mkPlayer()
  const mobs = [mkMob(), mkMob()]
  const ctx = mkCtx({ source: createCard("空城计", { level: 1 }), actor: p, target: mobs[0], mobList: mobs, playerInfo: p })
  runSkill("skill_card_emptyFort", ctx)
  assert.equal(mobs[0].nextTurn, null)
  assert.equal(mobs[1].nextTurn, null)
})
check("dio的飞刀: 6张0费飞刀进手牌, 5伤可打出", () => {
  const p = mkPlayer()
  const hand = []
  const mob = mkMob()
  const ctx = mkCtx({ source: createCard("dio的飞刀", { level: 1 }), actor: p, target: mob, mobList: [mob], handPool: hand, playerInfo: p })
  runSkill("skill_card_dioKnives", ctx)
  assert.equal(hand.length, 6, "6张飞刀")
  for (const k of hand) {
    assert.equal(k.costAP, 0)
    assert.equal(k.exhaust, true, "打出即销毁")
    assert.equal(k.rare, "orb", "不进抽取池")
    assert.equal(k.power, 5)
  }
  const knifeCtx = mkCtx({ source: hand[0], actor: p, target: mob, mobList: [mob], playerInfo: p })
  runSkill("skill_shared_attack", knifeCtx)
  assert.equal(mob.HP, 495, "飞刀5伤")
})

console.log("== 美国小伙 / 中东小伙(释放召唤) ==")
check("美国小伙: 召唤HP20, 枪毙 index-1(有前怪打前怪, 无则打玩家)", () => {
  const p = mkPlayer()
  const front = mkMob()
  const mobList = [front]
  let ctx = mkCtx({ source: createCard("美国小伙", { level: 1 }), actor: p, target: front, mobList, playerInfo: p })
  runSkill("skill_card_america", ctx)
  const america = mobList[1]
  assert.ok(america, "召唤成功")
  assert.equal(america.HP, 20)
  assert.equal(america.name, "美国小伙")
  // 有前位 -> 打前位
  runSkill("skill_mob_americanShoot", mkCtx({ source: america, actor: america, target: p, mobList, playerInfo: p }))
  assert.equal(front.HP, 480, "枪毙前位20伤")
  // 只剩自己 -> 打玩家
  mobList.splice(0, 1)
  runSkill("skill_mob_americanShoot", mkCtx({ source: america, actor: america, target: p, mobList, playerInfo: p }))
  assert.equal(p.HP, 80, "越界打玩家20伤")
})
check("美国小伙: 3回合后自动离开", () => {
  const p = mkPlayer()
  const america = createMob("美国小伙", { level: 1 })
  const mobList = [america]
  fireEffect({ trigger: "when_nextTurn", targets: america, mobList, playerInfo: p })
  fireEffect({ trigger: "when_nextTurn", targets: america, mobList, playerInfo: p })
  assert.ok(america.HP > 0, "2回合后仍在")
  fireEffect({ trigger: "when_nextTurn", targets: america, mobList, playerInfo: p })
  assert.ok(america.HP <= 0, "3回合后退场")
})
check("中东小伙: 召唤HP10, 自爆 index±1(越界打玩家), 自爆退场", () => {
  const p = mkPlayer()
  const left = mkMob(), right = mkMob()
  const mobList = [left]
  let ctx = mkCtx({ source: createCard("中东小伙", { level: 1 }), actor: p, target: left, mobList, playerInfo: p })
  runSkill("skill_card_mideast", ctx)
  const mideast = mobList[1]
  assert.equal(mideast.HP, 10)
  // 中间位: 打 left(前) + right(后)
  mobList.push(right)
  runSkill("skill_mob_mideastBoom", mkCtx({ source: mideast, actor: mideast, target: p, mobList, playerInfo: p }))
  assert.equal(left.HP, 490, "前位10伤")
  assert.equal(right.HP, 490, "后位10伤")
  assert.ok(mideast.HP <= 0, "自爆退场")
  // 首位无前位: 打玩家 + 后位
  const p2 = mkPlayer()
  const r2 = mkMob()
  const mobList2 = [r2]
  const ctx2 = mkCtx({ source: createCard("中东小伙", { level: 1 }), actor: p2, target: r2, mobList: mobList2, playerInfo: p2 })
  runSkill("skill_card_mideast", ctx2)
  const m2 = mobList2[1]
  runSkill("skill_mob_mideastBoom", mkCtx({ source: m2, actor: m2, target: p2, mobList: mobList2, playerInfo: p2 }))
  assert.equal(p2.HP, 90, "越界打玩家10伤")
  assert.equal(r2.HP, 490, "后位10伤")
})

console.log("\nALL PASSED: " + pass + " assertions")
