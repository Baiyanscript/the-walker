// smoke31: 需求.md 2026-08-16 A组——①术石改名(spellstone+术石·前缀) ②非欧立方迁移七咒专属BOSS卡
// ③虚空珍珠(七咒术石: 回合结束全场5伤+死亡35%复活) ④天体果实(七咒遗物) ⑤倒转之启(七咒卡) ⑥衔尾蛇改BOSS专属
import assert from "node:assert/strict"
import { createCard, createCardByRare, isCardEligible, card_LIB } from "./.cache/esm/common/data/cards.mjs"
import { relic_LIB, rollRelicCandidates, gainRelic } from "./.cache/esm/common/data/relics.mjs"
import { generators } from "./.cache/esm/common/data/generators.mjs"
import { buildSkillCtx, runSkill } from "./.cache/esm/common/core/core_skill.mjs"
import { fireEffect } from "./.cache/esm/common/core/core_effect.mjs"
import { createMob } from "./.cache/esm/common/data/mobs.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}
const mkPlayer = (over = {}) => ({ HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, goldNum: 0, maxHoldCard: 10, getCardNum: 5, effect: [], relics: [], ...over })

console.log("== ① 术石改名(spellstone + 术石·前缀) ==")
check("魔像之心/复苏之叶: slot=spellstone, 名字带术石·", () => {
  assert.equal(relic_LIB.relic_golemHeart.slot, "spellstone")
  assert.equal(relic_LIB.relic_leafOfRevival.slot, "spellstone")
  assert.ok(relic_LIB.relic_golemHeart.name.startsWith("术石·"))
  assert.ok(relic_LIB.relic_leafOfRevival.name.startsWith("术石·"))
})
check("同 slot 替换仍有效(改名后)", () => {
  const p = mkPlayer()
  gainRelic(p, "relic_golemHeart")
  gainRelic(p, "relic_leafOfRevival") // 同槽 -> 替换
  assert.equal(p.relics.length, 1)
  assert.equal(p.relics[0].key, "relic_leafOfRevival")
  assert.ok(!p.effect.some(e => e.key === "effect_relic_golemHeart"), "旧遗物效果移除")
})

console.log("== ② 非欧立方(七咒专属BOSS卡) ==")
check("模板: rare3, limit=[七咒,BOSS], isStrict=true", () => {
  const c = createCard("非欧立方", { level: 1 })
  assert.equal(c.rare, 3)
  assert.deepEqual(c.limit, ["七咒", "BOSS"])
  assert.equal(card_LIB["非欧立方"].isStrict, true)
})
check("七咒玩家 BOSS 战可出, 其余场景全部拒", () => {
  assert.equal(isCardEligible("非欧立方", ["七咒", "BOSS"]), true)
  for (const RL of [[], ["BOSS"], ["七咒"], ["老渔夫"], ["BOSS", "老渔夫"]]) {
    assert.equal(isCardEligible("非欧立方", RL), false, `RL=[${RL}] 应拒`)
  }
})

console.log("== ③ 虚空珍珠(七咒术石遗物) ==")
check("模板: 术石槽+limit七咒+rare3", () => {
  assert.equal(relic_LIB.relic_voidPearl.slot, "spellstone")
  assert.deepEqual(relic_LIB.relic_voidPearl.limit, ["七咒"])
  assert.equal(relic_LIB.relic_voidPearl.rare, 3)
  assert.ok(relic_LIB.relic_voidPearl.name.startsWith("术石·"))
})
check("遗物 limit 链路: 七咒来源可见, 普通玩家不可见", () => {
  assert.ok(rollRelicCandidates(99, [], {sources: ["七咒"]}).some(r => r.key === "relic_voidPearl"))
  assert.ok(!rollRelicCandidates(99, [], {sources: []}).some(r => r.key === "relic_voidPearl"))
  assert.ok(!rollRelicCandidates(99, [], {sources: ["BOSS"]}).some(r => r.key === "relic_voidPearl"))
})
check("回合结束(post)对全体敌人造成5伤", () => {
  const p = mkPlayer()
  gainRelic(p, "relic_voidPearl")
  const mobs = [createMob("史莱姆", { level: 1 }), createMob("哥布林", { level: 1 })] // HP 10 / 15
  fireEffect({ trigger: "when_turnEnd", targets: p, exDate: { phase: "post" }, mobList: mobs, playerInfo: p })
  assert.equal(mobs[0].HP, 5, "史莱姆 -5")
  assert.equal(mobs[1].HP, 10, "哥布林 -5")
})
check("死亡 35% 概率复活至满血(mock 随机)", () => {
  const orig = Math.random
  try {
    Math.random = () => 0.3 // < 0.35 -> 复活
    const p = mkPlayer()
    gainRelic(p, "relic_voidPearl")
    p.HP = 0
    fireEffect({ trigger: "when_death", targets: p, mobList: [], playerInfo: p })
    assert.equal(p.HP, 100, "复活至满血")
    assert.ok(p.effect.some(e => e.key === "effect_relic_voidPearl"), "遗物效果保留(每次死亡独立掷骰)")

    Math.random = () => 0.9 // >= 0.35 -> 不复活
    const p2 = mkPlayer()
    gainRelic(p2, "relic_voidPearl")
    p2.HP = 0
    fireEffect({ trigger: "when_death", targets: p2, mobList: [], playerInfo: p2 })
    assert.equal(p2.HP, 0, "掷骰失败不复活")
  } finally { Math.random = orig }
})

console.log("== ④ 天体果实(七咒遗物) ==")
check("onGain: 生命回满 +20 上限; limit 七咒专属", () => {
  assert.deepEqual(relic_LIB.relic_celestialFruit.limit, ["七咒"])
  const p = mkPlayer({ HP: 30 })
  assert.ok(gainRelic(p, "relic_celestialFruit"))
  assert.equal(p.maxHP, 120, "上限 +20")
  assert.equal(p.HP, 120, "生命回满")
})

console.log("== ⑤ 倒转之启(七咒卡) ==")
check("模板: rare3 limit七咒 cost3 power3", () => {
  const c = createCard("倒转之启", { level: 1 })
  assert.equal(c.rare, 3)
  assert.deepEqual(c.limit, ["七咒"])
  assert.equal(c.costAP, 3)
  assert.equal(c.power, 3)
})
check("输出 = max(3, floor(effect长度/3)) 的斩击", () => {
  const mob = createMob("史莱姆", { level: 1 }) // HP 10
  const startHP = mob.HP
  const cases = [
    { effectLen: 0, expect: 3 },   // 0/3 -> 至少3
    { effectLen: 9, expect: 3 },   // 9/3 = 3
    { effectLen: 15, expect: 5 },  // 15/3 = 5
    { effectLen: 30, expect: 10 }  // 30/3 = 10
  ]
  for (const { effectLen, expect } of cases) {
    const p = mkPlayer()
    p.effect = Array.from({ length: effectLen }, (_, i) => ({ key: "fake_" + i }))
    const card = createCard("倒转之启", { level: 1 })
    const ctx = buildSkillCtx({ source: card, actor: p, target: mob, targetIndex: 0, playerInfo: p, mobList: [mob], handPool: [], drawPool: [] })
    runSkill("skill_card_invertedBegin", ctx)
    assert.equal(startHP - mob.HP, expect, `effect长度${effectLen} -> ${expect}伤`)
    mob.HP = startHP // 复位
  }
})
check("七咒专属: 普通奖励抽不到, 七咒来源可见", () => {
  for (let i = 0; i < 50; i++) {
    const c = createCardByRare({ rare: 3, limit: [], allowCommon: true }, { level: 1 })
    assert.notEqual(c.tplKey, "倒转之启", "普通来源不应出倒转之启")
  }
  const c = createCardByRare({ rare: 3, limit: ["七咒"], allowCommon: true }, { level: 1 })
  assert.ok(["倒转之启", "不死图腾", "代偿", "火焰新星", "模仿者", "斩·夺", "北斗长弓", "dio的飞刀", "美国小伙", "中东小伙"].includes(c.tplKey))
})

console.log("== ⑥ 衔尾蛇(改 BOSS 专属) ==")
check("模板: rare3 + limit BOSS", () => {
  const c = createCard("衔尾蛇", { level: 1 })
  assert.equal(c.rare, 3)
  assert.deepEqual(c.limit, ["BOSS"])
  assert.deepEqual(c.doSkill, ["skill_card_ouroboros", "skill_shared_attack"])
})
check("BOSS 战可出, 普通奖励/七咒普通不可见", () => {
  assert.equal(isCardEligible("衔尾蛇", ["BOSS"]), true)
  assert.equal(isCardEligible("衔尾蛇", ["七咒"]), false, "七咒普通奖励不见衔尾蛇")
  assert.equal(isCardEligible("衔尾蛇", []), false)
  for (let i = 0; i < 50; i++) {
    const c = createCardByRare({ rare: 3, limit: [], allowCommon: true }, { level: 1 })
    assert.notEqual(c.tplKey, "衔尾蛇", "普通奖励不出衔尾蛇")
  }
})
check("cardGain 链路: 七咒玩家 BOSS 战候选含非欧立方+衔尾蛇", () => {
  for (let i = 0; i < 20; i++) {
    const cards = generators.cardGain_common({ isBoss: true, sources: ["七咒", "BOSS"], rewardLevel: 1 })
    for (const c of cards) {
      assert.ok(["不洁之血(融材)", "非欧立方", "启示录", "钓鱼佬的鱼竿", "衔尾蛇"].includes(c.tplKey) || !(c.limit || []).includes("BOSS"),
        `七咒BOSS战不应出现 ${c.name}`)
    }
  }
})

console.log("\nALL PASSED: " + pass + " assertions")
