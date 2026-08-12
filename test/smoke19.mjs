// smoke19: 杀戮尖塔化——牌堆机制(core/draw.js: 弃牌堆洗回/手牌回收) + 消耗(exhaust)标记
import assert from "node:assert/strict"
import { refillDrawPool, recycleHandToDiscard, shuffleArray } from "./.cache/esm/core/draw.mjs"
import { createCard } from "./.cache/esm/data/cards.mjs"

let pass = 0
function check(name, fn) {
  try { fn(); pass++; console.log("  OK " + name) } catch (e) { console.error("  FAIL " + name); throw e }
}

console.log("== 洗牌 shuffleArray ==")
check("洗牌后元素齐全(不增不减不丢)", () => {
  const arr = [1, 2, 3, 4, 5]
  shuffleArray(arr)
  assert.equal(arr.length, 5)
  assert.deepEqual([...arr].sort(), [1, 2, 3, 4, 5])
})
check("多次洗牌后顺序大概率变化", () => {
  const orig = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  let same = 0
  for (let i = 0; i < 50; i++) {
    const a = [...orig]
    shuffleArray(a)
    if (a.every((v, idx) => v === orig[idx])) same++
  }
  assert.ok(same < 5, `50次洗牌中 ${same} 次顺序未变`)
})

console.log("== refillDrawPool: 抽牌堆空时弃牌堆洗回 ==")
check("空抽牌堆 + 有弃牌堆: 全部洗回, 弃牌堆清空", () => {
  const draw = []
  const discard = [{ id: 1 }, { id: 2 }, { id: 3 }]
  assert.ok(refillDrawPool(draw, discard))
  assert.equal(draw.length, 3)
  assert.equal(discard.length, 0)
  const ids = draw.map(c => c.id).sort()
  assert.deepEqual(ids, [1, 2, 3])
})
check("抽牌堆非空: 不洗牌, 不动弃牌堆", () => {
  const draw = [{ id: 9 }]
  const discard = [{ id: 1 }]
  assert.equal(refillDrawPool(draw, discard), false)
  assert.equal(draw.length, 1)
  assert.equal(discard.length, 1)
})
check("双堆全空: 无事发生返回 false", () => {
  assert.equal(refillDrawPool([], []), false)
})
check("非法入参容错", () => {
  assert.equal(refillDrawPool(null, []), false)
  assert.equal(refillDrawPool([], null), false)
})

console.log("== recycleHandToDiscard: 回合结束手牌入弃牌 ==")
check("手牌全部回收, 弃牌堆追加", () => {
  const hand = [{ id: 1 }, { id: 2 }]
  const discard = [{ id: 9 }]
  const count = recycleHandToDiscard(hand, discard)
  assert.equal(count, 2)
  assert.equal(hand.length, 0)
  assert.equal(discard.length, 3)
})
check("空手牌: 无事发生", () => {
  const discard = []
  assert.equal(recycleHandToDiscard([], discard), 0)
  assert.equal(discard.length, 0)
})

console.log("== 完整循环: 打出 -> 弃牌 -> 洗回 -> 再抽到 ==")
check("小牌库循环不产生保底卡", () => {
  const pool = [createCard("斩击", { level: 1 }), createCard("持盾", { level: 1 })]
  const discard = []
  const hand = []
  let fallbackCount = 0

  // 模拟 6 回合: 每回合抽 2 张, 打出的牌/回合结束手牌进弃牌堆, 抽牌堆空时洗回
  for (let round = 0; round < 6; round++) {
    for (let i = 0; i < 2; i++) {
      if (pool.length === 0) refillDrawPool(pool, discard)
      if (pool.length > 0) {
        const idx = Math.floor(Math.random() * pool.length)
        hand.push(pool.splice(idx, 1)[0])
      } else {
        fallbackCount++
      }
    }
    // 模拟"全部打出 + 回合结束回收": 手牌进弃牌堆
    recycleHandToDiscard(hand, discard)
  }
  assert.equal(fallbackCount, 0, "弃牌循环下不应触发保底")
  assert.equal(hand.length, 0)
  assert.equal(pool.length + discard.length, 2, "两张牌始终在循环中(抽牌堆+弃牌堆), 无凭空生成/丢失")
  assert.ok([...pool, ...discard].every(c => c.name !== "牌库已空"))
})

console.log("== 消耗(exhaust)标记 ==")
check("不死图腾模板带 exhaust", () => {
  const c = createCard("不死图腾", { level: 1 })
  assert.equal(c.exhaust, true)
})
check("普通卡无 exhaust", () => {
  const c = createCard("斩击", { level: 1 })
  assert.equal(c.exhaust, undefined)
})
check("exhaust 卡不进弃牌堆(useCard 层语义)", () => {
  const pool = [createCard("不死图腾", { level: 1 })]
  const discard = []
  const hand = []
  // 模拟打出: 从手牌移除, exhaust 卡不回弃牌堆
  const card = pool.splice(0, 1)[0]
  hand.push(card)
  const played = hand.splice(0, 1)[0]
  if (played && played.exhaust !== true) discard.push(played)
  assert.equal(discard.length, 0, "exhaust 卡不应进入弃牌堆")
  // 对照: 普通卡进弃牌堆
  const atk = createCard("斩击", { level: 1 })
  if (atk && atk.exhaust !== true) discard.push(atk)
  assert.equal(discard.length, 1)
})

console.log("\nALL PASSED: " + pass + " assertions")
