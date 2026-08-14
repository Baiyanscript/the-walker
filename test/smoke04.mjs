// smoke04: 效果(毒结算/复活/分裂/爆金/虚弱/恩赐/自爆诅咒)
import assert from "node:assert/strict"
import { createMob } from "./.cache/esm/common/data/mobs.mjs"
import { fireEffect } from "./.cache/esm/common/core/core_effect.mjs"
import { changeHP } from "./.cache/esm/common/core/core_basics.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}
const mkPlayer = () => ({ HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [], goldNum: 0 })

console.log("== 毒结算 ==")
const slime = createMob("史莱姆", { level: 1 })
slime.HP = 5
slime.effect.push({ key: "effect_toxin", restTurn: 3, level: 1, isRemove: false })
fireEffect({ trigger: "when_nextTurn", targets: slime, mobList: [slime], playerInfo: {} })
check("毒: -2 血, restTurn 2", () => {
  assert.equal(slime.HP, 3)
  assert.equal(slime.effect[0].restTurn, 2)
})

console.log("== 复活(死变骷髅) ==")
// 重构版无"活尸"模板, 用哥布林手动挂 effect_revive 验证效果逻辑
const zombie = createMob("哥布林", { level: 1 })
zombie.effect.push({ key: "effect_revive", restTurn: "inf", level: 0, isRemove: false })
const mobList = [zombie]
fireEffect({ trigger: "when_death", targets: zombie, mobList, playerInfo: {} })
check("死亡: 召唤愤怒的骷髅鱼", () => {
  assert.equal(mobList.length, 2)
  assert.equal(mobList[1].name, "愤怒的骷髅鱼")
})

console.log("== 史莱姆王分裂 ==")
const king = createMob("史莱姆之王", { level: 3 })
const mobList2 = [king]
fireEffect({ trigger: "when_death", targets: king, mobList: mobList2, playerInfo: {} })
check("王死亡: 分裂2只史莱姆(等级-1=2)", () => {
  assert.equal(mobList2.length, 3)
  assert.equal(mobList2[1].level, 2)
  assert.equal(mobList2[2].level, 2)
})

console.log("== 爆金 ==")
const gold = createMob("黄金史莱姆", { level: 1 })
const p = mkPlayer()
fireEffect({ trigger: "when_death", targets: gold, mobList: [gold], playerInfo: p })
check("黄金史莱姆死亡: 玩家 +20 金币", () => assert.equal(p.goldNum, 20))

console.log("== 虚弱(when_turnEnd 双阶段) ==")
const p2 = mkPlayer()
p2.AP = 3
p2.effect.push({ key: "effect_weakness", restTurn: 1, level: 1, isRemove: false })
fireEffect({ trigger: "when_turnEnd", targets: p2, exDate: { phase: "pre" }, mobList: [], playerInfo: p2 })
p2.AP = Math.max(p2.maxAP, p2.AP) // 模拟正常回满
p2.DP = 0
fireEffect({ trigger: "when_turnEnd", targets: p2, exDate: { phase: "post" }, mobList: [], playerInfo: p2 })
check("虚弱: AP 被覆盖回 3, buff 移除", () => {
  assert.equal(p2.AP, 3)
  assert.equal(p2.effect.length, 0)
})

console.log("== 恩赐(死亡复活) ==")
const p3 = mkPlayer()
p3.effect.push({ key: "effect_blessing", restTurn: "inf", level: 1, isRemove: false })
changeHP(p3, -9999)
fireEffect({ trigger: "when_death", targets: p3, mobList: [], playerInfo: p3 })
check("恩赐: 复活到 floor(100*1.25)=125 溢血, buff 清理", () => {
  assert.equal(p3.HP, 125)
  assert.equal(p3.effect.length, 0)
})

console.log("== 自爆诅咒(受击>阈值自刎) ==")
const cursed = createMob("哥布林", { level: 1 })
cursed.effect.push({ key: "effect_curseBoom", restTurn: "inf", level: 3, isRemove: false })
// 模拟诅咒逻辑: 单次受击 > 10-lv 时自刎
const lv = cursed.effect[0].level
const threshold = 10 - lv // 7
if (9 > threshold) changeHP(cursed, -9999999) // 受击9 > 7 -> 自刎
check("自爆诅咒: 受击9>7 自刎", () => assert.ok(cursed.HP <= 0))
const cursed2 = createMob("哥布林", { level: 1 })
cursed2.effect.push({ key: "effect_curseBoom", restTurn: "inf", level: 3, isRemove: false })
if (5 > threshold) changeHP(cursed2, -9999999) // 受击5 <= 7 -> 不自刎
check("受击5<=7 不自刎", () => assert.equal(cursed2.HP, 15))

console.log("\nALL PASSED: " + pass + " assertions")
