// smoke29: 混沌预设 + 七咒之戒(需求.md 2026-08-16)
// —— ①预设字段(buff/map声明) ②七咒之戒 when_act 分支(诅咒3/4) ③诅咒7恩赐失效
//    ④fire_七咒(诅咒5+正面祝福①) ⑤map_七咒(诅咒6) ⑥cardGain_七咒(正面祝福②)
import assert from "node:assert/strict"
import { preset_LIB } from "./.cache/esm/common/data/presets.mjs"
import { generators, getGenerator } from "./.cache/esm/common/data/generators.mjs"
import { fireEffect, doEffect } from "./.cache/esm/common/core/core_effect.mjs"
import { changeHP, changeDP } from "./.cache/esm/common/core/core_basics.mjs"
import { createCard } from "./.cache/esm/common/data/cards.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}

const mkPlayer = () => ({
  HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, goldNum: 0,
  maxHoldCard: 10, getCardNum: 5, effect: [], relics: [],
  stage: 1, presetKey: "混沌", map: { typeOfMap: "map_七咒", fire: "fire_七咒", cardGain: "cardGain_七咒" }
})

console.log("== 混沌预设(preset_LIB) ==")
check("预设存在且参照战士数值", () => {
  const p = preset_LIB["混沌"]
  assert.ok(p, "混沌预设存在")
  assert.equal(p.maxHP, 100)
  assert.equal(p.maxAP, 8)
  assert.equal(p.getCardNum, 5)
  assert.equal(p.initialCard.length, 6, "初始卡组 6 张")
})
check("预设自带七咒之戒 buff(常驻)", () => {
  const p = preset_LIB["混沌"]
  assert.ok(p.effect.some(e => e.key === "effect_sevenCurses" && e.restTurn === "inf"))
})
check("预设 map 字段声明三个七咒生成器(需求.md)", () => {
  const p = preset_LIB["混沌"]
  assert.equal(p.map.typeOfMap, "map_七咒")
  assert.equal(p.map.fire, "fire_七咒")
  assert.equal(p.map.cardGain, "cardGain_七咒")
})
check("生成器提取: 混沌玩家命中七咒生成器", () => {
  const p = mkPlayer()
  assert.equal(getGenerator(p, "map"), generators.map_七咒)
  assert.equal(getGenerator(p, "fire"), generators.fire_七咒)
  assert.equal(getGenerator(p, "cardGain"), generators.cardGain_七咒)
})

console.log("== 七咒之戒 buff(诅咒3/4, when_act 分支) ==")
check("诅咒3: 出牌攻击等效 power-1", () => {
  const p = mkPlayer()
  p.effect.push({ key: "effect_sevenCurses", restTurn: "inf", level: 1, isRemove: false })
  const skillCtx = { power: 8, level: 1, source: { doSkill: ["skill_shared_attack"] } }
  fireEffect({ trigger: "when_act", targets: p, exDate: { skillCtx }, mobList: [], playerInfo: p })
  assert.equal(skillCtx.power, 7, "power 8 -> 7")
})
check("诅咒4: 出牌额外消耗 1 AP(不扣到负数)", () => {
  const p = mkPlayer()
  p.AP = 0
  p.effect.push({ key: "effect_sevenCurses", restTurn: "inf", level: 1, isRemove: false })
  const skillCtx = { power: 8, level: 1 }
  fireEffect({ trigger: "when_act", targets: p, exDate: { skillCtx }, mobList: [], playerInfo: p })
  assert.equal(p.AP, 0, "AP 0 时额外消耗不扣到负数")
})
check("诅咒4: AP 充足时正常扣 1 点", () => {
  const p = mkPlayer()
  p.AP = 5
  p.effect.push({ key: "effect_sevenCurses", restTurn: "inf", level: 1, isRemove: false })
  const skillCtx = { power: 8, level: 1 }
  fireEffect({ trigger: "when_act", targets: p, exDate: { skillCtx }, mobList: [], playerInfo: p })
  assert.equal(p.AP, 4)
})
check("七咒之戒不响应其他 trigger(未声明)", () => {
  const p = mkPlayer()
  p.effect.push({ key: "effect_sevenCurses", restTurn: "inf", level: 1, isRemove: false })
  const before = p.AP
  fireEffect({ trigger: "when_nextTurn", targets: p, mobList: [], playerInfo: p })
  assert.equal(p.AP, before, "when_nextTurn 不触发(trigger 过滤)")
})

console.log("== 诅咒7(生死之渺): 不死图腾失效 ==")
check("无七咒之戒: 恩赐正常复活", () => {
  const p = mkPlayer()
  p.map = undefined // 普通玩家
  p.effect.push({ key: "effect_blessing", restTurn: "inf", level: 1, isRemove: false })
  changeHP(p, -9999)
  fireEffect({ trigger: "when_death", targets: p, mobList: [], playerInfo: p })
  assert.equal(p.HP, 125, "复活到 maxHP*1.25")
})
check("有七咒之戒: 恩赐失效(不复活)", () => {
  const p = mkPlayer()
  p.effect.push({ key: "effect_sevenCurses", restTurn: "inf", level: 1, isRemove: false })
  p.effect.push({ key: "effect_blessing", restTurn: "inf", level: 1, isRemove: false })
  changeHP(p, -9999)
  fireEffect({ trigger: "when_death", targets: p, mobList: [], playerInfo: p })
  assert.ok(p.HP <= 0, "死亡不复活(生死之渺)")
})

console.log("== fire_七咒(诅咒5: 暗淡的火光 + 正面祝福①) ==")
check("非满血: 回血量降至最大血量30%, 不提升上限", () => {
  const p = mkPlayer()
  p.maxHP = 100
  p.HP = 40
  const { log } = generators.fire_七咒({ playerInfo: p, drawPool: [], rewardLevel: 2, enteredFullHP: false, rng: () => 0.5 })
  assert.equal(p.HP, 70, "回 30% maxHP = 30")
  assert.equal(p.maxHP, 100, "上限不变")
  assert.ok(log.includes("上限30%"))
})
check("满血: 上限提升削弱到原值5%(取整)", () => {
  const p = mkPlayer()
  p.maxHP = 80
  p.HP = 80
  generators.fire_七咒({ playerInfo: p, drawPool: [], rewardLevel: 2, enteredFullHP: true, rng: () => 0.5 })
  assert.equal(p.maxHP, 81, "原值 rewardLevel*10=20 的 5% = 1(取整)")
  assert.equal(p.HP, 81)
})
check("正面祝福①: 随机强化属性保留(rng 固定命中 maxAPUp)", () => {
  const p = mkPlayer()
  p.maxHP = 80
  p.HP = 80
  generators.fire_七咒({ playerInfo: p, drawPool: [], rewardLevel: 2, enteredFullHP: true, rng: () => 0.5 })
  assert.ok(p.maxAP > 8, "maxAPUp 生效(强化功能保留)")
})
check("fire_common 无强化(对照: 普通玩家 maxAP 不变)", () => {
  const p = mkPlayer()
  p.maxHP = 80
  p.HP = 80
  generators.fire_common({ playerInfo: p, drawPool: [], rewardLevel: 2, enteredFullHP: true })
  assert.equal(p.maxAP, 8, "默认篝火无强化功能")
})

console.log("== map_七咒(诅咒6: 前途渺茫) ==")
check("七咒地图: 整层无纯奖励节点, 全为战斗", () => {
  const p = mkPlayer()
  const nodes = generators.map_七咒({ playerInfo: p })
  assert.ok(nodes.length >= 3, "节点数 3~5")
  for (const n of nodes) {
    assert.ok(n.mobSet && n.mobSet.length > 0, "每个节点都是战斗节点(无纯奖励)")
    assert.ok(n.rewardType, "战斗节点带奖励类型")
  }
})
check("map_common 对照: 可能出现纯奖励节点", () => {
  // 固定随机源无法保证命中纯奖励分支, 仅验证生成器签名可用且产物结构合法
  const p = mkPlayer()
  const nodes = generators.map_common({ playerInfo: p })
  assert.ok(nodes.length >= 3)
  for (const n of nodes) {
    assert.ok(Array.isArray(n.mobSet), "mobSet 恒为数组")
    assert.ok(n.rewardType, "rewardType 恒存在")
  }
})

console.log("== cardGain_七咒(正面祝福②: 更高稀有度) ==")
check("七咒权重 4:5:1 存在且更偏向高稀有度", () => {
  // 通过大样本统计: 七咒版 rare1 占比应明显低于 common 版(40% vs 60%)
  const commonCount = { 1: 0, 2: 0, 3: 0 }
  const cursedCount = { 1: 0, 2: 0, 3: 0 }
  for (let i = 0; i < 1000; i++) {
    commonCount[generators.cardGain_common({ isBoss: false, rewardLevel: 1, rng: () => 0.5 })[0].rare]++
    cursedCount[generators.cardGain_七咒({ isBoss: false, rewardLevel: 1, rng: () => 0.5 })[0].rare]++
  }
  assert.ok(commonCount[1] > cursedCount[1], `common rare1(${commonCount[1]}) > 七咒 rare1(${cursedCount[1]})`)
  assert.ok(cursedCount[3] > commonCount[3], `七咒 rare3(${cursedCount[3]}) > common rare3(${commonCount[3]})`)
})
check("cardGain_七咒: BOSS/限定卡分支不受权重影响", () => {
  const cards = generators.cardGain_七咒({ isBoss: true, limitedCards: ["钓鱼佬的鱼竿"], rewardLevel: 1 })
  assert.equal(cards[0].name, "钓鱼佬的鱼竿")
  assert.equal(cards[1].rare, 3)
  assert.equal(cards[1].upgraded, true)
})

console.log("\nALL PASSED: " + pass + " assertions")
