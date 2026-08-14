// smoke28: reward 区域模块(2026-08-14 自 reward.ux/shop.ux 抽出) —— fire/fusion/cardGain/upgrade/recycle/relic/shop
import assert from "node:assert/strict"
import { drawMaterials, computeFusion, consumeMaterials } from "./.cache/esm/pages/reward/fusion.mjs"
import { rollCampfire } from "./.cache/esm/pages/reward/fire.mjs"
import { buildRewardCards, rareWeights } from "./.cache/esm/pages/reward/cardGain.mjs"
import { upgradeRandomCard } from "./.cache/esm/pages/reward/upgrade.mjs"
import { calcRecycleNum, recycleGainTxt, calcRecycleGain } from "./.cache/esm/pages/reward/recycle.mjs"
import { buildRelicCandidates } from "./.cache/esm/pages/reward/relic.mjs"
import { generateShopGoods } from "./.cache/esm/pages/reward/shop.mjs"
import { createCard } from "./.cache/esm/common/data/cards.mjs"
import { createMob } from "./.cache/esm/common/data/mobs.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}

const mkPlayer = () => ({ HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, goldNum: 0, maxHoldCard: 10, getCardNum: 5, effect: [], relics: [] })

console.log("== 融合区(fusion.js) ==")
check("drawMaterials: 牌库>=2 取前2并保留索引", () => {
  const pool = [createCard("斩击", { level: 1 }), createCard("持盾", { level: 1 }), createCard("淬毒", { level: 1 })]
  const mats = drawMaterials(pool)
  assert.equal(mats.length, 2)
  assert.ok(mats.every(m => m.poolIndex >= 0), "素材保留原始索引")
})
check("drawMaterials: 牌库不足补临时卡(poolIndex=-1)", () => {
  const pool = [createCard("斩击", { level: 1 })]
  const mats = drawMaterials(pool)
  assert.equal(mats.length, 2)
  assert.equal(mats.filter(m => m.poolIndex === -1).length, 1)
  assert.equal(drawMaterials([]).filter(m => m.poolIndex === -1).length, 2)
})
check("computeFusion: rng 高 -> 取优(power/level 高, cost 低), 技能去重, rare=0", () => {
  const A = { power: 2, level: 1, costAP: 3, doSkill: ["a", "b"] }
  const B = { power: 9, level: 4, costAP: 1, doSkill: ["b", "c"] }
  const f = computeFusion(A, B, 1, () => 0.99) // rng*100=99 >= 55(goodRate) -> bad? 99>55 -> false!
  // goodRate = min(50+5,95)=55; rng()*100 < 55 为 good; 0.99*100=99 -> bad(取差)
  assert.equal(f.power, 2, "bad -> 取小")
  assert.equal(f.level, 1, "bad -> 取小")
  assert.equal(f.costAP, 3, "bad -> 取大")
  assert.deepEqual(f.doSkill, ["a", "b", "c"])
  assert.equal(f.rare, 0)
  assert.ok(f.uid)
})
check("computeFusion: rng 低 -> 取劣", () => {
  const A = { power: 2, level: 1, costAP: 3 }
  const B = { power: 9, level: 4, costAP: 1 }
  const f = computeFusion(A, B, 1, () => 0.01) // 1 < 55 -> good(取优)
  assert.equal(f.power, 9)
  assert.equal(f.level, 4)
  assert.equal(f.costAP, 1)
})
check("consumeMaterials: 从大到小 splice, 跳过 -1", () => {
  const pool = [createCard("斩击", { level: 1 }), createCard("持盾", { level: 1 }), createCard("淬毒", { level: 1 }), createCard("治愈之光", { level: 1 })]
  const before = pool.length
  consumeMaterials(pool, [{ card: {}, poolIndex: 3 }, { card: {}, poolIndex: -1 }, { card: {}, poolIndex: 1 }])
  assert.equal(pool.length, before - 2)
})

console.log("== 篝火(fire.js) ==")
check("rollCampfire: 满血 -> 提升上限并回满, 强化选项生效(rng 固定命中 maxAPUp)", () => {
  const p = mkPlayer()
  p.maxHP = 80
  p.HP = 80
  const pool = [createCard("斩击", { level: 1 })]
  const rng = () => 0.5 // 权重池 8 项: floor(0.5*8)=4 -> maxAPUp; Box-Muller u=0.5
  const { log } = rollCampfire({ playerInfo: p, playCardPool: pool, rlevel: 2, enteredFullHP: true, rng })
  assert.equal(p.maxHP, 100, "上限 +rlevel*10")
  assert.equal(p.HP, 100)
  assert.ok(p.maxAP > 8, "maxAPUp 生效")
  assert.ok(log.includes("最大行动点"))
})
check("rollCampfire: 非满血 -> 仅回复60%封顶, 不提升上限", () => {
  const p = mkPlayer()
  p.maxHP = 100
  p.HP = 40
  const pool = []
  const rng = () => 0.5
  const { log } = rollCampfire({ playerInfo: p, playCardPool: pool, rlevel: 2, enteredFullHP: false, rng })
  assert.equal(p.HP, 100, "回复 60% 封顶满血")
  assert.equal(p.maxHP, 100, "上限不变")
  assert.ok(log.includes("恢复"))
})
check("rollCampfire: cardUpgrade 命中且牌库为空 -> 提示", () => {
  const p = mkPlayer()
  const rng = () => 0 // floor(0)=0 -> cardUpgrade
  const { log } = rollCampfire({ playerInfo: p, playCardPool: [], rlevel: 2, enteredFullHP: true, rng })
  assert.ok(log.includes("牌库为空"))
})

console.log("== 强化(upgrade.js) ==")
check("upgradeRandomCard: 空牌库 -> null", () => assert.equal(upgradeRandomCard([]), null))
check("upgradeRandomCard: 未强化卡存在 -> upgraded 模式", () => {
  const pool = [createCard("斩击", { level: 1 }), createCard("持盾", { level: 1 })]
  const r = upgradeRandomCard(pool)
  assert.equal(r.mode, "upgraded")
  const upgraded = pool.find(c => c.upgraded === true)
  assert.ok(upgraded, "存在强化完成的卡")
})
check("upgradeRandomCard: 全部已强化 -> boost 模式 power+1", () => {
  const pool = [createCard("斩击", { level: 1 }), createCard("持盾", { level: 1 })]
  pool.forEach(c => { c.upgraded = true })
  const before = pool.map(c => c.power)
  const r = upgradeRandomCard(pool)
  assert.equal(r.mode, "boost")
  assert.ok(pool.some((c, i) => c.power === before[i] + 1), "被选中的卡 power+1 生效")
})

console.log("== 获得卡牌(cardGain.js) ==")
check("buildRewardCards: 普通三选一, 稀有度 1~3", () => {
  const cards = buildRewardCards({ isBoss: false, rlevel: 1, rng: () => 0.5 })
  assert.equal(cards.length, 3)
  assert.ok(cards.every(c => [1, 2, 3].includes(c.rare)))
})
check("buildRewardCards: BOSS+限定卡 -> 选项0为限定卡, 其余 rare3 必强化", () => {
  const cards = buildRewardCards({ isBoss: true, limitedCards: ["钓鱼佬的鱼竿"], rlevel: 1 })
  assert.equal(cards[0].name, "钓鱼佬的鱼竿")
  assert.equal(cards[1].rare, 3)
  assert.equal(cards[1].upgraded, true)
  assert.equal(cards[2].upgraded, true)
})
check("rareWeights 权重和为 10", () => assert.equal(rareWeights.reduce((s, r) => s + r.weight, 0), 10))

console.log("== 回收(recycle.js) ==")
check("calcRecycleNum: 向上取整(rlevel/2)", () => {
  assert.equal(calcRecycleNum(1), 1)
  assert.equal(calcRecycleNum(5), 3)
})
check("recycleGainTxt: 复用统一经济公式", () => {
  const card = createCard("斩击", { level: 2 }) // rare1 level2
  assert.equal(calcRecycleGain(3, card), 6) // 3*2*1
  assert.equal(recycleGainTxt(3, card), "回收: 6 金币")
})

console.log("== 遗物(relic.js) ==")
check("buildRelicCandidates: 排除已拥有", () => {
  const p = mkPlayer()
  p.relics = [{ key: "relic_burningBlood" }]
  const cands = buildRelicCandidates(p, 3)
  assert.equal(cands.length, 3)
  assert.ok(cands.every(c => c.key !== "relic_burningBlood"))
})

console.log("== 商店(shop.js, 合并自 shop.ux) ==")
check("generateShopGoods: 3卡牌+1奖励+1遗物 = 5 件", () => {
  const p = mkPlayer()
  const goods = generateShopGoods({ playerInfo: p, rlevel: 2, rng: () => 0.5 })
  assert.equal(goods.length, 5)
  assert.equal(goods.filter(g => g.type === "card").length, 3)
  assert.equal(goods.filter(g => g.type === "reward").length, 1)
  assert.equal(goods.filter(g => g.type === "relic").length, 1)
  assert.ok(goods.every(g => g.price > 0))
})
check("generateShopGoods: 遗物商品 apply 挂载遗物", () => {
  const p = mkPlayer()
  const goods = generateShopGoods({ playerInfo: p, rlevel: 2, rng: () => 0.5 })
  const relicGoods = goods.find(g => g.type === "relic")
  relicGoods.apply(p, [])
  assert.equal(p.relics.length, 1)
})
check("generateShopGoods: 卡牌商品 apply 入牌库", () => {
  const p = mkPlayer()
  const pool = []
  const goods = generateShopGoods({ playerInfo: p, rlevel: 2, rng: () => 0.5 })
  goods.find(g => g.type === "card").apply(p, pool)
  assert.equal(pool.length, 1)
})
check("生成商品不修改玩家状态(只读)", () => {
  const p = mkPlayer()
  const goldBefore = p.goldNum
  generateShopGoods({ playerInfo: p, rlevel: 2, rng: () => 0.5 })
  assert.equal(p.goldNum, goldBefore)
})

console.log("\nALL PASSED: " + pass + " assertions")
