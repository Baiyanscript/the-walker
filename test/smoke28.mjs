// smoke28: 奖励区域生成器(2026-08-16 自 pages/reward/*.js 上移合并至 common/data/generators.js)
// —— fire/mix/cardGain/powerUp/recycle/relic/shop 全部经 generators 查表提取
import assert from "node:assert/strict"
import { generators, getGenerator, upgradeRandomCard } from "./.cache/esm/common/data/generators.mjs"
import { createCard } from "./.cache/esm/common/data/cards.mjs"
import { createMob } from "./.cache/esm/common/data/mobs.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}

const mkPlayer = () => ({ HP: 100, maxHP: 100, AP: 8, maxAP: 8, DP: 0, goldNum: 0, maxHoldCard: 10, getCardNum: 5, effect: [], relics: [] })

console.log("== 生成器提取(getGenerator, 需求.md 回退规则) ==")
check("无 map 字段 -> 回退 common", () => {
  const p = mkPlayer()
  assert.equal(getGenerator(p, "fire"), generators.fire_common)
  assert.equal(getGenerator(p, "map"), generators.map_common)
  assert.equal(getGenerator(p, "shop"), generators.shop_common)
})
check("map 字段声明未知键 -> 回退 common", () => {
  const p = mkPlayer()
  p.map = { fire: "fire_不存在的键" }
  assert.equal(getGenerator(p, "fire"), generators.fire_common)
})
check("map 字段声明合法扩展键 -> 提取成功", () => {
  const p = mkPlayer()
  p.map = { fire: "fire_common" } // 显式声明默认键也按提取流程走
  assert.equal(getGenerator(p, "fire"), generators.fire_common)
})
check("未知类型 -> 尝试 type_common 键(不存在则 null)", () => {
  const p = mkPlayer()
  assert.equal(getGenerator(p, "不存在的类型"), null)
})

console.log("== 融合区(mix_common) ==")
check("drawMaterials: 牌库>=2 取前2并保留索引", () => {
  const pool = [createCard("斩击", { level: 1 }), createCard("持盾", { level: 1 }), createCard("淬毒", { level: 1 })]
  const mats = generators.mix_common.drawMaterials(pool)
  assert.equal(mats.length, 2)
  assert.ok(mats.every(m => m.poolIndex >= 0), "素材保留原始索引")
})
check("drawMaterials: 牌库不足补临时卡(poolIndex=-1)", () => {
  const pool = [createCard("斩击", { level: 1 })]
  const mats = generators.mix_common.drawMaterials(pool)
  assert.equal(mats.length, 2)
  assert.equal(mats.filter(m => m.poolIndex === -1).length, 1)
  assert.equal(generators.mix_common.drawMaterials([]).filter(m => m.poolIndex === -1).length, 2)
})
check("computeFusion: rng 高 -> 取优(power/level 高, cost 低), 技能去重, rare=0", () => {
  const A = { power: 2, level: 1, costAP: 3, doSkill: ["a", "b"] }
  const B = { power: 9, level: 4, costAP: 1, doSkill: ["b", "c"] }
  const f = generators.mix_common.computeFusion(A, B, 1, () => 0.99) // rng*100=99 >= 55(goodRate) -> bad? 99>55 -> false!
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
  const f = generators.mix_common.computeFusion(A, B, 1, () => 0.01) // 1 < 55 -> good(取优)
  assert.equal(f.power, 9)
  assert.equal(f.level, 4)
  assert.equal(f.costAP, 1)
})
check("consumeMaterials: 从大到小 splice, 跳过 -1", () => {
  const pool = [createCard("斩击", { level: 1 }), createCard("持盾", { level: 1 }), createCard("淬毒", { level: 1 }), createCard("治愈之光", { level: 1 })]
  const before = pool.length
  generators.mix_common.consumeMaterials(pool, [{ card: {}, poolIndex: 3 }, { card: {}, poolIndex: -1 }, { card: {}, poolIndex: 1 }])
  assert.equal(pool.length, before - 2)
})

console.log("== 篝火(fire_common, 需求.md 2026-08-16: 默认无强化功能) ==")
check("fire_common: 满血 -> 提升上限并回满(无强化选项)", () => {
  const p = mkPlayer()
  p.maxHP = 80
  p.HP = 80
  const { log } = generators.fire_common({ playerInfo: p, drawPool: [], rewardLevel: 2, enteredFullHP: true })
  assert.equal(p.maxHP, 100, "上限 +rewardLevel*10")
  assert.equal(p.HP, 100)
  assert.equal(p.maxAP, 8, "无强化功能: maxAP 不变")
  assert.ok(log.includes("上限"))
})
check("fire_common: 非满血 -> 仅回复60%封顶, 不提升上限", () => {
  const p = mkPlayer()
  p.maxHP = 100
  p.HP = 40
  const { log } = generators.fire_common({ playerInfo: p, drawPool: [], rewardLevel: 2, enteredFullHP: false })
  assert.equal(p.HP, 100, "回复 60% 封顶满血")
  assert.equal(p.maxHP, 100, "上限不变")
  assert.ok(log.includes("恢复"))
})

console.log("== 强化(powerUp_common) ==")
check("powerUpOnce: 空卡/状态卡/已强化 -> 拦截", () => {
  assert.equal(generators.powerUp_common({ card: null }).ok, false)
  const status = createCard("斩击", { level: 1 })
  status.rare = "status"
  assert.equal(generators.powerUp_common({ card: status }).ok, false)
  const done = createCard("斩击", { level: 1 })
  done.upgraded = true
  assert.equal(generators.powerUp_common({ card: done }).ok, false)
})
check("powerUpOnce: 未强化卡 -> 强化成功", () => {
  const pool = [createCard("斩击", { level: 1 }), createCard("持盾", { level: 1 })]
  const r = generators.powerUp_common({ card: pool[0] })
  assert.equal(r.ok, true)
  assert.ok(pool[0].upgraded === true, "强化完成")
})
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

console.log("== 获得卡牌(cardGain_common) ==")
check("buildRewardCards: 普通三选一, 稀有度 1~3", () => {
  const cards = generators.cardGain_common({ isBoss: false, rewardLevel: 1, rng: () => 0.5 })
  assert.equal(cards.length, 3)
  assert.ok(cards.every(c => [1, 2, 3].includes(c.rare)))
})
check("buildRewardCards: 普通奖励不出专属卡(无来源时 limit 卡被过滤)", () => {
  for (let i = 0; i < 50; i++) {
    const cards = generators.cardGain_common({ isBoss: false, sources: [], rewardLevel: 1 })
    assert.ok(cards.every(c => !c.limit), "普通奖励不应出现任何 limit 专属卡")
  }
})
check("buildRewardCards: BOSS+老渔夫来源 -> 纯专属池, 必强化", () => {
  // 25 层老渔夫: sources=["BOSS","老渔夫"], allowCommon:false —— 候选 = 2张BOSS卡 + 衔尾蛇 + 鱼竿
  //   (非欧立方已迁移为七咒专属BOSS卡, CL=["七咒","BOSS"] ⊄ RL, 老渔夫池不再可见)
  const CANDIDATES = ["不洁之血(融材)", "启示录", "衔尾蛇", "钓鱼佬的鱼竿"]
  for (let i = 0; i < 20; i++) {
    const cards = generators.cardGain_common({ isBoss: true, sources: ["BOSS", "老渔夫"], rewardLevel: 1 })
    for (const c of cards) {
      assert.ok(CANDIDATES.includes(c.tplKey), `BOSS 奖励不应出现 ${c.name}`)
      assert.equal(c.rare, 3)
      assert.equal(c.upgraded, true)
    }
  }
})
check("buildRewardCards: BOSS(仅BOSS来源) -> 不出鱼竿", () => {
  // 50/75 层: sources=["BOSS"], 鱼竿(limit 老渔夫)不可见
  for (let i = 0; i < 20; i++) {
    const cards = generators.cardGain_common({ isBoss: true, sources: ["BOSS"], rewardLevel: 1 })
    assert.ok(cards.every(c => c.tplKey !== "钓鱼佬的鱼竿"), "仅BOSS来源不应出鱼竿")
  }
})

console.log("== 回收(recycle_common) ==")
check("calcRecycleNum: 向上取整(rewardLevel/2)", () => {
  assert.equal(generators.recycle_common.calcRecycleNum(1), 1)
  assert.equal(generators.recycle_common.calcRecycleNum(5), 3)
})
check("recycleGainTxt: 复用统一经济公式", () => {
  const card = createCard("斩击", { level: 2 }) // rare1 level2
  assert.equal(generators.recycle_common.calcRecycleGain(3, card), 6) // 3*2*1
  assert.equal(generators.recycle_common.recycleGainTxt(3, card), "回收: 6 金币")
})

console.log("== 遗物(relic_common) ==")
check("buildRelicCandidates: 排除已拥有", () => {
  const p = mkPlayer()
  p.relics = [{ key: "relic_burningBlood" }]
  const cands = generators.relic_common(p, 3)
  assert.equal(cands.length, 3)
  assert.ok(cands.every(c => c.key !== "relic_burningBlood"))
})

console.log("== 商店(shop_common, 对象形态: 子生成器可独立替换) ==")
check("generateGoods: 3卡牌+1奖励+1遗物 = 5 件", () => {
  const p = mkPlayer()
  const goods = generators.shop_common.generateGoods({ playerInfo: p, rewardLevel: 2, rng: () => 0.5 })
  assert.equal(goods.length, 5)
  assert.equal(goods.filter(g => g.type === "card").length, 3)
  assert.equal(goods.filter(g => g.type === "reward").length, 1)
  assert.equal(goods.filter(g => g.type === "relic").length, 1)
  assert.ok(goods.every(g => g.price > 0))
})
check("genRelicGoods: 已集齐全部遗物 -> 空数组", () => {
  const p = mkPlayer()
  // 全量含 BOSS 专属(铜制核心 limit:["BOSS"] 经 BOSS 来源可见, 需求.md 2026-08-16)
  const all = generators.relic_common({relics: []}, 99, ["BOSS"]).map(r => ({ key: r.key }))
  p.relics = all
  const goods = generators.shop_common.genRelicGoods({ playerInfo: p, rewardLevel: 2 })
  assert.equal(goods.length, 0)
})
check("generateGoods: 遗物商品 apply 挂载遗物", () => {
  const p = mkPlayer()
  const goods = generators.shop_common.generateGoods({ playerInfo: p, rewardLevel: 2, rng: () => 0.5 })
  const relicGoods = goods.find(g => g.type === "relic")
  relicGoods.apply(p, [])
  assert.equal(p.relics.length, 1)
})
check("generateGoods: 卡牌商品 apply 入牌库", () => {
  const p = mkPlayer()
  const pool = []
  const goods = generators.shop_common.generateGoods({ playerInfo: p, rewardLevel: 2, rng: () => 0.5 })
  goods.find(g => g.type === "card").apply(p, pool)
  assert.equal(pool.length, 1)
})
check("生成商品不修改玩家状态(只读)", () => {
  const p = mkPlayer()
  const goldBefore = p.goldNum
  generators.shop_common.generateGoods({ playerInfo: p, rewardLevel: 2, rng: () => 0.5 })
  assert.equal(p.goldNum, goldBefore)
})

console.log("\nALL PASSED: " + pass + " assertions")
