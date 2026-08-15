// smoke18: 杀戮尖塔化——卡牌一次性强化(upgradeCard) + 遗物系统(gainRelic/效果触发)
import assert from "node:assert/strict"
import { createCard, createCardByRare, upgradeCard, card_LIB } from "./.cache/esm/common/data/cards.mjs"
import { gainRelic, rollRelicCandidates, relic_LIB, getRelicDetail } from "./.cache/esm/common/data/relics.mjs"
import { fireEffect } from "./.cache/esm/common/core/core_effect.mjs"
import { buildSkillCtx } from "./.cache/esm/common/core/core_skill.mjs"
import { createMob } from "./.cache/esm/common/data/mobs.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}

console.log("== 一次性强化 upgradeCard ==")
check("斩击强化: power 8->12, 名字带+, 标记 upgraded", () => {
  const c = createCard("斩击", { level: 1 })
  assert.equal(c.upgraded, false)
  assert.ok(upgradeCard(c))
  assert.equal(c.power, 12)
  assert.equal(c.level, 1)
  assert.equal(c.costAP, 1)
  assert.equal(c.upgraded, true)
  assert.equal(c.name, "斩击+")
})
check("已强化卡拒绝二次强化", () => {
  const c = createCard("斩击", { level: 1 })
  upgradeCard(c)
  const before = JSON.stringify(c)
  assert.equal(upgradeCard(c), false)
  assert.equal(JSON.stringify(c), before)
})
check("横扫强化: costAP 4->3", () => {
  const c = createCard("横扫", { level: 2 })
  upgradeCard(c)
  assert.equal(c.costAP, 3)
  assert.equal(c.power, 3)
})
check("createCard upgraded:true 创建即强化版", () => {
  const c = createCard("持盾", { level: 1, upgraded: true })
  assert.equal(c.upgraded, true)
  assert.equal(c.power, 8) // 5+3
  assert.equal(c.name, "持盾+")
  assert.equal(c.tplKey, "持盾")
})
check("createCardByRare 透传 upgraded", () => {
  const c = createCardByRare(1, { level: 1, upgraded: true })
  assert.equal(c.upgraded, true)
})
check("旧存档兼容: 无 tplKey 按 name 回退模板", () => {
  const legacy = { uid: "x", name: "斩击", level: 1, power: 8, costAP: 1, doSkill: ["skill_shared_attack"] }
  assert.ok(upgradeCard(legacy))
  assert.equal(legacy.power, 12)
  assert.equal(legacy.name, "斩击+")
})
check("无模板卡(融合卡)兜底 level+1", () => {
  const fusion = { uid: "y", name: "融合卡", level: 2, power: 5, costAP: 1, doSkill: [] }
  assert.ok(upgradeCard(fusion))
  assert.equal(fusion.level, 3)
  assert.equal(fusion.upgraded, true)
})
check("模板均有 upgrade 配置(status 状态卡除外)", () => {
  for (const key in card_LIB) {
    if (card_LIB[key].rare === "status") continue // 状态卡(粘液)不可强化
    assert.ok(card_LIB[key].upgrade, `模板 ${key} 缺 upgrade`)
  }
})

console.log("== 遗物: 获取 ==")
const player = { HP: 90, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [], relics: [], goldNum: 0 }
check("gainRelic 挂永久效果 + 记录条目", () => {
  assert.ok(gainRelic(player, "relic_burningBlood"))
  const eff = player.effect.find(e => e.key === "effect_relic_burningBlood")
  assert.ok(eff)
  assert.equal(eff.restTurn, "inf")
  assert.equal(player.relics.length, 1)
  assert.equal(player.relics[0].name, "燃烧之血")
})
check("同名遗物唯一: 重复获取拒绝", () => {
  const before = player.effect.length
  assert.equal(gainRelic(player, "relic_burningBlood"), false)
  assert.equal(player.effect.length, before)
  assert.equal(player.relics.length, 1)
})
check("草莓 onGain: 最大生命+7 并回 7 血", () => {
  const p2 = { HP: 50, maxHP: 100, effect: [], relics: [] }
  assert.ok(gainRelic(p2, "relic_strawberry"))
  assert.equal(p2.maxHP, 107)
  assert.equal(p2.HP, 57)
  assert.equal(p2.effect.length, 0) // 无效果, 纯即时生效
  assert.equal(p2.relics[0].key, "relic_strawberry")
})
check("rollRelicCandidates: 3 个不重复", () => {
  const list = rollRelicCandidates(3)
  assert.equal(list.length, 3)
  const keys = list.map(r => r.key)
  assert.equal(new Set(keys).size, 3)
  assert.ok(list.every(r => r.name && r.desc))
})
check("getRelicDetail", () => {
  assert.ok(getRelicDetail("relic_lantern").includes("灯笼"))
  assert.equal(getRelicDetail("不存在的遗物"), "?")
})

console.log("== 遗物: 效果触发 ==")
const mkPlayer = () => ({ HP: 90, maxHP: 100, AP: 8, maxAP: 8, DP: 0, effect: [], relics: [] })
const mkMob = () => createMob("史莱姆", { level: 1 })

check("燃烧之血: when_stageend 回 6 血(封顶 maxHP)", () => {
  const p = mkPlayer()
  gainRelic(p, "relic_burningBlood")
  fireEffect({ trigger: "when_stageend", targets: p, mobList: [], playerInfo: p })
  assert.equal(p.HP, 96)
  // 效果仍在(遗物永久, 不因 stageend 销毁)
  assert.ok(p.effect.find(e => e.key === "effect_relic_burningBlood" && e.isRemove !== true))
})
check("燃烧之血: 满血时不溢出", () => {
  const p = mkPlayer()
  p.HP = 100
  gainRelic(p, "relic_burningBlood")
  fireEffect({ trigger: "when_stageend", targets: p, mobList: [], playerInfo: p })
  assert.equal(p.HP, 100)
})
check("金刚杵: when_act 出牌 power+1", () => {
  const p = mkPlayer()
  gainRelic(p, "relic_vajra")
  const card = createCard("斩击", { level: 1 })
  const mob = mkMob()
  const skillCtx = buildSkillCtx({ source: card, actor: p, target: mob, targetIndex: 0, playerInfo: p, mobList: [mob], handPool: [] })
  fireEffect({ trigger: "when_act", targets: p, exDate: { skillCtx }, mobList: [mob], playerInfo: p })
  assert.equal(skillCtx.power, 9) // 8+1
})
check("灯笼: when_fightstart AP+1", () => {
  const p = mkPlayer()
  gainRelic(p, "relic_lantern")
  fireEffect({ trigger: "when_fightstart", targets: p, mobList: [], playerInfo: p })
  assert.equal(p.AP, 9)
})
check("船锚: when_fightstart DP+10", () => {
  const p = mkPlayer()
  gainRelic(p, "relic_anchor")
  fireEffect({ trigger: "when_fightstart", targets: p, mobList: [], playerInfo: p })
  assert.equal(p.DP, 10)
})
check("开心花: 每 3 回合 AP+1(可突破上限)", () => {
  const p = mkPlayer()
  gainRelic(p, "relic_happyFlower")
  fireEffect({ trigger: "when_nextTurn", targets: p, mobList: [], playerInfo: p })
  fireEffect({ trigger: "when_nextTurn", targets: p, mobList: [], playerInfo: p })
  assert.equal(p.AP, 8) // 前两次未到 3
  fireEffect({ trigger: "when_nextTurn", targets: p, mobList: [], playerInfo: p })
  assert.equal(p.AP, 9) // 第 3 次 +1(突破 maxAP, 防"回合结束回满"钳制使遗物无效)
  fireEffect({ trigger: "when_nextTurn", targets: p, mobList: [], playerInfo: p })
  assert.equal(p.AP, 9) // 重新计数
  fireEffect({ trigger: "when_nextTurn", targets: p, mobList: [], playerInfo: p })
  fireEffect({ trigger: "when_nextTurn", targets: p, mobList: [], playerInfo: p })
  fireEffect({ trigger: "when_nextTurn", targets: p, mobList: [], playerInfo: p })
  assert.equal(p.AP, 10) // 第二个周期再 +1
})
check("毒瓶: when_fightstart 随机怪中毒", () => {
  const p = mkPlayer()
  gainRelic(p, "relic_poisonBottle")
  const mob = mkMob()
  fireEffect({ trigger: "when_fightstart", targets: p, mobList: [mob], playerInfo: p })
  const toxin = mob.effect.find(e => e.key === "effect_toxin")
  assert.ok(toxin)
  assert.equal(toxin.level, 1)
  assert.equal(toxin.restTurn, 3)
})
check("遗物效果跨触发时机保留(不误伤毒等机制)", () => {
  const p = mkPlayer()
  gainRelic(p, "relic_lantern")
  fireEffect({ trigger: "when_fightstart", targets: p, mobList: [], playerInfo: p })
  fireEffect({ trigger: "when_nextTurn", targets: p, mobList: [], playerInfo: p })
  assert.ok(p.effect.find(e => e.key === "effect_relic_lantern")) // 仍在
})

console.log("\nALL PASSED: " + pass + " assertions")
