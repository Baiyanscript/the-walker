// smoke11: 替罪羊(effect_scapegoat) —— 全量扫描 when_act, 多替罪羊不特殊处理(后遍历者覆盖)
import assert from "node:assert/strict"
import { createCard } from "./.cache/esm/data/cards.mjs"
import { createMob } from "./.cache/esm/data/mobs.mjs"
import { buildSkillCtx, runSkill } from "./.cache/esm/core_skill.mjs"
import { addEffect, fireEffect } from "./.cache/esm/core_effect.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}

// 模拟 fighting.ux 玩家出牌流程: 构建ctx -> when_act(扫玩家) + when_player_act(扫怪物) -> 重算targetIndex -> 执行技能
function simulatePlayerAct(player, mobs, card, targetIdx) {
  const target = mobs[targetIdx]
  const ctx = buildSkillCtx({
    source: card, actor: player, target,
    targetIndex: mobs.indexOf(target),
    playerInfo: player, mobList: mobs,
    handPool: [], drawPool: []
  })
  fireEffect({
    trigger: "when_act",
    targets: player,
    exDate: { ctx, buildSkillCtx },
    mobList: mobs,
    playerInfo: player
  })
  fireEffect({
    trigger: "when_player_act",
    targets: mobs,
    exDate: { ctx, buildSkillCtx },
    mobList: mobs,
    playerInfo: player
  })
  ctx.targetIndex = mobs.indexOf(ctx.target)
  for (const s of (ctx.source.doSkill || [])) runSkill(s, ctx)
  return ctx
}

console.log("== 单替罪羊: 指向另一怪的行动被重定向 ==")
const mobs = [createMob("史莱姆", { level: 1 }), createMob("哥布林", { level: 1 })]
addEffect(mobs[1], { key: "effect_scapegoat", restTurn: "inf", level: 1, isRemove: false })
const player = { HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [], goldNum: 0 }
const hpBefore = [mobs[0].HP, mobs[1].HP]
simulatePlayerAct(player, mobs, createCard("斩击", { level: 1 }), 0) // 本意打史莱姆
check("重定向到替罪羊: 史莱姆满血, 哥布林 -8", () => {
  assert.equal(mobs[0].HP, hpBefore[0])
  assert.equal(mobs[1].HP, hpBefore[1] - 8)
})

console.log("== 多个替罪羊: 攻击最后一个被遍历的 ==")
const mobs2 = [createMob("史莱姆", { level: 1 }), createMob("哥布林", { level: 1 }), createMob("苦力怕", { level: 1 })]
addEffect(mobs2[1], { key: "effect_scapegoat", restTurn: "inf", level: 1, isRemove: false })
addEffect(mobs2[2], { key: "effect_scapegoat", restTurn: "inf", level: 1, isRemove: false })
const p2 = { HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [], goldNum: 0 }
const hp2 = mobs2.map(m => m.HP)
simulatePlayerAct(p2, mobs2, createCard("斩击", { level: 1 }), 0) // 打史莱姆
check("重定向到最后一个被遍历的替罪羊(苦力怕) -8", () => {
  assert.equal(mobs2[0].HP, hp2[0])
  assert.equal(mobs2[1].HP, hp2[1])
  assert.equal(mobs2[2].HP, hp2[2] - 8)
})

console.log("== 目标为玩家: 替罪羊不介入 ==")
const mobs3 = [createMob("史莱姆", { level: 1 })]
addEffect(mobs3[0], { key: "effect_scapegoat", restTurn: "inf", level: 1, isRemove: false })
const p3 = { HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [], goldNum: 0 }
const ctx3 = buildSkillCtx({ source: createCard("斩击", { level: 1 }), actor: p3, target: p3, targetIndex: -1, playerInfo: p3, mobList: mobs3, handPool: [], drawPool: [] })
fireEffect({ trigger: "when_player_act", targets: mobs3, exDate: { ctx: ctx3, buildSkillCtx }, mobList: mobs3, playerInfo: p3 })
check("目标(玩家)不在怪物组, 不重定向", () => assert.equal(ctx3.target, p3))

console.log("== 目标已是替罪羊自己: 不再重定向(防环) ==")
const mobs4 = [createMob("史莱姆", { level: 1 })]
addEffect(mobs4[0], { key: "effect_scapegoat", restTurn: "inf", level: 1, isRemove: false })
const p4 = { HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [], goldNum: 0 }
const ctx4 = buildSkillCtx({ source: createCard("斩击", { level: 1 }), actor: p4, target: mobs4[0], targetIndex: 0, playerInfo: p4, mobList: mobs4, handPool: [], drawPool: [] })
fireEffect({ trigger: "when_player_act", targets: mobs4, exDate: { ctx: ctx4, buildSkillCtx }, mobList: mobs4, playerInfo: p4 })
check("目标已是自己, 保持指向", () => assert.equal(ctx4.target, mobs4[0]))

console.log("== 狂乱与替罪羊共存: 狂乱先随机, 替罪羊再拉回(指向怪时) ==")
const mobs5 = [createMob("史莱姆", { level: 1 }), createMob("哥布林", { level: 1 })]
addEffect(mobs5[1], { key: "effect_scapegoat", restTurn: "inf", level: 1, isRemove: false })
const p5 = { HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [], goldNum: 0 }
// 玩家挂狂乱(发作1次)
addEffect(p5, { key: "effect_madness", restTurn: 1, level: 1, isRemove: false })
const origRandom = Math.random
Math.random = () => 0.0 // 狂乱随机池 [史莱姆, 哥布林, 玩家] 取第一个 -> 史莱姆
const ctx5 = buildSkillCtx({ source: createCard("斩击", { level: 1 }), actor: p5, target: mobs5[0], targetIndex: 0, playerInfo: p5, mobList: mobs5, handPool: [], drawPool: [] })
fireEffect({ trigger: "when_act", targets: p5, exDate: { ctx: ctx5, buildSkillCtx }, mobList: mobs5, playerInfo: p5 })
fireEffect({ trigger: "when_player_act", targets: mobs5, exDate: { ctx: ctx5, buildSkillCtx }, mobList: mobs5, playerInfo: p5 })
Math.random = origRandom
check("狂乱把目标改史莱姆后, 替罪羊将其拉回哥布林", () => assert.equal(ctx5.target, mobs5[1]))

console.log("== 语义隔离: 怪物身上的 when_act 效果(狂乱)不劫持玩家行动 ==")
const mobs6 = [createMob("史莱姆", { level: 1 }), createMob("哥布林", { level: 1 })]
addEffect(mobs6[0], { key: "effect_madness", restTurn: 1, level: 1, isRemove: false }) // 史莱姆挂狂乱(怪物版行动者效果)
addEffect(mobs6[1], { key: "effect_scapegoat", restTurn: "inf", level: 1, isRemove: false }) // 哥布林是替罪羊
const p6 = { HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [], goldNum: 0 }
const hp6 = mobs6.map(m => m.HP)
simulatePlayerAct(p6, mobs6, createCard("斩击", { level: 1 }), 0) // 打史莱姆
check("怪物狂乱不触发(目标未被劫持), 替罪羊正常拉回哥布林", () => {
  assert.equal(mobs6[0].HP, hp6[0]) // 史莱姆满血
  assert.equal(mobs6[1].HP, hp6[1] - 8) // 替罪羊哥布林 -8
})

console.log("\nALL PASSED: " + pass + " assertions")
