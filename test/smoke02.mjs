// smoke02: 经济(回收价/商店价/回收流程/商店购买)
import assert from "node:assert/strict"
import { createCard } from "./.cache/esm/data/cards.mjs"
import { calcRecycleGain, calcShopPrice } from "./.cache/esm/core/economy.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}

console.log("== 经济公式 ==")
const card = createCard("横扫", { level: 2 }) // rare2 lv2
check("回收价 = 关卡3×lv2×rare2 = 12", () => assert.equal(calcRecycleGain(3, card), 12))
check("商店价 = ceil(12×1.5) = 18", () => assert.equal(calcShopPrice(3, card), 18))
check("旧卡无 rare 取 2", () => {
  const legacy = { name: "旧卡", level: 1 }
  assert.equal(calcRecycleGain(3, legacy), 6)
})

console.log("== 回收流程 ==")
const pool = [createCard("斩击", { level: 1 }), createCard("横扫", { level: 2 }), createCard("持盾", { level: 1 })]
const player = { goldNum: 0 }
let recycledNum = 0
const maxRecycleNum = Math.ceil(3 / 2) // rlevel3 -> 2张
function recycle(c) {
  if (recycledNum >= maxRecycleNum) return "上限"
  const gain = calcRecycleGain(3, c)
  player.goldNum += gain
  recycledNum += 1
  const idx = pool.indexOf(c)
  if (idx !== -1) pool.splice(idx, 1)
  return gain
}
check("回收斩击 +3", () => assert.equal(recycle(pool[0]), 3))
check("回收横扫 +12, 累计15", () => {
  assert.equal(recycle(pool[0]), 12)
  assert.equal(player.goldNum, 15)
})
check("上限拦截", () => assert.equal(recycle(pool[0]), "上限"))
check("牌库剩1张", () => assert.equal(pool.length, 1))

console.log("== 商店购买 ==")
const buyer = { goldNum: 100 }
const goodsPool = []
const goods = { type: "card", price: 18, sold: false, apply(p, pl) { pl.push(card) } }
function buy(g) {
  if (g.sold) return "已售"
  if (buyer.goldNum < g.price) return "金币不足"
  buyer.goldNum -= g.price
  g.apply(buyer, goodsPool)
  g.sold = true
  return "ok"
}
check("买卡: 金币100->82, 卡入牌库", () => {
  assert.equal(buy(goods), "ok")
  assert.equal(buyer.goldNum, 82)
  assert.equal(goodsPool.length, 1)
})
check("已售拦截", () => assert.equal(buy(goods), "已售"))
check("金币不足拦截", () => {
  const g2 = { price: 999, sold: false, apply() {} }
  assert.equal(buy(g2), "金币不足")
})

console.log("\nALL PASSED: " + pass + " assertions")
